import ClientShell from "../../../ClientShell";
import LeadForm from "../new/LeadForm";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
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

  const [
    { data: lead, error },
    { data: activity, error: activityError },
  ] = await Promise.all([
    supabase.from("sales_leads").select("*").eq("id", params.id).single(),
    supabase
      .from("sales_lead_activity")
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
  };

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{(lead as any).company_name ?? "Lead"}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage lead details, follow-ups and activity history.
            </p>
          </div>

          <a href="/sales-hub/leads" style={secondaryBtn}>← Back to leads</a>
        </div>

        {errorMessage ? <div style={errorCard}>{decodeURIComponent(errorMessage)}</div> : null}
        {successMessage ? <div style={successCard}>{decodeURIComponent(successMessage)}</div> : null}
        {activityError ? <div style={errorCard}>{activityError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Status" value={String((lead as any).status ?? "New")} />
          <StatCard label="Lead score" value={String(stats.score)} />
          <StatCard label="Next follow-up" value={fmtDate((lead as any).next_follow_up_on)} />
          <StatCard label="Last contacted" value={fmtDateTime((lead as any).last_contacted_at)} />
          <StatCard label="Activity entries" value={String(stats.activityCount)} />
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
