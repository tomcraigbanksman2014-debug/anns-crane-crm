import type { CSSProperties } from "react";
import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { writeAuditLog } from "../../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../../lib/access";
import { redirect } from "next/navigation";

import ServerSubmitButton from "../../../../components/ServerSubmitButton";
type LeadRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  area: string | null;
  industry: string | null;
  lead_source: string | null;
  status: string | null;
  services: string[] | null;
  notes: string | null;
  lead_score: number | null;
  do_not_contact: boolean | null;
  last_contacted_at: string | null;
  next_follow_up_on: string | null;
  assigned_to_username: string | null;
  archived: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  opportunity_value: number | null;
  probability_percent: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
};

type ActivityRow = {
  id: string;
  lead_id: string;
  entry_type: string | null;
  subject: string | null;
  message: string;
  created_by_username: string | null;
  created_at: string;
};

type PageProps = {
  params: { id: string };
  searchParams?: {
    success?: string;
    error?: string;
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

function formatDateTimeUK(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function formatMoneyGBP(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
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

function getSuggestedAngle(lead: LeadRow) {
  const status = String(lead.status ?? "").toLowerCase();
  const services = Array.isArray(lead.services) ? lead.services.join(" ").toLowerCase() : "";
  const industry = String(lead.industry ?? "").toLowerCase();

  if (status === "quoted") {
    return "Quote chase: check timescales, objections, competitor position and what is needed to win the work.";
  }

  if (status === "dormant") {
    return "Reactivation call: ask what they have coming up and whether AnnS can support again.";
  }

  if (status === "new" || status === "to contact") {
    return "First introduction: establish what they buy, how often they need support and who makes the decision.";
  }

  if (
    services.includes("transport") ||
    services.includes("hiab") ||
    services.includes("haulage") ||
    industry.includes("container") ||
    industry.includes("modular")
  ) {
    return "Transport angle: focus on HIAB, haulage, container movement, delivery flexibility and short-notice cover.";
  }

  if (
    services.includes("crane") ||
    services.includes("contract lift") ||
    services.includes("lifting") ||
    industry.includes("steel") ||
    industry.includes("glazing") ||
    industry.includes("construction")
  ) {
    return "Crane angle: focus on crane hire, contract lifts, problem solving, responsiveness and UK coverage.";
  }

  return "General sales angle: ask about upcoming jobs, current pain points and whether they need a dependable crane and transport partner.";
}

export default async function LeadOutreachPage({ params, searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const access = await getAccessContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManage = !!access.user && canCreateCustomers(access);
  const currentUsername = fromAuthEmail(user?.email ?? null);

  async function saveOutreachEntry(formData: FormData) {
    "use server";

    const access = await getAccessContext();

    if (!access.user || !canCreateCustomers(access)) {
      redirect(
        `/sales-hub/leads/${params.id}/outreach?error=${encodeURIComponent(
          "You do not have permission to save outreach activity."
        )}`
      );
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const leadId = params.id;
    const channel = String(formData.get("channel") ?? "call").trim() || "call";
    const outcome = String(formData.get("outcome") ?? "contacted").trim() || "contacted";
    const leadStatus = String(formData.get("lead_status") ?? "Contacted").trim() || "Contacted";
    const nextFollowUpOn = String(formData.get("next_follow_up_on") ?? "").trim() || null;
    const probabilityRaw = String(formData.get("probability_percent") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const summary = String(formData.get("summary") ?? "").trim();
    const detail = String(formData.get("detail") ?? "").trim();
    const lostReason = String(formData.get("lost_reason") ?? "").trim() || null;

    if (!summary) {
      redirect(
        `/sales-hub/leads/${params.id}/outreach?error=${encodeURIComponent(
          "A summary is required."
        )}`
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("sales_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      redirect(
        `/sales-hub/leads/${params.id}/outreach?error=${encodeURIComponent(
          leadError?.message || "Lead not found."
        )}`
      );
    }

    const probabilityNumber =
      probabilityRaw === ""
        ? null
        : Math.max(0, Math.min(100, Number(probabilityRaw) || 0));

    const finalSubject =
      subject ||
      `${channel.charAt(0).toUpperCase() + channel.slice(1)} outcome: ${outcome.replace(/_/g, " ")}`;

    const message = [
      `Lead: ${lead.company_name}`,
      `Channel: ${channel}`,
      `Outcome: ${outcome.replace(/_/g, " ")}`,
      `Status set to: ${leadStatus}`,
      nextFollowUpOn ? `Next follow-up: ${nextFollowUpOn}` : "",
      probabilityNumber !== null ? `Probability: ${probabilityNumber}%` : "",
      lostReason ? `Lost reason: ${lostReason}` : "",
      "",
      `Summary: ${summary}`,
      detail ? "" : "",
      detail ? "Detail:" : "",
      detail || "",
    ]
      .filter(Boolean)
      .join("\n");

    const { error: activityError } = await supabase.from("sales_lead_activity").insert({
      lead_id: leadId,
      entry_type: channel,
      subject: finalSubject,
      message,
      created_by_user_id: user?.id ?? null,
      created_by_username: fromAuthEmail(user?.email ?? null) || null,
    });

    if (activityError) {
      redirect(
        `/sales-hub/leads/${params.id}/outreach?error=${encodeURIComponent(activityError.message)}`
      );
    }

    const leadUpdate: Record<string, unknown> = {
      status: leadStatus,
      last_contacted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (nextFollowUpOn) {
      leadUpdate.next_follow_up_on = nextFollowUpOn;
    }

    if (probabilityNumber !== null) {
      leadUpdate.probability_percent = probabilityNumber;
    }

    if (lostReason) {
      leadUpdate.lost_reason = lostReason;
    }

    const { error: updateError } = await supabase
      .from("sales_leads")
      .update(leadUpdate)
      .eq("id", leadId);

    if (updateError) {
      redirect(
        `/sales-hub/leads/${params.id}/outreach?error=${encodeURIComponent(updateError.message)}`
      );
    }

    await writeAuditLog({
      actor_user_id: user?.id ?? null,
      actor_username: fromAuthEmail(user?.email ?? null) || null,
      action: "sales_lead_outreach_logged",
      entity_type: "sales_lead",
      entity_id: leadId,
      meta: {
        channel,
        outcome,
        lead_status: leadStatus,
        next_follow_up_on: nextFollowUpOn,
        probability_percent: probabilityNumber,
      },
    });

    redirect(
      `/sales-hub/leads/${params.id}/outreach?success=${encodeURIComponent(
        "Outreach activity saved."
      )}`
    );
  }

  const [
    { data: lead, error: leadError },
    { data: activity, error: activityError },
  ] = await Promise.all([
    supabase.from("sales_leads").select("*").eq("id", params.id).single(),
    supabase
      .from("sales_lead_activity")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (leadError || !lead) {
    return (
      <ClientShell>
        <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
          <div style={errorCard}>{leadError?.message || "Lead not found."}</div>
        </div>
      </ClientShell>
    );
  }

  const leadRow = lead as LeadRow;
  const activityRows = (activity ?? []) as ActivityRow[];
  const suggestedAngle = getSuggestedAngle(leadRow);

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Lead Outreach</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Log calls, emails and sales follow-ups for this lead in one place.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/call-planning" style={secondaryBtn}>
              ← Call Planning
            </a>
            <a href={`/sales-hub/leads/${leadRow.id}`} style={secondaryBtn}>
              Lead Record
            </a>
            <a href="/sales-hub" style={secondaryBtn}>
              Sales Hub
            </a>
          </div>
        </div>

        {searchParams?.success ? (
          <div style={successCard}>{decodeURIComponent(String(searchParams.success))}</div>
        ) : null}

        {searchParams?.error ? (
          <div style={errorCard}>{decodeURIComponent(String(searchParams.error))}</div>
        ) : null}

        {activityError ? <div style={errorCard}>{activityError.message}</div> : null}

        {leadRow.do_not_contact ? (
          <div style={warningCard}>
            This lead is marked as do not contact. Review before logging any outreach.
          </div>
        ) : null}

        <div style={statsGrid}>
          <StatCard label="Company" value={leadRow.company_name} />
          <StatCard label="Status" value={String(leadRow.status ?? "New")} />
          <StatCard label="Weighted value" value={formatMoneyGBP(weightedValueForLead(leadRow))} />
          <StatCard label="Probability" value={`${probabilityForLead(leadRow)}%`} />
        </div>

        <div style={twoColGrid}>
          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Lead summary</h2>

            <div style={{ display: "grid", gap: 10 }}>
              <InfoRow label="Company">{leadRow.company_name}</InfoRow>
              <InfoRow label="Contact">{leadRow.contact_name || "—"}</InfoRow>
              <InfoRow label="Phone">{leadRow.phone || "—"}</InfoRow>
              <InfoRow label="Email">{leadRow.email || "—"}</InfoRow>
              <InfoRow label="Area">{leadRow.area || "—"}</InfoRow>
              <InfoRow label="Industry">{leadRow.industry || "—"}</InfoRow>
              <InfoRow label="Owner">{leadRow.assigned_to_username || currentUsername || "—"}</InfoRow>
              <InfoRow label="Services">
                {Array.isArray(leadRow.services) && leadRow.services.length
                  ? leadRow.services.join(", ")
                  : "—"}
              </InfoRow>
              <InfoRow label="Next follow-up">{formatDateUK(leadRow.next_follow_up_on)}</InfoRow>
              <InfoRow label="Last contacted">{formatDateTimeUK(leadRow.last_contacted_at)}</InfoRow>
              <InfoRow label="Expected close">{formatDateUK(leadRow.expected_close_date)}</InfoRow>
            </div>

            <div style={suggestionBox}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Suggested call angle</div>
              <div>{suggestedAngle}</div>
            </div>
          </section>

          <section style={{ ...panelStyle, marginTop: 16 }}>
            <h2 style={sectionTitle}>Log outreach</h2>

            {!canManage ? (
              <div style={mutedBox}>You do not have permission to log outreach activity.</div>
            ) : (
              <form action={saveOutreachEntry} style={{ display: "grid", gap: 12 }}>
                <div style={formGrid}>
                  <div>
                    <label style={labelStyle}>Channel</label>
                    <select name="channel" defaultValue="call" style={inputStyle}>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="text">Text</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="note">Note</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Outcome</label>
                    <select name="outcome" defaultValue="contacted" style={inputStyle}>
                      <option value="contacted">Contacted</option>
                      <option value="no_answer">No answer</option>
                      <option value="left_voicemail">Left voicemail</option>
                      <option value="follow_up_needed">Follow-up needed</option>
                      <option value="quoted">Quoted</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="dormant">Dormant</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Lead status</label>
                    <select
                      name="lead_status"
                      defaultValue={String(leadRow.status ?? "Contacted")}
                      style={inputStyle}
                    >
                      <option value="New">New</option>
                      <option value="To Contact">To Contact</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Quoted">Quoted</option>
                      <option value="Follow Up">Follow Up</option>
                      <option value="Won">Won</option>
                      <option value="Lost">Lost</option>
                      <option value="Dormant">Dormant</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Next follow-up date</label>
                    <input
                      type="date"
                      name="next_follow_up_on"
                      defaultValue={String(leadRow.next_follow_up_on ?? "").slice(0, 10)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Probability %</label>
                    <input
                      type="number"
                      name="probability_percent"
                      min={0}
                      max={100}
                      defaultValue={String(probabilityForLead(leadRow))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Lost reason</label>
                    <input
                      name="lost_reason"
                      defaultValue={leadRow.lost_reason || ""}
                      style={inputStyle}
                      placeholder="Only fill if lead is lost"
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Subject</label>
                  <input
                    name="subject"
                    defaultValue=""
                    style={inputStyle}
                    placeholder="Optional subject line for this outreach entry"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Summary</label>
                  <input
                    name="summary"
                    style={inputStyle}
                    placeholder="Example: Spoke with buyer, they need a quote for next Thursday"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Detailed notes</label>
                  <textarea
                    name="detail"
                    style={textareaStyle}
                    placeholder="Record what was said, timing, objections, next steps and any commercial detail."
                  />
                </div>

                <div>
                  <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                    Save outreach activity
                  </ServerSubmitButton>
                </div>
              </form>
            )}
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Recent outreach history</h2>

          {!activityRows.length ? (
            <div style={mutedBox}>No outreach history logged yet for this lead.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {activityRows.map((row) => (
                <div key={row.id} style={activityCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{row.subject || "Activity entry"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.72 }}>
                        {String(row.entry_type ?? "note").toUpperCase()} • {row.created_by_username || "Unknown"}
                      </div>
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.72 }}>
                      {formatDateTimeUK(row.created_at)}
                    </div>
                  </div>

                  <div style={messageBox}>{row.message}</div>
                </div>
              ))}
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
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 1000, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700, wordBreak: "break-word" }}>{children}</div>
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

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 140,
  padding: 14,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
  resize: "vertical",
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

const successCard: CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const warningCard: CSSProperties = {
  background: "rgba(200,140,0,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(200,140,0,0.22)",
  marginBottom: 12,
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
  gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)",
  gap: 16,
};

const formGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const suggestionBox: CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.55,
};

const mutedBox: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  opacity: 0.82,
  fontWeight: 700,
};

const activityCard: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const messageBox: CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  fontSize: 14,
  lineHeight: 1.55,
};
