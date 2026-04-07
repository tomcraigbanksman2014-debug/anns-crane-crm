import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";
import { redirect } from "next/navigation";

import ServerSubmitButton from "../../../components/ServerSubmitButton";
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

function toDateInput(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function daysUntil(value: string | null | undefined) {
  const dateText = String(value ?? "").slice(0, 10);
  if (!dateText) return null;
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
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

function taskTypeLabel(value: string | null | undefined) {
  const v = String(value ?? "other");
  if (v === "quote_chase") return "Quote chase";
  if (v === "social_post") return "Social post";
  if (v === "customer_recovery") return "Customer recovery";
  if (v === "follow_up") return "Follow up";
  if (v === "call") return "Call";
  if (v === "email") return "Email";
  return "Other";
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const v = String(status ?? "open");
  if (v === "completed") {
    return {
      background: "rgba(0,160,80,0.14)",
      color: "#0b6b34",
      border: "1px solid rgba(0,160,80,0.16)",
    };
  }
  if (v === "cancelled") {
    return {
      background: "rgba(180,0,0,0.12)",
      color: "#8a1f1f",
      border: "1px solid rgba(180,0,0,0.16)",
    };
  }
  return {
    background: "rgba(0,120,255,0.12)",
    color: "#0d5ea8",
    border: "1px solid rgba(0,120,255,0.16)",
  };
}

type SuggestedTask = {
  key: string;
  label: string;
  title: string;
  taskType: string;
  priority: string;
  dueOn: string;
  notes: string;
};

type OpportunityDetailPageProps = {
  params: { id: string };
  searchParams?: {
    success?: string;
    error?: string;
  };
};

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: OpportunityDetailPageProps) {
  const supabase = createSupabaseServerClient();

  async function updateOpportunity(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent("You do not have permission to update opportunities.")}`);
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const status = String(formData.get("status") ?? "").trim() || "New";
    const probability = parseOptionalNumber(formData.get("probability_percent"));
    const value = parseOptionalNumber(formData.get("opportunity_value"));
    const expectedCloseDate = String(formData.get("expected_close_date") ?? "").trim() || null;
    const nextFollowUpOn = String(formData.get("next_follow_up_on") ?? "").trim() || null;
    const lostReasonRaw = String(formData.get("lost_reason") ?? "").trim();

    const safeProbability =
      probability == null ? null : Math.max(0, Math.min(100, Math.round(probability)));

    const safeValue = value == null ? 0 : Math.max(0, value);

    const updatePayload: Record<string, any> = {
      status,
      probability_percent: safeProbability,
      opportunity_value: safeValue,
      expected_close_date: expectedCloseDate,
      next_follow_up_on: nextFollowUpOn,
      lost_reason: lostReasonRaw || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sales_leads")
      .update(updatePayload)
      .eq("id", params.id);

    if (error) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_opportunity_updated",
      entity_type: "sales_opportunity",
      entity_id: params.id,
      meta: {
        sales_lead_id: params.id,
        status,
        probability_percent: safeProbability,
        opportunity_value: safeValue,
        expected_close_date: expectedCloseDate,
        next_follow_up_on: nextFollowUpOn,
        lost_reason: lostReasonRaw || null,
      },
    });

    redirect(`/sales-hub/opportunities/${params.id}?success=${encodeURIComponent("Opportunity updated.")}`);
  }

  async function createOpportunityTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent("You do not have permission to create workflow tasks.")}`);
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("id, company_name, assigned_to_username")
      .eq("id", params.id)
      .single();

    if (leadError || !lead) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent("Opportunity not found.")}`);
    }

    const title = String(formData.get("title") ?? "").trim();
    const taskType = String(formData.get("task_type") ?? "follow_up").trim() || "follow_up";
    const priority = String(formData.get("priority") ?? "medium").trim() || "medium";
    const dueOn = String(formData.get("due_on") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const assignedToUsername =
      String(formData.get("assigned_to_username") ?? "").trim() ||
      String(lead.assigned_to_username ?? "").trim() ||
      fromAuthEmail(user?.email ?? null) ||
      null;

    if (!title) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent("Task title is required.")}`);
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
        lead_id: params.id,
        created_by_user_id: user?.id ?? null,
        created_by_username: fromAuthEmail(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error || !createdTask?.id) {
      redirect(`/sales-hub/opportunities/${params.id}?error=${encodeURIComponent(error?.message || "Could not create task.")}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_created_from_opportunity",
      entity_type: "sales_workflow_task",
      entity_id: createdTask.id,
      meta: {
        lead_id: params.id,
        company_name: lead.company_name,
        title,
        task_type: taskType,
        priority,
        due_on: dueOn,
      },
    });

    redirect(`/sales-hub/opportunities/${params.id}?success=${encodeURIComponent("Workflow task created.")}`);
  }

  const [
    { data: lead, error },
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
      .eq("id", params.id)
      .single(),
    supabase
      .from("sales_workflow_tasks")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !lead) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error?.message || "Opportunity not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const probability = probabilityForLead(lead);
  const weightedValue = Number(lead.opportunity_value ?? 0) * (probability / 100);
  const relatedTasks = tasks ?? [];
  const openTasks = relatedTasks.filter((item: any) => String(item.status ?? "") === "open").length;
  const completedTasks = relatedTasks.filter((item: any) => String(item.status ?? "") === "completed").length;

  const today = new Date().toISOString().slice(0, 10);
  const status = String(lead.status ?? "New");
  const closeInDays = daysUntil(lead.expected_close_date);
  const followUpInDays = daysUntil(lead.next_follow_up_on);

  const suggestedTasks: SuggestedTask[] = [];

  if (status === "Quoted") {
    suggestedTasks.push({
      key: "quoted-chase",
      label: "Quoted opportunity",
      title: `Quote chase ${lead.company_name}`,
      taskType: "quote_chase",
      priority: "high",
      dueOn: addDays(new Date(), 2).toISOString().slice(0, 10),
      notes: "Opportunity is in Quoted status. Chase quote and move toward close.",
    });
  }

  if (closeInDays !== null && closeInDays >= 0 && closeInDays <= 7 && probability >= 60) {
    suggestedTasks.push({
      key: "close-check",
      label: "High probability close window",
      title: `Close check ${lead.company_name}`,
      taskType: "follow_up",
      priority: "urgent",
      dueOn: String(lead.expected_close_date ?? today),
      notes: "High probability opportunity with close date in the next 7 days. Confirm decision and blockers.",
    });
  }

  if (followUpInDays !== null && followUpInDays <= 0) {
    suggestedTasks.push({
      key: "followup-due",
      label: "Follow-up due now",
      title: `Follow up ${lead.company_name}`,
      taskType: "follow_up",
      priority: "high",
      dueOn: today,
      notes: "Next follow-up date is due or overdue.",
    });
  }

  if (!String(lead.assigned_to_username ?? "").trim()) {
    suggestedTasks.push({
      key: "assign-owner",
      label: "No owner assigned",
      title: `Assign and review ${lead.company_name}`,
      taskType: "follow_up",
      priority: "high",
      dueOn: today,
      notes: "Opportunity has no assigned owner. Review and allocate responsibility.",
    });
  }

  if (status === "Dormant") {
    suggestedTasks.push({
      key: "recovery",
      label: "Dormant opportunity",
      title: `Recovery contact ${lead.company_name}`,
      taskType: "customer_recovery",
      priority: "high",
      dueOn: today,
      notes: "Opportunity is Dormant. Re-engage and test whether the requirement is still live.",
    });
  }

  if (probability >= 75 && Number(lead.opportunity_value ?? 0) > 0 && (!lead.expected_close_date || closeInDays === null)) {
    suggestedTasks.push({
      key: "set-close-date",
      label: "Strong opportunity with no close date",
      title: `Call to confirm close date ${lead.company_name}`,
      taskType: "call",
      priority: "high",
      dueOn: addDays(new Date(), 1).toISOString().slice(0, 10),
      notes: "Opportunity is strong but has no clear expected close date. Confirm likely decision timing.",
    });
  }

  const uniqueSuggestedTasks = suggestedTasks.filter(
    (item, index, arr) => arr.findIndex((x) => x.key === item.key) === index
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{lead.company_name}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Opportunity detail, forecast settings and direct task creation.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/opportunities" style={secondaryBtn}>
              ← Opportunities
            </a>
            <a href="/sales-hub/workflows" style={secondaryBtn}>
              Workflow tasks
            </a>
            <a href={`/sales-hub/leads/${lead.id}`} style={secondaryBtn}>
              Open lead
            </a>
            <a href={`/sales-hub/leads/${lead.id}/outreach`} style={primaryBtn}>
              Outreach
            </a>
          </div>
        </div>

        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}

        {tasksError ? <div style={errorCard}>{tasksError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Lead score" value={String(lead.lead_score ?? 0)} />
          <StatCard label="Probability" value={`${probability}%`} />
          <StatCard label="Opportunity value" value={moneyGBP(lead.opportunity_value)} />
          <StatCard label="Weighted value" value={moneyGBP(weightedValue)} />
          <StatCard label="Open tasks" value={String(openTasks)} />
          <StatCard label="Completed tasks" value={String(completedTasks)} />
        </div>

        <div style={layoutGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Update opportunity</h2>

            <form action={updateOpportunity} style={{ display: "grid", gap: 14 }}>
              <div style={fieldGrid}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    name="status"
                    defaultValue={String(lead.status ?? "New")}
                    style={inputStyle}
                  >
                    <option value="New">New</option>
                    <option value="To Contact">To Contact</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Follow Up">Follow Up</option>
                    <option value="Quoted">Quoted</option>
                    <option value="Won">Won</option>
                    <option value="Dormant">Dormant</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Probability %</label>
                  <input
                    name="probability_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={
                      lead.probability_percent == null ? "" : String(lead.probability_percent)
                    }
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Opportunity value</label>
                  <input
                    name="opportunity_value"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={String(lead.opportunity_value ?? 0)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Expected close date</label>
                  <input
                    name="expected_close_date"
                    type="date"
                    defaultValue={toDateInput(lead.expected_close_date)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Next follow-up</label>
                  <input
                    name="next_follow_up_on"
                    type="date"
                    defaultValue={toDateInput(lead.next_follow_up_on)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Lost reason</label>
                <textarea
                  name="lost_reason"
                  defaultValue={String(lead.lost_reason ?? "")}
                  style={textareaStyle}
                />
              </div>

              <div>
                <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                  Save opportunity
                </ServerSubmitButton>
              </div>
            </form>
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Suggested next actions</h2>

            {uniqueSuggestedTasks.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.78 }}>
                No strong opportunity task suggestions right now.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {uniqueSuggestedTasks.map((task) => (
                  <div key={task.key} style={taskCard}>
                    <div style={{ fontWeight: 900 }}>{task.label}</div>
                    <div style={{ marginTop: 6, fontSize: 14, opacity: 0.78 }}>
                      {task.notes}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.72 }}>
                      {taskTypeLabel(task.taskType)} • {task.priority} • due {fmtDate(task.dueOn)}
                    </div>

                    <form action={createOpportunityTask} style={{ marginTop: 10 }}>
                      <input type="hidden" name="title" value={task.title} />
                      <input type="hidden" name="task_type" value={task.taskType} />
                      <input type="hidden" name="priority" value={task.priority} />
                      <input type="hidden" name="due_on" value={task.dueOn} />
                      <input type="hidden" name="notes" value={task.notes} />
                      <input
                        type="hidden"
                        name="assigned_to_username"
                        value={String(lead.assigned_to_username ?? "")}
                      />
                      <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                        Create suggested task
                      </ServerSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <h2 style={{ ...sectionTitle, marginTop: 18 }}>Quick task buttons</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <form action={createOpportunityTask} style={quickTaskForm}>
                <input type="hidden" name="title" value={`Quote chase ${lead.company_name}`} />
                <input type="hidden" name="task_type" value="quote_chase" />
                <input type="hidden" name="priority" value="high" />
                <input type="hidden" name="due_on" value={addDays(new Date(), 2).toISOString().slice(0, 10)} />
                <ServerSubmitButton style={primaryBtn} pendingText="Working…">Create quote chase task</ServerSubmitButton>
              </form>

              <form action={createOpportunityTask} style={quickTaskForm}>
                <input type="hidden" name="title" value={`Call back ${lead.company_name}`} />
                <input type="hidden" name="task_type" value="call" />
                <input type="hidden" name="priority" value="high" />
                <input type="hidden" name="due_on" value={addDays(new Date(), 1).toISOString().slice(0, 10)} />
                <ServerSubmitButton style={secondaryBtn} pendingText="Working…">Create call back task</ServerSubmitButton>
              </form>

              <form action={createOpportunityTask} style={quickTaskForm}>
                <input type="hidden" name="title" value={`Follow up ${lead.company_name}`} />
                <input type="hidden" name="task_type" value="follow_up" />
                <input type="hidden" name="priority" value="medium" />
                <input type="hidden" name="due_on" value={String(lead.next_follow_up_on ?? addDays(new Date(), 3).toISOString().slice(0, 10))} />
                <ServerSubmitButton style={secondaryBtn} pendingText="Working…">Create follow-up task</ServerSubmitButton>
              </form>

              <form action={createOpportunityTask} style={quickTaskForm}>
                <input type="hidden" name="title" value={`Close check ${lead.company_name}`} />
                <input type="hidden" name="task_type" value="follow_up" />
                <input type="hidden" name="priority" value="high" />
                <input type="hidden" name="due_on" value={String(lead.expected_close_date ?? addDays(new Date(), 3).toISOString().slice(0, 10))} />
                <ServerSubmitButton style={secondaryBtn} pendingText="Working…">Create close check task</ServerSubmitButton>
              </form>
            </div>

            <div style={{ ...summaryBox, marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Custom workflow task</div>
              <form action={createOpportunityTask} style={{ display: "grid", gap: 10 }}>
                <input
                  name="title"
                  defaultValue={`Follow up ${lead.company_name}`}
                  placeholder="Task title"
                  style={inputStyle}
                />

                <select name="task_type" defaultValue="follow_up" style={inputStyle}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="quote_chase">Quote chase</option>
                  <option value="follow_up">Follow up</option>
                  <option value="social_post">Social post</option>
                  <option value="customer_recovery">Customer recovery</option>
                  <option value="other">Other</option>
                </select>

                <select name="priority" defaultValue="medium" style={inputStyle}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>

                <input
                  name="assigned_to_username"
                  defaultValue={String(lead.assigned_to_username ?? "")}
                  placeholder="Assign to username"
                  style={inputStyle}
                />

                <input
                  type="date"
                  name="due_on"
                  defaultValue={String(lead.next_follow_up_on ?? addDays(new Date(), 3).toISOString().slice(0, 10))}
                  style={inputStyle}
                />

                <textarea
                  name="notes"
                  placeholder="Task notes"
                  style={textareaStyle}
                />

                <ServerSubmitButton style={primaryBtn} pendingText="Working…">Create task</ServerSubmitButton>
              </form>
            </div>
          </section>
        </div>

        <div style={layoutGridBottom}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Opportunity summary</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <InfoRow label="Company">{lead.company_name}</InfoRow>
              <InfoRow label="Contact">{lead.contact_name || "—"}</InfoRow>
              <InfoRow label="Phone">{lead.phone || "—"}</InfoRow>
              <InfoRow label="Email">{lead.email || "—"}</InfoRow>
              <InfoRow label="Owner">{lead.assigned_to_username || "—"}</InfoRow>
              <InfoRow label="Status">{lead.status || "New"}</InfoRow>
              <InfoRow label="Lead source">{lead.lead_source || "—"}</InfoRow>
              <InfoRow label="Created">{fmtDate(lead.created_at)}</InfoRow>
              <InfoRow label="Updated">{fmtDate(lead.updated_at)}</InfoRow>
              <InfoRow label="Services">
                {Array.isArray(lead.services) && lead.services.length ? lead.services.join(", ") : "—"}
              </InfoRow>
            </div>

            <div style={{ ...summaryBox, marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Forecast snapshot</div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                This opportunity is currently forecast at <strong>{moneyGBP(weightedValue)}</strong>,
                based on an opportunity value of <strong>{moneyGBP(lead.opportunity_value)}</strong> and
                probability of <strong>{probability}%</strong>.
              </div>
            </div>

            {lead.notes ? (
              <div style={{ ...summaryBox, marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Lead notes</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>
                  {lead.notes}
                </div>
              </div>
            ) : null}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Related tasks</h2>

            {relatedTasks.length === 0 ? (
              <p style={{ margin: 0, opacity: 0.78 }}>No workflow tasks linked to this opportunity yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {relatedTasks.map((task: any) => (
                  <div key={task.id} style={taskCard}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ ...pillStyle, ...statusStyle(task.status) }}>
                        {String(task.status ?? "open").toUpperCase()}
                      </span>
                      <span style={taskTypePill}>{taskTypeLabel(task.task_type)}</span>
                    </div>

                    <div style={{ marginTop: 8, fontWeight: 800 }}>{task.title}</div>

                    <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                      Assigned to {task.assigned_to_username || "Unassigned"} • Due {fmtDate(task.due_on)}
                    </div>

                    {task.completed_at ? (
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        Completed {fmtDateTime(task.completed_at)}
                      </div>
                    ) : null}

                    {task.notes ? (
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{task.notes}</div>
                    ) : null}

                    <div style={{ marginTop: 10 }}>
                      <a href="/sales-hub/workflows" style={linkBtn}>Open workflow board</a>
                    </div>
                  </div>
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
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

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  gap: 16,
  marginTop: 16,
};

const layoutGridBottom: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.9fr)",
  gap: 16,
  marginTop: 16,
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

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 130,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const summaryBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const taskCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const taskTypePill: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(0,0,0,0.06)",
  color: "#333",
  border: "1px solid rgba(0,0,0,0.10)",
};

const quickTaskForm: React.CSSProperties = {
  margin: 0,
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
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const successCard: React.CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};
