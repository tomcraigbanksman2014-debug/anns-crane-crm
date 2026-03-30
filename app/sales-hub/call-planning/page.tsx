import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getAccessContext, canCreateCustomers } from "../../lib/access";

type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  industry: string | null;
  status: string | null;
  services: string[] | null;
  do_not_contact: boolean | null;
  archived: boolean | null;
  assigned_to_username: string | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  next_follow_up_on: string | null;
  last_contacted_at: string | null;
  updated_at: string | null;
};

type WorkflowTaskRow = {
  id: string;
  lead_id: string | null;
  title: string | null;
  task_type: string | null;
  status: string | null;
  priority: string | null;
  due_on: string | null;
  assigned_to_username: string | null;
};

type PlannedCallRow = {
  lead: LeadRow;
  score: number;
  weightedValue: number;
  overdueDays: number | null;
  expectedCloseDays: number | null;
  openCallTaskCount: number;
  topReason: string;
  callAngle: string;
};

type PageProps = {
  searchParams?: {
    owner?: string;
    area?: string;
    status?: string;
  };
};

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
}

function formatDateUK(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function formatMoneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  if (!text) return null;
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysUntil(value: string | null | undefined) {
  const date = parseDateOnly(value);
  if (!date) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function probabilityForLead(lead: LeadRow) {
  const manual = Number(lead.probability_percent);
  if (Number.isFinite(manual)) {
    return Math.max(0, Math.min(100, manual));
  }

  const status = String(lead.status ?? "").toLowerCase();

  if (status === "new") return 10;
  if (status === "to contact") return 15;
  if (status === "contacted") return 25;
  if (status === "follow up") return 40;
  if (status === "quoted") return 65;
  if (status === "won") return 100;
  if (status === "dormant") return 8;
  return 0;
}

function weightedValueForLead(lead: LeadRow) {
  return Number(lead.opportunity_value ?? 0) * (probabilityForLead(lead) / 100);
}

function isOpenLead(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function leadServicesText(lead: LeadRow) {
  return Array.isArray(lead.services) ? lead.services.join(", ") : "";
}

function bestCallAngle(lead: LeadRow) {
  const status = String(lead.status ?? "").toLowerCase();
  const services = leadServicesText(lead).toLowerCase();
  const industry = String(lead.industry ?? "").toLowerCase();

  if (status === "quoted") {
    return "Quote chase: check decision timing, objections and what is needed to win the job.";
  }

  if (status === "dormant") {
    return "Reactivation: ask what they have coming up and re-open the relationship.";
  }

  if (status === "new" || status === "to contact") {
    return "First introduction: establish requirement, timescales and who handles lifting or transport buying.";
  }

  if (
    services.includes("hiab") ||
    services.includes("transport") ||
    services.includes("haulage") ||
    industry.includes("container") ||
    industry.includes("modular")
  ) {
    return "Transport-led call: focus on HIAB, haulage, delivery support and short-notice cover.";
  }

  if (
    services.includes("crane") ||
    services.includes("contract lift") ||
    services.includes("lifting") ||
    industry.includes("steel") ||
    industry.includes("glazing") ||
    industry.includes("construction")
  ) {
    return "Crane-led call: focus on crane hire, contract lifts, lifting support and nationwide response.";
  }

  return "General sales call: explore upcoming projects, pain points and where AnnS could support.";
}

function mainReason(lead: LeadRow, overdueDays: number | null, openCallTaskCount: number) {
  const status = String(lead.status ?? "").toLowerCase();

  if (openCallTaskCount > 0) return "Open call task already due";
  if (overdueDays !== null && overdueDays < 0) return "Follow-up overdue";
  if (status === "quoted") return "Quoted lead needs chasing";
  if (status === "dormant") return "Dormant lead for recovery";
  if (status === "new" || status === "to contact") return "New lead needs first contact";
  return "High-value live opportunity";
}

function computeCallScore(lead: LeadRow, openCallTaskCount: number) {
  let score = 0;

  const status = String(lead.status ?? "").toLowerCase();
  const overdueDays = daysUntil(lead.next_follow_up_on);
  const closeDays = daysUntil(lead.expected_close_date);
  const probability = probabilityForLead(lead);
  const weightedValue = weightedValueForLead(lead);

  if (lead.phone) score += 50;
  if (openCallTaskCount > 0) score += 40;
  if (overdueDays !== null && overdueDays < 0) score += 35;
  if (overdueDays !== null && overdueDays === 0) score += 25;
  if (status === "quoted") score += 30;
  if (status === "follow up") score += 18;
  if (status === "dormant") score += 20;
  if (status === "new" || status === "to contact") score += 16;
  if (closeDays !== null && closeDays >= 0 && closeDays <= 7) score += 20;

  score += Math.round(probability / 4);
  score += Math.min(30, Math.round(weightedValue / 1000));

  if (!lead.assigned_to_username) score += 6;
  if (!lead.phone) score -= 100;

  return score;
}

function byScoreDesc(a: PlannedCallRow, b: PlannedCallRow) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.weightedValue !== a.weightedValue) return b.weightedValue - a.weightedValue;
  return String(a.lead.company_name).localeCompare(String(b.lead.company_name));
}

export default async function CallPlanningPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = !!access.user && canCreateCustomers(access);
  const currentUsername = fromAuthEmail(user?.email ?? null);

  const selectedOwner = String(searchParams?.owner ?? "all").trim() || "all";
  const selectedArea = String(searchParams?.area ?? "all").trim() || "all";
  const selectedStatus = String(searchParams?.status ?? "all").trim() || "all";

  const [
    { data: leads, error: leadsError },
    { data: workflowTasks, error: tasksError },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select(`
        id,
        company_name,
        contact_name,
        phone,
        email,
        area,
        industry,
        status,
        services,
        do_not_contact,
        archived,
        assigned_to_username,
        opportunity_value,
        probability_percent,
        expected_close_date,
        next_follow_up_on,
        last_contacted_at,
        updated_at
      `)
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("sales_workflow_tasks")
      .select(`
        id,
        lead_id,
        title,
        task_type,
        status,
        priority,
        due_on,
        assigned_to_username
      `)
      .eq("status", "open")
      .order("due_on", { ascending: true }),
  ]);

  const allLeads = ((leads ?? []) as LeadRow[])
    .filter((lead) => !lead.do_not_contact)
    .filter((lead) => isOpenLead(lead.status))
    .filter((lead) => Boolean(lead.phone))
    .filter((lead) => {
      if (selectedOwner === "all") return true;
      return String(lead.assigned_to_username ?? "").trim() === selectedOwner;
    })
    .filter((lead) => {
      if (selectedArea === "all") return true;
      return String(lead.area ?? "").trim() === selectedArea;
    })
    .filter((lead) => {
      if (selectedStatus === "all") return true;
      return String(lead.status ?? "").trim() === selectedStatus;
    });

  const openCallTasksByLead = new Map<string, WorkflowTaskRow[]>();

  for (const task of (workflowTasks ?? []) as WorkflowTaskRow[]) {
    if (String(task.task_type ?? "").toLowerCase() !== "call") continue;
    const leadId = String(task.lead_id ?? "").trim();
    if (!leadId) continue;
    if (!openCallTasksByLead.has(leadId)) openCallTasksByLead.set(leadId, []);
    openCallTasksByLead.get(leadId)!.push(task);
  }

  const plannedCalls: PlannedCallRow[] = allLeads.map((lead) => {
    const openCallTaskCount = (openCallTasksByLead.get(String(lead.id)) ?? []).length;
    const overdueDays = daysUntil(lead.next_follow_up_on);
    const expectedCloseDays = daysUntil(lead.expected_close_date);
    const weightedValue = weightedValueForLead(lead);

    return {
      lead,
      score: computeCallScore(lead, openCallTaskCount),
      weightedValue,
      overdueDays,
      expectedCloseDays,
      openCallTaskCount,
      topReason: mainReason(lead, overdueDays, openCallTaskCount),
      callAngle: bestCallAngle(lead),
    };
  });

  const rankedCalls = [...plannedCalls].sort(byScoreDesc);

  const priorityCalls = rankedCalls.slice(0, 12);

  const quoteChaseCalls = rankedCalls
    .filter((item) => String(item.lead.status ?? "").toLowerCase() === "quoted")
    .slice(0, 10);

  const dormantRecoveryCalls = rankedCalls
    .filter((item) => String(item.lead.status ?? "").toLowerCase() === "dormant")
    .slice(0, 10);

  const overdueFollowUps = rankedCalls
    .filter((item) => item.overdueDays !== null && item.overdueDays < 0)
    .slice(0, 10);

  const callbackTasks = rankedCalls
    .filter((item) => item.openCallTaskCount > 0)
    .slice(0, 10);

  const ownerOptions = Array.from(
    new Set(
      ((leads ?? []) as LeadRow[])
        .map((lead) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
        .concat(currentUsername ? [currentUsername] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const areaOptions = Array.from(
    new Set(
      ((leads ?? []) as LeadRow[])
        .map((lead) => String(lead.area ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Call Planning Dashboard</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Prioritise who to call today, why they matter and the best angle to use.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/campaigns" style={secondaryBtn}>
              Campaigns
            </a>
            <a href="/sales-hub/availability" style={secondaryBtn}>
              Availability
            </a>
          </div>
        </div>

        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {tasksError ? <div style={errorCard}>{tasksError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Call-ready leads" value={String(rankedCalls.length)} />
          <StatCard label="Priority calls" value={String(priorityCalls.length)} />
          <StatCard label="Quote chases" value={String(quoteChaseCalls.length)} />
          <StatCard label="Dormant recovery" value={String(dormantRecoveryCalls.length)} />
          <StatCard label="Overdue follow-ups" value={String(overdueFollowUps.length)} />
          <StatCard label="Open call tasks" value={String(callbackTasks.length)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Filters</h2>

          <form method="get" action="/sales-hub/call-planning" style={filterGrid}>
            <div>
              <label style={labelStyle}>Owner</label>
              <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                <option value="all">All owners</option>
                {ownerOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Area</label>
              <select name="area" defaultValue={selectedArea} style={inputStyle}>
                <option value="all">All areas</option>
                {areaOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Lead status</label>
              <select name="status" defaultValue={selectedStatus} style={inputStyle}>
                <option value="all">All live statuses</option>
                <option value="New">New</option>
                <option value="To Contact">To Contact</option>
                <option value="Contacted">Contacted</option>
                <option value="Quoted">Quoted</option>
                <option value="Follow Up">Follow Up</option>
                <option value="Dormant">Dormant</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Refresh plan
              </button>
              <a href="/sales-hub/call-planning" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <div style={sectionTopRow}>
            <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Priority calls today</h2>
            <div style={helperText}>
              Highest value and most urgent calls first.
            </div>
          </div>

          {!priorityCalls.length ? (
            <div style={mutedBox}>No leads matched the current filters.</div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
              {priorityCalls.map((item, index) => (
                <CallCard
                  key={item.lead.id}
                  item={item}
                  rank={index + 1}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </section>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Quote chase calls</h2>
            {!quoteChaseCalls.length ? (
              <div style={mutedBox}>No quoted leads currently in scope.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {quoteChaseCalls.map((item) => (
                  <MiniCallCard key={item.lead.id} item={item} canManage={canManage} />
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Dormant recovery</h2>
            {!dormantRecoveryCalls.length ? (
              <div style={mutedBox}>No dormant leads currently in scope.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {dormantRecoveryCalls.map((item) => (
                  <MiniCallCard key={item.lead.id} item={item} canManage={canManage} />
                ))}
              </div>
            )}
          </section>
        </div>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Overdue follow-ups</h2>
            {!overdueFollowUps.length ? (
              <div style={mutedBox}>No overdue follow-ups currently in scope.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {overdueFollowUps.map((item) => (
                  <MiniCallCard key={item.lead.id} item={item} canManage={canManage} />
                ))}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Open call tasks</h2>
            {!callbackTasks.length ? (
              <div style={mutedBox}>No open call tasks currently linked to filtered leads.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {callbackTasks.map((item) => (
                  <MiniCallCard key={item.lead.id} item={item} canManage={canManage} />
                ))}
              </div>
            )}
          </section>
        </div>
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

function CallCard({
  item,
  rank,
  canManage,
}: {
  item: PlannedCallRow;
  rank: number;
  canManage: boolean;
}) {
  const lead = item.lead;

  return (
    <div style={callCard}>
      <div style={callCardTop}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0, flex: 1 }}>
          <div style={rankBadge}>{rank}</div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{lead.company_name}</div>

            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.74 }}>
              {lead.contact_name || "No contact"} • {lead.phone || "No phone"} • {lead.status || "New"}
            </div>

            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.74 }}>
              {lead.area || "No area"} • {lead.industry || "No industry"} • Owner:{" "}
              {lead.assigned_to_username || "Unassigned"}
            </div>

            <div style={reasonBox}>
              <strong>{item.topReason}</strong>
              <div style={{ marginTop: 6 }}>{item.callAngle}</div>
            </div>

            <div style={metaGrid}>
              <div>Weighted value: {formatMoneyGBP(item.weightedValue)}</div>
              <div>Probability: {probabilityForLead(lead)}%</div>
              <div>Next follow-up: {formatDateUK(lead.next_follow_up_on)}</div>
              <div>Expected close: {formatDateUK(lead.expected_close_date)}</div>
              <div>Open call tasks: {item.openCallTaskCount}</div>
              <div>Score: {item.score}</div>
            </div>
          </div>
        </div>

        <div style={actionCol}>
          <a href={`/sales-hub/leads/${lead.id}`} style={miniLinkBtn}>
            Open lead
          </a>
          <a href={`/sales-hub/opportunities/${lead.id}`} style={miniLinkBtn}>
            Opportunity
          </a>
          {canManage ? (
            <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniDarkLinkBtn}>
              Outreach
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MiniCallCard({
  item,
  canManage,
}: {
  item: PlannedCallRow;
  canManage: boolean;
}) {
  const lead = item.lead;

  return (
    <div style={miniCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900 }}>{lead.company_name}</div>
          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.74 }}>
            {lead.contact_name || "No contact"} • {lead.phone || "No phone"} • {lead.status || "New"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{item.topReason}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={miniBadge}>Score {item.score}</div>
          <a href={`/sales-hub/leads/${lead.id}`} style={miniLinkBtn}>
            Lead
          </a>
          {canManage ? (
            <a href={`/sales-hub/leads/${lead.id}/outreach`} style={miniDarkLinkBtn}>
              Call
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
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

const sectionTitle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const sectionTopRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const helperText: CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
};

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const miniLinkBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniDarkLinkBtn: CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 16,
};

const mutedBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.82,
  fontWeight: 700,
};

const callCard: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const callCardTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "flex-start",
};

const rankBadge: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  background: "#111",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 900,
  flexShrink: 0,
};

const reasonBox: CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.5,
  fontSize: 14,
};

const metaGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
  marginTop: 12,
  fontSize: 13,
  opacity: 0.82,
};

const actionCol: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const miniCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const miniBadge: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};
