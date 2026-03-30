import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

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

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function isOpenLeadStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  return s !== "won" && s !== "lost";
}

function probabilityForLead(lead: any) {
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
  return 0;
}

function weightedValue(lead: any) {
  const value = Number(lead?.opportunity_value ?? 0);
  const probability = probabilityForLead(lead);
  return value * (probability / 100);
}

function daysUntil(value: string | null | undefined) {
  const dateText = dateOnly(value);
  if (!dateText) return null;
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

type SuggestedTask = {
  key: string;
  label: string;
  category: "follow_up" | "quote_chase" | "close_check" | "owner" | "recovery" | "first_contact";
  lead_id: string;
  company_name: string;
  contact_name: string | null;
  assigned_to_username: string | null;
  status: string | null;
  title: string;
  task_type: string;
  priority: string;
  due_on: string;
  notes: string;
  probability: number;
  opportunity_value: number;
  weighted_value: number;
  existing_open_task_count: number;
};

type AutomationCentrePageProps = {
  searchParams?: {
    owner?: string;
    category?: string;
    success?: string;
    error?: string;
  };
};

type SelectedSuggestedTaskPayload = {
  lead_id: string | null;
  client_id?: string | null;
  company_name: string | null;
  title: string;
  task_type: string;
  priority: string;
  due_on: string | null;
  notes: string | null;
  assigned_to_username: string | null;
};

export default async function AutomationCentrePage({
  searchParams,
}: AutomationCentrePageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUsername = fromAuthEmail(user?.email ?? null);
  const canManage = !!access.user && canCreateCustomers(access);

  const selectedOwner = String(searchParams?.owner ?? "all").trim();
  const selectedCategory = String(searchParams?.category ?? "all").trim();
  const successMessage = String(searchParams?.success ?? "");
  const errorMessage = String(searchParams?.error ?? "");
  const today = new Date().toISOString().slice(0, 10);

  async function createSuggestedTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/automation?error=You%20do%20not%20have%20permission%20to%20create%20workflow%20tasks.");
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const leadId = String(formData.get("lead_id") ?? "").trim() || null;
    const clientId = String(formData.get("client_id") ?? "").trim() || null;
    const companyName = String(formData.get("company_name") ?? "").trim() || null;
    const title = String(formData.get("title") ?? "").trim();
    const taskType = String(formData.get("task_type") ?? "follow_up").trim() || "follow_up";
    const priority = String(formData.get("priority") ?? "medium").trim() || "medium";
    const dueOn = String(formData.get("due_on") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const assignedToUsername =
      String(formData.get("assigned_to_username") ?? "").trim() ||
      fromAuthEmail(user?.email ?? null) ||
      null;

    if (!title) {
      redirect("/sales-hub/automation?error=Task%20title%20is%20required.");
    }

    if (!leadId && !clientId) {
      redirect("/sales-hub/automation?error=Task%20must%20link%20to%20a%20lead%20or%20customer.");
    }

    let duplicateQuery = supabase
      .from("sales_workflow_tasks")
      .select("id")
      .eq("status", "open")
      .eq("title", title)
      .eq("task_type", taskType)
      .limit(1);

    if (leadId) duplicateQuery = duplicateQuery.eq("lead_id", leadId);
    if (clientId) duplicateQuery = duplicateQuery.eq("client_id", clientId);

    const { data: duplicateTask } = await duplicateQuery.maybeSingle();

    if (duplicateTask?.id) {
      redirect("/sales-hub/automation?success=Matching%20open%20task%20already%20exists.");
    }

    const { data: createdTask, error } = await supabase
      .from("sales_workflow_tasks")
      .insert({
        title,
        task_type: taskType,
        status: "open",
        priority,
        due_on: dueOn,
        notes,
        assigned_to_username: assignedToUsername,
        lead_id: leadId,
        client_id: clientId,
        created_by_user_id: user?.id ?? null,
        created_by_username: fromAuthEmail(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error || !createdTask?.id) {
      redirect(`/sales-hub/automation?error=${encodeURIComponent(error?.message || "Could not create workflow task.")}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_created_from_automation_queue",
      entity_type: "sales_workflow_task",
      entity_id: createdTask.id,
      meta: {
        lead_id: leadId,
        client_id: clientId,
        company_name: companyName,
        title,
        task_type: taskType,
        priority,
        due_on: dueOn,
      },
    });

    redirect("/sales-hub/automation?success=Workflow%20task%20created.");
  }

  async function createSelectedSuggestedTasks(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/automation?error=You%20do%20not%20have%20permission%20to%20create%20workflow%20tasks.");
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const selectedItems = formData.getAll("selected_items");

    if (!selectedItems.length) {
      redirect("/sales-hub/automation?error=No%20suggested%20items%20selected.");
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const rawItem of selectedItems) {
      try {
        const parsed = JSON.parse(String(rawItem)) as SelectedSuggestedTaskPayload;

        const leadId = String(parsed.lead_id ?? "").trim() || null;
        const clientId = String(parsed.client_id ?? "").trim() || null;
        const companyName = String(parsed.company_name ?? "").trim() || null;
        const title = String(parsed.title ?? "").trim();
        const taskType = String(parsed.task_type ?? "follow_up").trim() || "follow_up";
        const priority = String(parsed.priority ?? "medium").trim() || "medium";
        const dueOn = String(parsed.due_on ?? "").trim() || null;
        const notes = String(parsed.notes ?? "").trim() || null;
        const assignedToUsername =
          String(parsed.assigned_to_username ?? "").trim() ||
          fromAuthEmail(user?.email ?? null) ||
          null;

        if (!title || (!leadId && !clientId)) {
          skippedCount += 1;
          continue;
        }

        let duplicateQuery = supabase
          .from("sales_workflow_tasks")
          .select("id")
          .eq("status", "open")
          .eq("title", title)
          .eq("task_type", taskType)
          .limit(1);

        if (leadId) duplicateQuery = duplicateQuery.eq("lead_id", leadId);
        if (clientId) duplicateQuery = duplicateQuery.eq("client_id", clientId);

        const { data: duplicateTask } = await duplicateQuery.maybeSingle();

        if (duplicateTask?.id) {
          skippedCount += 1;
          continue;
        }

        const { data: createdTask, error } = await supabase
          .from("sales_workflow_tasks")
          .insert({
            title,
            task_type: taskType,
            status: "open",
            priority,
            due_on: dueOn,
            notes,
            assigned_to_username: assignedToUsername,
            lead_id: leadId,
            client_id: clientId,
            created_by_user_id: user?.id ?? null,
            created_by_username: fromAuthEmail(user?.email ?? null) || null,
          })
          .select("id")
          .single();

        if (error || !createdTask?.id) {
          skippedCount += 1;
          continue;
        }

        createdCount += 1;

        await writeAuditLog({
          actor_user_id: user?.id ?? null,
          actor_username: fromAuthEmail(user?.email ?? null) || null,
          action: "sales_workflow_task_created_from_automation_bulk_queue",
          entity_type: "sales_workflow_task",
          entity_id: createdTask.id,
          meta: {
            lead_id: leadId,
            client_id: clientId,
            company_name: companyName,
            title,
            task_type: taskType,
            priority,
            due_on: dueOn,
          },
        });
      } catch {
        skippedCount += 1;
      }
    }

    if (createdCount === 0 && skippedCount > 0) {
      redirect("/sales-hub/automation?success=No%20new%20tasks%20were%20created.%20Selected%20items%20were%20already%20covered%20or%20invalid.");
    }

    redirect(
      `/sales-hub/automation?success=${encodeURIComponent(
        `Created ${createdCount} workflow task${createdCount === 1 ? "" : "s"}${
          skippedCount ? `, skipped ${skippedCount}.` : "."
        }`
      )}`
    );
  }

  const [
    { data: leads, error: leadsError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    supabase
      .from("sales_leads")
      .select(`
        id,
        company_name,
        contact_name,
        email,
        phone,
        status,
        lead_score,
        do_not_contact,
        archived,
        next_follow_up_on,
        last_contacted_at,
        assigned_to_username,
        updated_at,
        opportunity_value,
        probability_percent,
        expected_close_date
      `)
      .eq("archived", false)
      .order("updated_at", { ascending: false }),
    supabase
      .from("sales_workflow_tasks")
      .select(`
        id,
        lead_id,
        client_id,
        title,
        task_type,
        status,
        due_on,
        assigned_to_username,
        created_at,
        completed_at
      `)
      .order("created_at", { ascending: false }),
  ]);

  const owners = Array.from(
    new Set(
      (leads ?? [])
        .map((lead: any) => String(lead.assigned_to_username ?? "").trim())
        .filter(Boolean)
        .concat(currentUsername ? [currentUsername] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const openTasksByLead = new Map<string, any[]>();

  for (const task of tasks ?? []) {
    if (String((task as any).status ?? "") !== "open") continue;
    const leadId = String((task as any).lead_id ?? "").trim();
    if (!leadId) continue;
    if (!openTasksByLead.has(leadId)) openTasksByLead.set(leadId, []);
    openTasksByLead.get(leadId)!.push(task);
  }

  function leadHasOpenTaskTitle(leadId: string, title: string) {
    const leadTasks = openTasksByLead.get(leadId) ?? [];
    return leadTasks.some(
      (task) => String((task as any).title ?? "").trim().toLowerCase() === title.trim().toLowerCase()
    );
  }

  function leadOpenTaskCount(leadId: string) {
    return (openTasksByLead.get(leadId) ?? []).length;
  }

  const baseLeadRows = (leads ?? [])
    .filter((lead: any) => !lead.archived && !lead.do_not_contact)
    .filter((lead: any) => {
      if (selectedOwner === "all") return true;
      return String(lead.assigned_to_username ?? "").trim() === selectedOwner;
    });

  const suggestedTasks: SuggestedTask[] = [];

  for (const lead of baseLeadRows) {
    const leadId = String(lead.id);
    const companyName = String(lead.company_name ?? "Lead");
    const assignedToUsername = String(lead.assigned_to_username ?? "").trim() || null;
    const status = String(lead.status ?? "New");
    const probability = probabilityForLead(lead);
    const opportunityValue = Number(lead.opportunity_value ?? 0);
    const weighted = weightedValue(lead);
    const followUpDays = daysUntil(lead.next_follow_up_on);
    const closeDays = daysUntil(lead.expected_close_date);
    const hasPhone = Boolean(lead.phone);
    const hasEmail = Boolean(lead.email);

    const pushSuggestion = (
      item: Omit<SuggestedTask, "probability" | "opportunity_value" | "weighted_value" | "existing_open_task_count">
    ) => {
      if (leadHasOpenTaskTitle(leadId, item.title)) return;

      suggestedTasks.push({
        ...item,
        probability,
        opportunity_value: opportunityValue,
        weighted_value: weighted,
        existing_open_task_count: leadOpenTaskCount(leadId),
      });
    };

    if (!assignedToUsername && isOpenLeadStatus(status)) {
      pushSuggestion({
        key: `${leadId}-assign-owner`,
        label: "No owner assigned",
        category: "owner",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Assign and review ${companyName}`,
        task_type: "follow_up",
        priority: "high",
        due_on: today,
        notes: "Lead has no assigned owner. Allocate responsibility and review next action.",
      });
    }

    if (followUpDays !== null && followUpDays <= 0 && isOpenLeadStatus(status)) {
      pushSuggestion({
        key: `${leadId}-follow-up-due`,
        label: "Follow-up due now",
        category: "follow_up",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Follow up ${companyName}`,
        task_type: "follow_up",
        priority: "high",
        due_on: today,
        notes: "Next follow-up date is due or overdue.",
      });
    }

    if (status === "Quoted") {
      pushSuggestion({
        key: `${leadId}-quote-chase`,
        label: "Quoted lead",
        category: "quote_chase",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Quote chase ${companyName}`,
        task_type: "quote_chase",
        priority: "high",
        due_on: addDays(new Date(), 2).toISOString().slice(0, 10),
        notes: "Lead is in Quoted status. Chase the quote and move it toward decision.",
      });
    }

    if (closeDays !== null && closeDays >= 0 && closeDays <= 7 && probability >= 60 && isOpenLeadStatus(status)) {
      pushSuggestion({
        key: `${leadId}-close-check`,
        label: "Close check needed",
        category: "close_check",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Close check ${companyName}`,
        task_type: "follow_up",
        priority: "urgent",
        due_on: String(lead.expected_close_date ?? today),
        notes: "High probability opportunity with close date in the next 7 days. Confirm decision timing and blockers.",
      });
    }

    if (status === "Dormant") {
      pushSuggestion({
        key: `${leadId}-recovery`,
        label: "Dormant recovery",
        category: "recovery",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Recovery contact ${companyName}`,
        task_type: "customer_recovery",
        priority: "high",
        due_on: today,
        notes: "Lead is marked Dormant. Re-engage and test whether the requirement is still live.",
      });
    }

    if ((status === "New" || status === "To Contact") && hasPhone) {
      pushSuggestion({
        key: `${leadId}-first-call`,
        label: "First contact call",
        category: "first_contact",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Initial call ${companyName}`,
        task_type: "call",
        priority: "high",
        due_on: today,
        notes: "Early-stage lead with a phone number available. Make first contact.",
      });
    }

    if ((status === "New" || status === "To Contact") && !hasPhone && hasEmail) {
      pushSuggestion({
        key: `${leadId}-first-email`,
        label: "First contact email",
        category: "first_contact",
        lead_id: leadId,
        company_name: companyName,
        contact_name: lead.contact_name ?? null,
        assigned_to_username: assignedToUsername,
        status,
        title: `Initial email ${companyName}`,
        task_type: "email",
        priority: "medium",
        due_on: today,
        notes: "Early-stage lead has no phone number but does have an email address. Send an introduction email.",
      });
    }
  }

  const filteredSuggestions = suggestedTasks
    .filter((item) => selectedCategory === "all" || item.category === selectedCategory)
    .sort((a, b) => {
      const priorityRank = (value: string) => {
        if (value === "urgent") return 4;
        if (value === "high") return 3;
        if (value === "medium") return 2;
        return 1;
      };

      const aRank = priorityRank(a.priority);
      const bRank = priorityRank(b.priority);

      if (bRank !== aRank) return bRank - aRank;
      if (a.due_on !== b.due_on) return String(a.due_on).localeCompare(String(b.due_on));
      return Number(b.weighted_value ?? 0) - Number(a.weighted_value ?? 0);
    });

  const stats = {
    total: filteredSuggestions.length,
    follow_up: filteredSuggestions.filter((item) => item.category === "follow_up").length,
    quote_chase: filteredSuggestions.filter((item) => item.category === "quote_chase").length,
    close_check: filteredSuggestions.filter((item) => item.category === "close_check").length,
    owner: filteredSuggestions.filter((item) => item.category === "owner").length,
    recovery: filteredSuggestions.filter((item) => item.category === "recovery").length,
    first_contact: filteredSuggestions.filter((item) => item.category === "first_contact").length,
  };

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Automation Centre</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Central queue of suggested sales tasks generated from lead and opportunity signals.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/workflows" style={secondaryBtn}>
              Workflow tasks
            </a>
          </div>
        </div>

        {successMessage ? <div style={successCard}>{decodeURIComponent(successMessage)}</div> : null}
        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {tasksError ? <div style={errorCard}>{tasksError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Suggested tasks" value={String(stats.total)} />
          <StatCard label="Follow-ups due" value={String(stats.follow_up)} />
          <StatCard label="Quote chases" value={String(stats.quote_chase)} />
          <StatCard label="Close checks" value={String(stats.close_check)} />
          <StatCard label="No owner" value={String(stats.owner)} />
          <StatCard label="Dormant recovery" value={String(stats.recovery)} />
          <StatCard label="First contact" value={String(stats.first_contact)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/automation" style={filterGrid}>
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

            <div>
              <label style={labelStyle}>Category</label>
              <select name="category" defaultValue={selectedCategory} style={inputStyle}>
                <option value="all">All categories</option>
                <option value="follow_up">Follow-ups due</option>
                <option value="quote_chase">Quote chases</option>
                <option value="close_check">Close checks</option>
                <option value="owner">No owner</option>
                <option value="recovery">Dormant recovery</option>
                <option value="first_contact">First contact</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/automation" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Suggested task queue</h2>
            <div style={helperText}>
              Tick the rows you want, then use the bulk create button.
            </div>
          </div>

          {!filteredSuggestions.length ? (
            <p style={{ marginTop: 14, marginBottom: 0, opacity: 0.78 }}>
              No suggested tasks matched the current filters.
            </p>
          ) : (
            <form action={createSelectedSuggestedTasks}>
              {canManage ? (
                <div style={bulkBar}>
                  <button type="submit" style={primaryBtn}>
                    Create selected workflow tasks
                  </button>
                  <div style={helperText}>
                    Duplicate open tasks are skipped automatically.
                  </div>
                </div>
              ) : (
                <div style={mutedNote}>You do not have permission to create workflow tasks.</div>
              )}

              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {filteredSuggestions.map((item) => {
                  const payload: SelectedSuggestedTaskPayload = {
                    lead_id: item.lead_id,
                    company_name: item.company_name,
                    title: item.title,
                    task_type: item.task_type,
                    priority: item.priority,
                    due_on: item.due_on,
                    notes: item.notes,
                    assigned_to_username: item.assigned_to_username,
                  };

                  return (
                    <div key={item.key} style={itemCard}>
                      <div style={itemTopRow}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                          <div style={{ paddingTop: 4 }}>
                            <input
                              type="checkbox"
                              name="selected_items"
                              value={JSON.stringify(payload)}
                              style={{ width: 18, height: 18 }}
                            />
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <MiniBadge label={item.label} />
                              <MiniBadge label={String(item.status ?? "New")} />
                              <MiniBadge label={`${item.priority.toUpperCase()} priority`} />
                            </div>

                            <div style={{ marginTop: 10, fontWeight: 900, fontSize: 18 }}>
                              {item.company_name}
                            </div>

                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                              {item.contact_name || "No contact name"}
                              {item.assigned_to_username ? ` • ${item.assigned_to_username}` : " • Unassigned"}
                            </div>

                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                              Due {fmtDate(item.due_on)} • Probability {item.probability}% • Weighted {moneyGBP(item.weighted_value)}
                            </div>

                            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>
                              {item.notes}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <MiniBadge label={`Open tasks ${item.existing_open_task_count}`} />
                        </div>
                      </div>

                      <div style={actionsWrap}>
                        {canManage ? (
                          <form action={createSuggestedTask} style={inlineForm}>
                            <input type="hidden" name="lead_id" value={item.lead_id} />
                            <input type="hidden" name="company_name" value={item.company_name} />
                            <input type="hidden" name="title" value={item.title} />
                            <input type="hidden" name="task_type" value={item.task_type} />
                            <input type="hidden" name="priority" value={item.priority} />
                            <input type="hidden" name="due_on" value={item.due_on} />
                            <input type="hidden" name="notes" value={item.notes} />
                            <input
                              type="hidden"
                              name="assigned_to_username"
                              value={String(item.assigned_to_username ?? "")}
                            />
                            <button type="submit" style={miniDarkBtn}>
                              Create single task
                            </button>
                          </form>
                        ) : null}

                        <a href={`/sales-hub/leads/${item.lead_id}`} style={miniBtnLink}>
                          Open lead
                        </a>
                        <a href={`/sales-hub/opportunities/${item.lead_id}`} style={miniBtnLink}>
                          Open opportunity
                        </a>
                        <a href={`/sales-hub/leads/${item.lead_id}/outreach`} style={miniDarkBtnLink}>
                          Outreach
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canManage ? (
                <div style={bulkBarBottom}>
                  <button type="submit" style={primaryBtn}>
                    Create selected workflow tasks
                  </button>
                </div>
              ) : null}
            </form>
          )}
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

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 260px) minmax(220px, 260px) auto",
  gap: 12,
  alignItems: "end",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
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

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const itemCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const itemTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const actionsWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
  alignItems: "center",
};

const inlineForm: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const miniBadge: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniBtnLink: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const miniDarkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const miniDarkBtnLink: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const successCard: React.CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const mutedNote: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.76,
  fontWeight: 700,
};

const helperText: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.72,
};

const bulkBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const bulkBarBottom: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 14,
};
