import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { writeAuditLog } from "../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../lib/access";
import { redirect } from "next/navigation";

import ServerSubmitButton from "../../components/ServerSubmitButton";
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

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
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

function priorityStyle(priority: string | null | undefined): React.CSSProperties {
  const v = String(priority ?? "medium");
  if (v === "urgent") {
    return {
      background: "rgba(180,0,0,0.12)",
      color: "#8a1f1f",
      border: "1px solid rgba(180,0,0,0.16)",
    };
  }
  if (v === "high") {
    return {
      background: "rgba(255,180,0,0.16)",
      color: "#8a6200",
      border: "1px solid rgba(255,180,0,0.18)",
    };
  }
  if (v === "low") {
    return {
      background: "rgba(0,0,0,0.06)",
      color: "#333",
      border: "1px solid rgba(0,0,0,0.10)",
    };
  }
  return {
    background: "rgba(0,120,255,0.12)",
    color: "#0d5ea8",
    border: "1px solid rgba(0,120,255,0.16)",
  };
}

type WorkflowsPageProps = {
  searchParams?: {
    owner?: string;
    status?: string;
    type?: string;
    success?: string;
    error?: string;
  };
};

export default async function SalesWorkflowTasksPage({
  searchParams,
}: WorkflowsPageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();
  const canManage = !!access.user && canCreateCustomers(access);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentUsername = fromAuthEmail(user?.email ?? null);

  const selectedOwner = String(searchParams?.owner ?? "all").trim();
  const selectedStatus = String(searchParams?.status ?? "open").trim().toLowerCase();
  const selectedType = String(searchParams?.type ?? "").trim().toLowerCase();
  const successMessage = String(searchParams?.success ?? "");
  const errorMessage = String(searchParams?.error ?? "");

  async function createTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();
    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/workflows?error=You%20do%20not%20have%20permission%20to%20create%20workflow%20tasks.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const title = String(formData.get("title") ?? "").trim();
    const taskType = String(formData.get("task_type") ?? "follow_up").trim() || "follow_up";
    const priority = String(formData.get("priority") ?? "medium").trim() || "medium";
    const dueOn = String(formData.get("due_on") ?? "").trim() || null;
    const assignedToUsername = String(formData.get("assigned_to_username") ?? "").trim() || null;
    const leadId = String(formData.get("lead_id") ?? "").trim() || null;
    const clientId = String(formData.get("client_id") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!title) {
      redirect("/sales-hub/workflows?error=Task%20title%20is%20required.");
    }

    const { data: created, error } = await supabase
      .from("sales_workflow_tasks")
      .insert({
        title,
        task_type: taskType,
        priority,
        due_on: dueOn,
        assigned_to_username: assignedToUsername,
        lead_id: leadId,
        client_id: clientId,
        notes,
        status: "open",
        created_by_user_id: user?.id ?? null,
        created_by_username: fromAuthEmail(user?.email ?? null) || null,
      })
      .select("id")
      .single();

    if (error || !created?.id) {
      redirect(`/sales-hub/workflows?error=${encodeURIComponent(error?.message || "Could not create task.")}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_created",
      entity_type: "sales_workflow_task",
      entity_id: created.id,
      meta: {
        title,
        task_type: taskType,
        priority,
        due_on: dueOn,
        assigned_to_username: assignedToUsername,
        lead_id: leadId,
        client_id: clientId,
      },
    });

    redirect("/sales-hub/workflows?success=Workflow%20task%20created.");
  }

  async function completeTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();
    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/workflows?error=You%20do%20not%20have%20permission%20to%20complete%20tasks.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const taskId = String(formData.get("task_id") ?? "").trim();
    if (!taskId) {
      redirect("/sales-hub/workflows?error=Missing%20task%20id.");
    }

    const nowIso = new Date().toISOString();

    const { data: task, error: taskError } = await supabase
      .from("sales_workflow_tasks")
      .select("id, title, status")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      redirect("/sales-hub/workflows?error=Task%20not%20found.");
    }

    const { error } = await supabase
      .from("sales_workflow_tasks")
      .update({
        status: "completed",
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", taskId);

    if (error) {
      redirect(`/sales-hub/workflows?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_completed",
      entity_type: "sales_workflow_task",
      entity_id: taskId,
      meta: {
        title: task.title,
        previous_status: task.status,
        new_status: "completed",
      },
    });

    redirect("/sales-hub/workflows?success=Task%20completed.");
  }

  async function reopenTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();
    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/workflows?error=You%20do%20not%20have%20permission%20to%20reopen%20tasks.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const taskId = String(formData.get("task_id") ?? "").trim();
    if (!taskId) {
      redirect("/sales-hub/workflows?error=Missing%20task%20id.");
    }

    const { data: task, error: taskError } = await supabase
      .from("sales_workflow_tasks")
      .select("id, title, status")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      redirect("/sales-hub/workflows?error=Task%20not%20found.");
    }

    const { error } = await supabase
      .from("sales_workflow_tasks")
      .update({
        status: "open",
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      redirect(`/sales-hub/workflows?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_reopened",
      entity_type: "sales_workflow_task",
      entity_id: taskId,
      meta: {
        title: task.title,
        previous_status: task.status,
        new_status: "open",
      },
    });

    redirect("/sales-hub/workflows?success=Task%20reopened.");
  }

  async function cancelTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();
    if (!access.user || !canCreateCustomers(access)) {
      redirect("/sales-hub/workflows?error=You%20do%20not%20have%20permission%20to%20cancel%20tasks.");
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const taskId = String(formData.get("task_id") ?? "").trim();
    if (!taskId) {
      redirect("/sales-hub/workflows?error=Missing%20task%20id.");
    }

    const { data: task, error: taskError } = await supabase
      .from("sales_workflow_tasks")
      .select("id, title, status")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      redirect("/sales-hub/workflows?error=Task%20not%20found.");
    }

    const { error } = await supabase
      .from("sales_workflow_tasks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      redirect(`/sales-hub/workflows?error=${encodeURIComponent(error.message)}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_cancelled",
      entity_type: "sales_workflow_task",
      entity_id: taskId,
      meta: {
        title: task.title,
        previous_status: task.status,
        new_status: "cancelled",
      },
    });

    redirect("/sales-hub/workflows?success=Task%20cancelled.");
  }

  const [
    { data: tasks, error: tasksError },
    { data: leads, error: leadsError },
    { data: clients, error: clientsError },
  ] = await Promise.all([
    supabase
      .from("sales_workflow_tasks")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_leads")
      .select("id, company_name, status, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
    supabase
      .from("clients")
      .select("id, company_name, archived")
      .eq("archived", false)
      .order("company_name", { ascending: true }),
  ]);

  const ownerOptions: string[] = Array.from(
    new Set<string>(
      (tasks ?? [])
        .map((row: any) => String(row.assigned_to_username ?? "").trim())
        .filter(Boolean)
        .concat(currentUsername ? [currentUsername] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const leadMap = new Map<string, string>();
  for (const row of leads ?? []) {
    leadMap.set(String(row.id), String(row.company_name ?? "Lead"));
  }

  const clientMap = new Map<string, string>();
  for (const row of clients ?? []) {
    clientMap.set(String(row.id), String(row.company_name ?? "Customer"));
  }

  const filteredTasks = (tasks ?? []).filter((task: any) => {
    const ownerOk =
      selectedOwner === "all" ||
      String(task.assigned_to_username ?? "").trim() === selectedOwner;

    const statusOk =
      selectedStatus === "all" ||
      String(task.status ?? "").trim().toLowerCase() === selectedStatus;

    const typeOk =
      !selectedType ||
      String(task.task_type ?? "").trim().toLowerCase() === selectedType;

    return ownerOk && statusOk && typeOk;
  });

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = addDays(new Date(), -7).toISOString();

  const openCount = (tasks ?? []).filter((task: any) => String(task.status ?? "") === "open").length;
  const overdueCount = (tasks ?? []).filter(
    (task: any) =>
      String(task.status ?? "") === "open" &&
      task.due_on &&
      dateOnly(task.due_on) < today
  ).length;
  const dueTodayCount = (tasks ?? []).filter(
    (task: any) =>
      String(task.status ?? "") === "open" &&
      task.due_on &&
      dateOnly(task.due_on) === today
  ).length;
  const completedThisWeekCount = (tasks ?? []).filter(
    (task: any) =>
      String(task.status ?? "") === "completed" &&
      task.completed_at &&
      String(task.completed_at) >= weekAgo
  ).length;

  const taskTypes = [
    "call",
    "email",
    "quote_chase",
    "follow_up",
    "social_post",
    "customer_recovery",
    "other",
  ];

  const priorityTypes = ["low", "medium", "high", "urgent"];

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Workflow Tasks</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create, assign and complete internal sales actions.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtn}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/automation" style={secondaryBtn}>
              Automation Centre
            </a>
          </div>
        </div>

        {successMessage ? <div style={successCard}>{decodeURIComponent(successMessage)}</div> : null}
        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {tasksError ? <div style={errorCard}>{tasksError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}
        {clientsError ? <div style={errorCard}>{clientsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Open tasks" value={String(openCount)} />
          <StatCard label="Overdue" value={String(overdueCount)} />
          <StatCard label="Due today" value={String(dueTodayCount)} />
          <StatCard label="Completed 7 days" value={String(completedThisWeekCount)} />
        </div>

        <div style={layoutGrid}>
          <section style={panelStyle}>
            <h2 style={sectionTitle}>Create task</h2>

            {canManage ? (
              <form action={createTask} style={{ display: "grid", gap: 12 }}>
                <div style={fieldGrid}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Task title</label>
                    <input
                      type="text"
                      name="title"
                      placeholder="Call today, send quote chase, follow up next Tuesday..."
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Task type</label>
                    <select name="task_type" defaultValue="follow_up" style={inputStyle}>
                      {taskTypes.map((item) => (
                        <option key={item} value={item}>
                          {taskTypeLabel(item)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Priority</label>
                    <select name="priority" defaultValue="medium" style={inputStyle}>
                      {priorityTypes.map((item) => (
                        <option key={item} value={item}>
                          {item.charAt(0).toUpperCase() + item.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Due date</label>
                    <input
                      type="date"
                      name="due_on"
                      defaultValue={today}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Assign to</label>
                    {ownerOptions.length > 0 ? (
                      <select
                        name="assigned_to_username"
                        defaultValue={currentUsername || ownerOptions[0] || ""}
                        style={inputStyle}
                      >
                        <option value="">Unassigned</option>
                        {ownerOptions.map((owner) => (
                          <option key={owner} value={owner}>
                            {owner}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name="assigned_to_username"
                        defaultValue={currentUsername}
                        style={inputStyle}
                      />
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Lead link</label>
                    <select name="lead_id" defaultValue="" style={inputStyle}>
                      <option value="">No lead linked</option>
                      {(leads ?? []).map((lead: any) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.company_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Customer link</label>
                    <select name="client_id" defaultValue="" style={inputStyle}>
                      <option value="">No customer linked</option>
                      {(clients ?? []).map((client: any) => (
                        <option key={client.id} value={client.id}>
                          {client.company_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      name="notes"
                      placeholder="Anything the office team should know..."
                      style={textareaStyle}
                    />
                  </div>
                </div>

                <div>
                  <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                    Create task
                  </ServerSubmitButton>
                </div>
              </form>
            ) : (
              <div style={mutedBox}>You do not have permission to create workflow tasks.</div>
            )}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitle}>Filter tasks</h2>

            <form method="get" action="/sales-hub/workflows" style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={labelStyle}>Owner</label>
                <select name="owner" defaultValue={selectedOwner} style={inputStyle}>
                  <option value="all">All owners</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Status</label>
                <select name="status" defaultValue={selectedStatus} style={inputStyle}>
                  <option value="open">Open</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="all">All</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Task type</label>
                <select name="type" defaultValue={selectedType} style={inputStyle}>
                  <option value="">All task types</option>
                  {taskTypes.map((item) => (
                    <option key={item} value={item}>
                      {taskTypeLabel(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                  Apply
                </ServerSubmitButton>
                <a href="/sales-hub/workflows" style={secondaryBtn}>
                  Clear
                </a>
              </div>
            </form>
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Tasks</h2>

          {filteredTasks.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.8 }}>No tasks matched the current filters.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filteredTasks.map((task: any) => {
                const linkedLeadName = task.lead_id ? leadMap.get(String(task.lead_id)) ?? "Lead" : null;
                const linkedClientName = task.client_id ? clientMap.get(String(task.client_id)) ?? "Customer" : null;

                const overdue =
                  String(task.status ?? "") === "open" &&
                  task.due_on &&
                  dateOnly(task.due_on) < today;

                return (
                  <div key={task.id} style={taskCard}>
                    <div style={taskHead}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ ...pillStyle, ...statusStyle(task.status) }}>
                            {String(task.status ?? "open").toUpperCase()}
                          </span>
                          <span style={{ ...pillStyle, ...priorityStyle(task.priority) }}>
                            {String(task.priority ?? "medium").toUpperCase()}
                          </span>
                          <span style={typePill}>{taskTypeLabel(task.task_type)}</span>
                          {overdue ? <span style={overduePill}>OVERDUE</span> : null}
                        </div>

                        <div style={{ marginTop: 10, fontWeight: 900, fontSize: 18 }}>
                          {task.title}
                        </div>

                        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.76 }}>
                          Assigned to {task.assigned_to_username || "Unassigned"} • Due {fmtDate(task.due_on)}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                          Created by {task.created_by_username || "Unknown"} • {fmtDateTime(task.created_at)}
                        </div>

                        {task.completed_at ? (
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                            Completed {fmtDateTime(task.completed_at)}
                          </div>
                        ) : null}

                        {linkedLeadName ? (
                          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.82 }}>
                            Lead: {linkedLeadName}
                          </div>
                        ) : null}

                        {linkedClientName ? (
                          <div style={{ marginTop: 4, fontSize: 13, opacity: 0.82 }}>
                            Customer: {linkedClientName}
                          </div>
                        ) : null}

                        {task.notes ? (
                          <div style={notesBox}>{task.notes}</div>
                        ) : null}
                      </div>

                      <div style={actionsWrap}>
                        {String(task.status ?? "") === "open" && canManage ? (
                          <form action={completeTask}>
                            <input type="hidden" name="task_id" value={task.id} />
                            <ServerSubmitButton style={miniDarkBtn} pendingText="Working…">
                              Complete
                            </ServerSubmitButton>
                          </form>
                        ) : null}

                        {String(task.status ?? "") === "completed" && canManage ? (
                          <form action={reopenTask}>
                            <input type="hidden" name="task_id" value={task.id} />
                            <ServerSubmitButton style={miniBtn} pendingText="Working…">
                              Reopen
                            </ServerSubmitButton>
                          </form>
                        ) : null}

                        {String(task.status ?? "") !== "cancelled" && canManage ? (
                          <form action={cancelTask}>
                            <input type="hidden" name="task_id" value={task.id} />
                            <ServerSubmitButton style={miniBtn} pendingText="Working…">
                              Cancel
                            </ServerSubmitButton>
                          </form>
                        ) : null}

                        {task.lead_id ? (
                          <a href={`/sales-hub/leads/${task.lead_id}`} style={miniBtnLink}>
                            Open lead
                          </a>
                        ) : null}

                        {task.client_id ? (
                          <a href={`/customers/${task.client_id}`} style={miniBtnLink}>
                            Open customer
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
  gap: 16,
  alignItems: "start",
  marginTop: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
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
  minHeight: 120,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
};

const taskCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const taskHead: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const actionsWrap: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const notesBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  fontSize: 14,
  lineHeight: 1.5,
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const typePill: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(0,0,0,0.06)",
  color: "#333",
  border: "1px solid rgba(0,0,0,0.10)",
};

const overduePill: React.CSSProperties = {
  ...pillStyle,
  background: "rgba(180,0,0,0.12)",
  color: "#8a1f1f",
  border: "1px solid rgba(180,0,0,0.16)",
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

const miniBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
  cursor: "pointer",
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

const mutedBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.82,
  fontWeight: 700,
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
