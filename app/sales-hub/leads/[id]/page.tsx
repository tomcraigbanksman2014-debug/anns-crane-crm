import ClientShell from "../../../ClientShell";
import LeadForm from "../new/LeadForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";
import { redirect } from "next/navigation";

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
}

function fromAuthEmail(email: string | null) {
  if (!email) return "";
  return email.split("@")[0] || "";
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

async function addLeadActivity(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const leadId = String(formData.get("lead_id") ?? "").trim();

  if (!leadId) {
    redirect("/sales-hub/leads?error=Missing%20lead%20id");
  }

  const entryType = String(formData.get("entry_type") ?? "note").trim() || "note";
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const message = String(formData.get("message") ?? "").trim();

  if (!message) {
    redirect(`/sales-hub/leads/${leadId}?error=${encodeURIComponent("Activity message is required.")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("sales_lead_activity").insert({
    lead_id: leadId,
    entry_type: entryType,
    subject,
    message,
    created_by_user_id: user?.id ?? null,
    created_by_username: fromAuthEmail(user?.email ?? null) || null,
  });

  if (error) {
    redirect(`/sales-hub/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  await writeAuditLog({
    actor_user_id: user?.id ?? null,
    actor_username: fromAuthEmail(user?.email ?? null) || null,
    action: "sales_lead_activity_added",
    entity_type: "sales_lead_activity",
    entity_id: leadId,
    meta: {
      lead_id: leadId,
      entry_type: entryType,
      subject,
    },
  });

  redirect(`/sales-hub/leads/${leadId}?success=${encodeURIComponent("Lead activity saved.")}`);
}

export default async function SalesLeadDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string; success?: string };
}) {
  const supabase = createSupabaseServerClient();
  const errorMessage = String(searchParams?.error ?? "");
  const successMessage = String(searchParams?.success ?? "");

  async function createLeadTask(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(`/sales-hub/leads/${params.id}?error=${encodeURIComponent("You do not have permission to create workflow tasks.")}`);
    }

    const supabase = createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("id, company_name, contact_name, next_follow_up_on, status")
      .eq("id", params.id)
      .single();

    if (leadError || !lead) {
      redirect(`/sales-hub/leads/${params.id}?error=${encodeURIComponent("Lead not found.")}`);
    }

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
      redirect(`/sales-hub/leads/${params.id}?error=${encodeURIComponent("Task title is required.")}`);
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
      redirect(`/sales-hub/leads/${params.id}?error=${encodeURIComponent(error?.message || "Could not create task.")}`);
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_workflow_task_created_from_lead",
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

    redirect(`/sales-hub/leads/${params.id}?success=${encodeURIComponent("Workflow task created.")}`);
  }

  const [
    { data: lead, error },
    { data: activity, error: activityError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    supabase.from("sales_leads").select("*").eq("id", params.id).single(),
    supabase
      .from("sales_lead_activity")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sales_workflow_tasks")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error || !lead) {
    return (
      <ClientShell>
        <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
          <div style={errorCard}>{error?.message || "Lead not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const services = Array.isArray((lead as any).services) ? ((lead as any).services as string[]) : [];
  const stats = {
    activityCount: (activity ?? []).length,
    score: Number((lead as any).lead_score ?? 0),
    openTasks: (tasks ?? []).filter((item: any) => String(item.status ?? "") === "open").length,
    completedTasks: (tasks ?? []).filter((item: any) => String(item.status ?? "") === "completed").length,
  };

  const defaultFollowUpDate =
    String((lead as any).next_follow_up_on ?? "").trim() ||
    new Date().toISOString().slice(0, 10);

  const quoteChaseDate = addDays(new Date(), 2).toISOString().slice(0, 10);
  const callDate = new Date().toISOString().slice(0, 10);
  const emailDate = addDays(new Date(), 1).toISOString().slice(0, 10);

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{(lead as any).company_name ?? "Lead"}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage lead details, follow-ups, related tasks and activity history.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/leads" style={secondaryBtn}>← Back to leads</a>
            <a href="/sales-hub/workflows" style={secondaryBtn}>Workflow tasks</a>
            <a href={`/sales-hub/leads/${params.id}/outreach`} style={primaryBtn}>
              Outreach Generator
            </a>
          </div>
        </div>

        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {successMessage ? <div style={successCard}>{decodeURIComponent(successMessage)}</div> : null}
        {activityError ? <div style={errorCard}>{activityError.message}</div> : null}
        {tasksError ? <div style={errorCard}>{tasksError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Status" value={String((lead as any).status ?? "New")} />
          <StatCard label="Lead score" value={String(stats.score)} />
          <StatCard label="Next follow-up" value={fmtDate((lead as any).next_follow_up_on)} />
          <StatCard label="Last contacted" value={fmtDateTime((lead as any).last_contacted_at)} />
          <StatCard label="Activity entries" value={String(stats.activityCount)} />
          <StatCard label="Open tasks" value={String(stats.openTasks)} />
          <StatCard label="Completed tasks" value={String(stats.completedTasks)} />
          <StatCard label="Do not contact" value={(lead as any).do_not_contact ? "Yes" : "No"} />
        </div>

        <div style={layoutGrid}>
          <div style={{ minWidth: 0 }}>
            <LeadForm mode="edit" lead={lead as any} />
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <section style={sideCard}>
              <h2 style={sectionTitle}>Lead snapshot</h2>
              <div style={{ display: "grid", gap: 8 }}>
                <Line label="Contact">{(lead as any).contact_name || "-"}</Line>
                <Line label="Email">{(lead as any).email || "-"}</Line>
                <Line label="Phone">{(lead as any).phone || "-"}</Line>
                <Line label="Area">{(lead as any).area || "-"}</Line>
                <Line label="Industry">{(lead as any).industry || "-"}</Line>
                <Line label="Source">{(lead as any).lead_source || "-"}</Line>
                <Line label="Assigned to">{(lead as any).assigned_to_username || "-"}</Line>
                <Line label="Created">{fmtDateTime((lead as any).created_at)}</Line>
                <Line label="Updated">{fmtDateTime((lead as any).updated_at)}</Line>
                <Line label="Services">
                  {services.length === 0 ? "-" : services.join(", ")}
                </Line>
              </div>
            </section>

            <section style={sideCard}>
              <h2 style={sectionTitle}>Quick task buttons</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <form action={createLeadTask} style={quickTaskForm}>
                  <input type="hidden" name="title" value={`Call ${String((lead as any).company_name ?? "lead")}`} />
                  <input type="hidden" name="task_type" value="call" />
                  <input type="hidden" name="priority" value="high" />
                  <input type="hidden" name="due_on" value={callDate} />
                  <button type="submit" style={primaryBtn}>Create call task</button>
                </form>

                <form action={createLeadTask} style={quickTaskForm}>
                  <input type="hidden" name="title" value={`Follow up ${String((lead as any).company_name ?? "lead")}`} />
                  <input type="hidden" name="task_type" value="follow_up" />
                  <input type="hidden" name="priority" value="high" />
                  <input type="hidden" name="due_on" value={defaultFollowUpDate} />
                  <button type="submit" style={secondaryBtn}>Create follow-up task</button>
                </form>

                <form action={createLeadTask} style={quickTaskForm}>
                  <input type="hidden" name="title" value={`Email ${String((lead as any).company_name ?? "lead")}`} />
                  <input type="hidden" name="task_type" value="email" />
                  <input type="hidden" name="priority" value="medium" />
                  <input type="hidden" name="due_on" value={emailDate} />
                  <button type="submit" style={secondaryBtn}>Create email task</button>
                </form>

                <form action={createLeadTask} style={quickTaskForm}>
                  <input type="hidden" name="title" value={`Quote chase ${String((lead as any).company_name ?? "lead")}`} />
                  <input type="hidden" name="task_type" value="quote_chase" />
                  <input type="hidden" name="priority" value="high" />
                  <input type="hidden" name="due_on" value={quoteChaseDate} />
                  <button type="submit" style={secondaryBtn}>Create quote chase task</button>
                </form>
              </div>
            </section>

            <section style={sideCard}>
              <h2 style={sectionTitle}>Custom workflow task</h2>
              <form action={createLeadTask} style={{ display: "grid", gap: 10 }}>
                <input
                  name="title"
                  placeholder="Task title"
                  defaultValue={`Follow up ${String((lead as any).company_name ?? "lead")}`}
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
                  type="date"
                  name="due_on"
                  defaultValue={defaultFollowUpDate}
                  style={inputStyle}
                />

                <input
                  name="assigned_to_username"
                  placeholder="Assign to username"
                  defaultValue={String((lead as any).assigned_to_username ?? "")}
                  style={inputStyle}
                />

                <textarea
                  name="notes"
                  rows={4}
                  placeholder="Task notes"
                  style={textareaStyle}
                />

                <button type="submit" style={primaryBtn}>Create task</button>
              </form>
            </section>

            <section style={sideCard}>
              <h2 style={sectionTitle}>Related tasks</h2>
              {!tasks || tasks.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.75 }}>No workflow tasks linked to this lead yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {tasks.map((task: any) => (
                    <div key={task.id} style={activityCard}>
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

            <section style={sideCard}>
              <h2 style={sectionTitle}>Add activity</h2>
              <form action={addLeadActivity} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="lead_id" value={params.id} />
                <select name="entry_type" defaultValue="note" style={inputStyle}>
                  <option value="note">Note</option>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="text">Text</option>
                </select>
                <input name="subject" placeholder="Subject (optional)" style={inputStyle} />
                <textarea name="message" rows={5} placeholder="What happened, what was said, what is next?" style={textareaStyle} />
                <button type="submit" style={primaryBtn}>Save activity</button>
              </form>
            </section>

            <section style={sideCard}>
              <h2 style={sectionTitle}>Activity history</h2>
              {!activity || activity.length === 0 ? (
                <p style={{ margin: 0, opacity: 0.75 }}>No lead activity yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {activity.map((item: any) => (
                    <div key={item.id} style={activityCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <strong>{item.subject || String(item.entry_type ?? "note").toUpperCase()}</strong>
                        <span style={{ fontSize: 12, opacity: 0.68 }}>{fmtDateTime(item.created_at)}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.7 }}>
                        {item.created_by_username ? `By ${item.created_by_username}` : "Activity"}
                      </div>
                      <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{item.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 600 }}>{children}</div>
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
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.8fr)",
  gap: 16,
  alignItems: "start",
  marginTop: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sideCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginTop: 12,
};

const successCard: React.CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginTop: 12,
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

const activityCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const quickTaskForm: React.CSSProperties = {
  margin: 0,
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
