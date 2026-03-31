import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  area: string | null;
  industry: string | null;
  status: string | null;
  lead_score: number | null;
  do_not_contact: boolean | null;
  archived: boolean | null;
  next_follow_up_on: string | null;
  last_contacted_at: string | null;
  services: string[] | null;
  assigned_to_username: string | null;
  notes: string | null;
  lead_source: string | null;
  created_at: string | null;
  updated_at: string | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
};

type WorkflowTaskRow = {
  id: string;
  lead_id: string | null;
  title: string | null;
  task_type: string | null;
  status: string | null;
  priority: string | null;
  due_on: string | null;
};

type ActivityRow = {
  id: string;
  lead_id: string;
  created_at: string;
};

type OpportunityCard = LeadRow & {
  probability: number;
  weighted_value: number;
  priority_score: number;
  open_task_count: number;
  overdue_task_count: number;
  latest_task_due_on: string | null;
  latest_activity_at: string | null;
};

type OpportunityPageProps = {
  searchParams?: {
    owner?: string;
    view?: string;
    success?: string;
    error?: string;
  };
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function moneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  });
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function stageLabel(status: string | null | undefined) {
  const s = String(status ?? "").trim();
  return s || "New";
}

function isOpenStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function matchesView(view: string, status: string, taskCount: number, nextFollowUpOn: string | null | undefined, today: string) {
  const s = status.toLowerCase();
  const next = dateOnly(nextFollowUpOn);

  if (view === "all") return true;
  if (view === "open") return s !== "won" && s !== "lost";
  if (view === "quoted") return s === "quoted";
  if (view === "won") return s === "won";
  if (view === "dormant") return s === "dormant";
  if (view === "lost") return s === "lost";
  if (view === "needs-action") {
    return taskCount > 0 || (!!next && next <= today) || s === "quoted";
  }
  return true;
}

function probabilityForLead(lead: LeadRow) {
  const manual = Number(lead?.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead?.status ?? "").toLowerCase();

  if (status === "new") return 10;
  if (status === "to contact") return 15;
  if (status === "contacted") return 25;
  if (status === "follow up") return 40;
  if (status === "quoted") return 65;
  if (status === "won") return 100;
  if (status === "dormant") return 8;
  if (status === "lost") return 0;
  return 0;
}

function weightedValue(lead: LeadRow) {
  const value = Number(lead?.opportunity_value ?? 0);
  const probability = probabilityForLead(lead);
  return value * (probability / 100);
}

function priorityScore(
  lead: LeadRow,
  today: string,
  openTaskCount: number,
  overdueTaskCount: number,
  latestActivityAt: string | null
) {
  let score = Number(lead?.lead_score ?? 0);
  score += Math.round(probabilityForLead(lead) * 0.7);

  const value = Number(lead?.opportunity_value ?? 0);
  if (value >= 10000) score += 18;
  else if (value >= 5000) score += 12;
  else if (value > 0) score += 8;

  if (lead?.phone) score += 8;
  if (lead?.email) score += 6;

  const next = dateOnly(lead?.next_follow_up_on);
  if (next) {
    const diff = Math.floor(
      (new Date(today).getTime() - new Date(next).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diff > 3) score += 24;
    else if (diff >= 1) score += 18;
    else if (diff === 0) score += 14;
  }

  if (String(lead?.status ?? "").toLowerCase() === "quoted") score += 20;
  if (String(lead?.status ?? "").toLowerCase() === "follow up") score += 12;

  score += openTaskCount * 5;
  score += overdueTaskCount * 8;

  if (!latestActivityAt) score += 10;

  return Math.min(score, 100);
}

function badgeStyleForStatus(status: string | null | undefined): CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "won") {
    return {
      background: "rgba(0,160,80,0.14)",
      border: "1px solid rgba(0,160,80,0.18)",
      color: "#0b6b3a",
    };
  }

  if (s === "quoted") {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.16)",
      color: "#0b4fae",
    };
  }

  if (s === "follow up") {
    return {
      background: "rgba(255,180,0,0.14)",
      border: "1px solid rgba(255,180,0,0.18)",
      color: "#946200",
    };
  }

  if (s === "lost") {
    return {
      background: "rgba(180,0,0,0.12)",
      border: "1px solid rgba(180,0,0,0.16)",
      color: "#8f1b1b",
    };
  }

  if (s === "dormant") {
    return {
      background: "rgba(90,0,140,0.10)",
      border: "1px solid rgba(90,0,140,0.16)",
      color: "#5c2d91",
    };
  }

  return {
    background: "rgba(0,0,0,0.05)",
    border: "1px solid rgba(0,0,0,0.08)",
    color: "#111",
  };
}

function defaultFollowUpForStage(stage: string, today: Date) {
  const d = new Date(today);

  if (stage === "New") d.setDate(d.getDate() + 1);
  else if (stage === "To Contact") d.setDate(d.getDate() + 1);
  else if (stage === "Contacted") d.setDate(d.getDate() + 3);
  else if (stage === "Follow Up") d.setDate(d.getDate() + 2);
  else if (stage === "Quoted") d.setDate(d.getDate() + 3);
  else return null;

  return d.toISOString().slice(0, 10);
}

function taskBadgeLabel(openTaskCount: number, overdueTaskCount: number) {
  if (openTaskCount === 0) return "No open tasks";
  if (overdueTaskCount > 0) return `${openTaskCount} open / ${overdueTaskCount} overdue`;
  return `${openTaskCount} open task${openTaskCount === 1 ? "" : "s"}`;
}

export default async function OpportunityTrackingPage({
  searchParams,
}: OpportunityPageProps) {
  const supabase = createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const access = await getAccessContext();
  const canManage = !!access.user && canCreateCustomers(access);

  async function quickMoveStage(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(`/sales-hub/opportunities?error=${encodeURIComponent("You do not have permission to update opportunities.")}`);
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const leadId = String(formData.get("lead_id") ?? "").trim();
    const nextStatus = String(formData.get("next_status") ?? "").trim() || "New";
    const returnOwner = String(formData.get("return_owner") ?? "all").trim() || "all";
    const returnView = String(formData.get("return_view") ?? "open").trim() || "open";

    if (!leadId) {
      redirect(`/sales-hub/opportunities?owner=${encodeURIComponent(returnOwner)}&view=${encodeURIComponent(returnView)}&error=${encodeURIComponent("Missing lead id.")}`);
    }

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("id, company_name, status, next_follow_up_on, probability_percent")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      redirect(`/sales-hub/opportunities?owner=${encodeURIComponent(returnOwner)}&view=${encodeURIComponent(returnView)}&error=${encodeURIComponent(leadError?.message || "Lead not found.")}`);
    }

    const now = new Date();
    const followUpSuggestion =
      lead.next_follow_up_on || defaultFollowUpForStage(nextStatus, now);

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: now.toISOString(),
    };

    if (
      nextStatus === "Contacted" ||
      nextStatus === "Follow Up" ||
      nextStatus === "Quoted"
    ) {
      updatePayload.last_contacted_at = now.toISOString();
    }

    if (
      (nextStatus === "Contacted" ||
        nextStatus === "Follow Up" ||
        nextStatus === "Quoted" ||
        nextStatus === "To Contact" ||
        nextStatus === "New") &&
      followUpSuggestion
    ) {
      updatePayload.next_follow_up_on = followUpSuggestion;
    }

    if (nextStatus === "Won") {
      updatePayload.probability_percent = 100;
    }

    if (nextStatus === "Lost") {
      updatePayload.probability_percent = 0;
    }

    const { error: updateError } = await supabase
      .from("sales_leads")
      .update(updatePayload)
      .eq("id", leadId);

    if (updateError) {
      redirect(`/sales-hub/opportunities?owner=${encodeURIComponent(returnOwner)}&view=${encodeURIComponent(returnView)}&error=${encodeURIComponent(updateError.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_opportunity_stage_quick_moved",
      entity_type: "sales_opportunity",
      entity_id: leadId,
      meta: {
        company_name: lead.company_name,
        from_status: lead.status,
        to_status: nextStatus,
      },
    });

    redirect(`/sales-hub/opportunities?owner=${encodeURIComponent(returnOwner)}&view=${encodeURIComponent(returnView)}&success=${encodeURIComponent(`Moved ${lead.company_name} to ${nextStatus}.`)}`);
  }

  const selectedOwner = String(searchParams?.owner ?? "all");
  const selectedView = String(searchParams?.view ?? "open");
  const successMessage = String(searchParams?.success ?? "");
  const errorMessage = String(searchParams?.error ?? "");

  const [
    { data: leads, error },
    { data: workflowTasks },
    { data: activityRows },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select(`
        id,
        company_name,
        contact_name,
        email,
        phone,
        area,
        industry,
        status,
        lead_score,
        do_not_contact,
        archived,
        next_follow_up_on,
        last_contacted_at,
        services,
        assigned_to_username,
        notes,
        lead_source,
        created_at,
        updated_at,
        opportunity_value,
        probability_percent,
        expected_close_date,
        lost_reason
      `)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sales_workflow_tasks")
      .select(`
        id,
        lead_id,
        title,
        task_type,
        status,
        priority,
        due_on
      `)
      .eq("status", "open"),
    supabase
      .from("sales_lead_activity")
      .select(`
        id,
        lead_id,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const allRows = ((leads ?? []) as LeadRow[]).filter((lead) => !lead.archived);

  const openTasksByLead = new Map<string, WorkflowTaskRow[]>();
  for (const task of (workflowTasks ?? []) as WorkflowTaskRow[]) {
    const leadId = String(task.lead_id ?? "").trim();
    if (!leadId) continue;
    if (!openTasksByLead.has(leadId)) openTasksByLead.set(leadId, []);
    openTasksByLead.get(leadId)!.push(task);
  }

  const latestActivityByLead = new Map<string, string>();
  for (const row of (activityRows ?? []) as ActivityRow[]) {
    const leadId = String(row.lead_id ?? "").trim();
    if (!leadId) continue;
    if (!latestActivityByLead.has(leadId)) {
      latestActivityByLead.set(leadId, row.created_at);
    }
  }

  const owners: string[] = Array.from(
    new Set<string>(
      allRows
        .map((lead) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredRows = allRows.filter((lead) => {
    const ownerOk =
      selectedOwner === "all" ||
      String(lead.assigned_to_username ?? "").trim() === selectedOwner;

    const openLeadTasks = openTasksByLead.get(lead.id) ?? [];
    const overdueTaskCount = openLeadTasks.filter((task) => {
      const due = dateOnly(task.due_on);
      return !!due && due < today;
    }).length;

    const viewOk = matchesView(
      selectedView,
      String(lead.status ?? ""),
      openLeadTasks.length,
      lead.next_follow_up_on,
      today
    );

    return ownerOk && viewOk;
  });

  const stageOrder = [
    "New",
    "To Contact",
    "Contacted",
    "Follow Up",
    "Quoted",
    "Won",
    "Dormant",
    "Lost",
  ];

  const enrichedRows: OpportunityCard[] = filteredRows.map((lead) => {
    const leadTasks = openTasksByLead.get(lead.id) ?? [];
    const overdueTaskCount = leadTasks.filter((task) => {
      const due = dateOnly(task.due_on);
      return !!due && due < today;
    }).length;

    const latestTaskDueOn =
      [...leadTasks]
        .map((task) => dateOnly(task.due_on))
        .filter(Boolean)
        .sort()[0] || null;

    const latestActivityAt = latestActivityByLead.get(lead.id) ?? null;

    return {
      ...lead,
      probability: probabilityForLead(lead),
      weighted_value: weightedValue(lead),
      open_task_count: leadTasks.length,
      overdue_task_count: overdueTaskCount,
      latest_task_due_on: latestTaskDueOn,
      latest_activity_at: latestActivityAt,
      priority_score: priorityScore(
        lead,
        today,
        leadTasks.length,
        overdueTaskCount,
        latestActivityAt
      ),
    };
  });

  const grouped = stageOrder.map((stage) => {
    const items = enrichedRows
      .filter((lead) => stageLabel(lead.status) === stage)
      .sort((a, b) => {
        if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
        return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
      });

    return {
      stage,
      items,
    };
  });

  const openRows = enrichedRows.filter((lead) => isOpenStatus(lead.status));
  const quotedRows = enrichedRows.filter((lead) => String(lead.status ?? "") === "Quoted");
  const wonRows = enrichedRows.filter((lead) => String(lead.status ?? "") === "Won");

  const pipelineValue = openRows.reduce(
    (sum, lead) => sum + Number(lead?.opportunity_value ?? 0),
    0
  );

  const weightedForecast = openRows.reduce(
    (sum, lead) => sum + Number(lead?.weighted_value ?? 0),
    0
  );

  const needsActionCount = enrichedRows.filter((lead) => {
    const next = dateOnly(lead.next_follow_up_on);
    return lead.open_task_count > 0 || (!!next && next <= today) || String(lead.status ?? "") === "Quoted";
  }).length;

  const hotList = [...openRows]
    .filter((lead) => {
      return (
        Number(lead.opportunity_value ?? 0) > 0 ||
        Number(lead.probability ?? 0) >= 50 ||
        String(lead.status ?? "") === "Quoted" ||
        lead.open_task_count > 0
      );
    })
    .sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
    })
    .slice(0, 12);

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Opportunity Tracking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Working pipeline board with quick stage moves, weighted forecast and task visibility.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/call-planning" style={secondaryBtn}>
              Call Planning
            </a>
            <a href="/sales-hub/leads/new" style={primaryBtn}>
              + Add lead
            </a>
          </div>
        </div>

        {error ? <div style={errorCard}>{error.message}</div> : null}
        {successMessage ? <div style={successCard}>{successMessage}</div> : null}
        {errorMessage ? <div style={errorCard}>{errorMessage}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Open opportunities" value={String(openRows.length)} />
          <StatCard label="Needs action" value={String(needsActionCount)} />
          <StatCard label="Quoted" value={String(quotedRows.length)} />
          <StatCard label="Won" value={String(wonRows.length)} />
          <StatCard label="Pipeline value" value={moneyGBP(pipelineValue)} />
          <StatCard label="Weighted forecast" value={moneyGBP(weightedForecast)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/opportunities" style={filterGrid}>
            <div>
              <label style={labelStyle}>View</label>
              <select name="view" defaultValue={selectedView} style={inputStyle}>
                <option value="open">Open pipeline</option>
                <option value="needs-action">Needs action</option>
                <option value="all">All stages</option>
                <option value="quoted">Quoted only</option>
                <option value="won">Won only</option>
                <option value="dormant">Dormant only</option>
                <option value="lost">Lost only</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Owner</label>
              <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                <option value="all">All owners</option>
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/opportunities" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <div style={topSectionGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Hot opportunities</h2>

            {!hotList.length ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No hot opportunities in the current filter.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {hotList.map((lead) => (
                  <div key={lead.id} style={itemCard}>
                    <div style={itemTopRow}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{lead.company_name}</div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact"} • {lead.assigned_to_username || "Unassigned"}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.area || "No area"} • {lead.industry || "No industry"}
                        </div>
                      </div>

                      <div
                        style={{
                          ...statusBadge,
                          ...badgeStyleForStatus(lead.status),
                        }}
                      >
                        {lead.status || "New"}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <MiniBadge label={`Value ${moneyGBP(lead.opportunity_value)}`} />
                      <MiniBadge label={`Prob ${lead.probability}%`} />
                      <MiniBadge label={`Weighted ${moneyGBP(lead.weighted_value)}`} />
                      <MiniBadge label={`Priority ${lead.priority_score}`} />
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 13, opacity: 0.8 }}>
                      <div>Next follow-up: {fmtDate(lead.next_follow_up_on)}</div>
                      <div>Expected close: {fmtDate(lead.expected_close_date)}</div>
                      <div>Tasks: {taskBadgeLabel(lead.open_task_count, lead.overdue_task_count)}</div>
                      <div>Latest activity: {fmtDateTime(lead.latest_activity_at)}</div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a href={`/sales-hub/opportunities/${lead.id}`} style={miniBtnDark}>
                        Opportunity
                      </a>
                      <a href={`/sales-hub/leads/${lead.id}`} style={miniBtn}>
                        Lead
                      </a>
                      <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniBtn}>
                        Outreach
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>What this board now does</h2>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={tipRow}>Shows real task pressure using open and overdue workflow task counts.</div>
              <div style={tipRow}>Lets the office move opportunities between stages without opening each record first.</div>
              <div style={tipRow}>Uses weighted forecast from value × probability so the pipeline is commercially useful.</div>
              <div style={tipRow}>Makes quoted and overdue opportunities rise to the top automatically.</div>
            </div>
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Pipeline board</h2>

          <div style={boardGrid}>
            {grouped.map((group) => (
              <div key={group.stage} style={columnCard}>
                <div style={columnHeader}>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>{group.stage}</div>
                  <div style={countBadge}>{group.items.length}</div>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {group.items.length === 0 ? (
                    <div style={emptyCard}>No leads</div>
                  ) : (
                    group.items.map((lead) => (
                      <div key={lead.id} style={leadCard}>
                        <div
                          style={{
                            ...statusBadge,
                            ...badgeStyleForStatus(lead.status),
                          }}
                        >
                          {lead.status || "New"}
                        </div>

                        <div style={{ marginTop: 10, fontWeight: 900, wordBreak: "break-word" }}>
                          {lead.company_name}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.contact_name || "No contact name"}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.assigned_to_username || "Unassigned"}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          {lead.area || "No area"} • {lead.industry || "No industry"}
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <MiniBadge label={`Value ${moneyGBP(lead.opportunity_value)}`} />
                          <MiniBadge label={`Prob ${lead.probability}%`} />
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <MiniBadge label={`Weighted ${moneyGBP(lead.weighted_value)}`} />
                          <MiniBadge label={`Priority ${lead.priority_score}`} />
                        </div>

                        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.76 }}>
                          Close target {fmtDate(lead.expected_close_date)}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Follow-up {fmtDate(lead.next_follow_up_on)}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Tasks: {taskBadgeLabel(lead.open_task_count, lead.overdue_task_count)}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Latest activity: {fmtDateTime(lead.latest_activity_at)}
                        </div>

                        {Array.isArray(lead.services) && lead.services.length ? (
                          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.76 }}>
                            {lead.services.join(", ")}
                          </div>
                        ) : null}

                        {lead.lost_reason ? (
                          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.76 }}>
                            Lost reason: {lead.lost_reason}
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                          <a href={`/sales-hub/opportunities/${lead.id}`} style={miniBtnDark}>
                            Opportunity
                          </a>
                          <a href={`/sales-hub/leads/${lead.id}`} style={miniBtn}>
                            Lead
                          </a>
                          <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniBtn}>
                            Outreach
                          </a>
                        </div>

                        {canManage ? (
                          <form action={quickMoveStage} style={quickMoveForm}>
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="return_owner" value={selectedOwner} />
                            <input type="hidden" name="return_view" value={selectedView} />

                            <select
                              name="next_status"
                              defaultValue={String(lead.status ?? "New")}
                              style={quickMoveSelect}
                            >
                              {stageOrder.map((stage) => (
                                <option key={stage} value={stage}>
                                  {stage}
                                </option>
                              ))}
                            </select>

                            <button type="submit" style={quickMoveBtn}>
                              Move
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function MiniBadge({ label }: { label: string }) {
  return <div style={miniBadge}>{label}</div>;
}

const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const topSectionGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
  gap: 16,
  marginTop: 16,
};

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 260px) minmax(220px, 260px) auto",
  gap: 12,
  alignItems: "end",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const itemCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const itemTopRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const boardGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 14,
};

const columnCard: CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.5)",
  border: "1px solid rgba(0,0,0,0.08)",
  minHeight: 220,
};

const columnHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const countBadge: CSSProperties = {
  minWidth: 32,
  height: 32,
  borderRadius: 999,
  background: "rgba(0,0,0,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
};

const emptyCard: CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.75)",
  border: "1px dashed rgba(0,0,0,0.12)",
  opacity: 0.7,
};

const leadCard: CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const statusBadge: CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
};

const miniBadge: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniBtnDark: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const quickMoveForm: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 8,
  marginTop: 12,
};

const quickMoveSelect: CSSProperties = {
  minHeight: 38,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#fff",
  fontSize: 14,
};

const quickMoveBtn: CSSProperties = {
  minHeight: 38,
  padding: "0 12px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const successCard: CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const tipRow: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 600,
};
