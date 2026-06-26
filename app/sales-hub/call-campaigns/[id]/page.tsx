import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { displayUserNameFromEmail } from "../../../lib/displayUserName";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  const raw = dateOnly(value);
  if (!raw) return "—";
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB");
}

function money(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

function normalisePhone(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "").trim();
}

function telHref(value: unknown) {
  const raw = String(value ?? "").trim();
  const cleaned = raw.replace(/(?!^)\+/g, "").replace(/[^+0-9]/g, "");
  return cleaned ? `tel:${cleaned}` : "#";
}

function daysSince(value: string | null | undefined) {
  const raw = dateOnly(value);
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function matchesService(row: any, service: string) {
  const normal = clean(row?.normal_hire).toLowerCase();
  const craneCount = Number(row?.crane_job_count ?? 0);
  const transportCount = Number(row?.transport_job_count ?? 0);

  if (service === "all") return true;
  if (service === "crane") return craneCount > 0;
  if (service === "transport") return transportCount > 0;
  if (service === "both") return craneCount > 0 && transportCount > 0;
  if (service === "hiab") return normal.includes("hiab");
  if (service === "low_loader") return normal.includes("low loader") || normal.includes("lowloader");
  if (service === "spider") return normal.includes("spider") || normal.includes("jekko");
  if (service === "contract_lift") return normal.includes("contract");
  return true;
}

function isDoneStatus(status: string) {
  return ["Quoted", "Won", "Not interested", "Wrong number", "Do not call"].includes(status);
}

async function updateCampaignContact(formData: FormData) {
  "use server";

  const campaignId = clean(formData.get("campaign_id"));
  const contactId = clean(formData.get("contact_id"));
  const status = clean(formData.get("status")) || "Not called";
  const outcome = clean(formData.get("outcome")) || null;
  const callNotes = clean(formData.get("call_notes")) || null;
  const nextFollowUpOn = clean(formData.get("next_follow_up_on")) || null;

  if (!campaignId || !contactId) {
    redirect("/sales-hub/call-campaigns?error=Missing%20campaign%20contact.");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: existing, error: readError } = await supabase
    .from("call_campaign_contacts")
    .select("id, campaign_id, client_id, company_name_snapshot, called_at")
    .eq("id", contactId)
    .eq("campaign_id", campaignId)
    .single();

  if (readError || !existing?.id) {
    redirect(`/sales-hub/call-campaigns/${campaignId}?error=${encodeURIComponent(readError?.message || "Could not read call contact.")}`);
  }

  const now = new Date().toISOString();
  const shouldMarkCalled = status !== "Not called" || Boolean(outcome) || Boolean(callNotes);

  const { error } = await supabase
    .from("call_campaign_contacts")
    .update({
      status,
      outcome,
      call_notes: callNotes,
      next_follow_up_on: nextFollowUpOn,
      called_at: shouldMarkCalled ? existing.called_at ?? now : null,
      completed_at: isDoneStatus(status) ? now : null,
    })
    .eq("id", contactId)
    .eq("campaign_id", campaignId);

  if (error) {
    redirect(`/sales-hub/call-campaigns/${campaignId}?error=${encodeURIComponent(error.message || "Could not save call update.")}`);
  }

  const username = displayUserNameFromEmail(user.email) || null;

  if (shouldMarkCalled) {
    await supabase.from("call_activity").insert({
      campaign_id: campaignId,
      campaign_contact_id: contactId,
      client_id: existing.client_id ?? null,
      activity_type: "call",
      outcome: outcome || status,
      notes: callNotes,
      follow_up_on: nextFollowUpOn,
      created_by_user_id: user.id,
      created_by_username: username,
    });
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: username,
    action: "call_campaign_contact_updated",
    entity_type: "call_campaign_contact",
    entity_id: contactId,
    meta: {
      campaign_id: campaignId,
      company_name: existing.company_name_snapshot,
      status,
      outcome,
      next_follow_up_on: nextFollowUpOn,
    },
  });

  redirect(`/sales-hub/call-campaigns/${campaignId}?success=${encodeURIComponent("Call result saved.")}`);
}

async function completeCampaign(formData: FormData) {
  "use server";

  const campaignId = clean(formData.get("campaign_id"));
  if (!campaignId) redirect("/sales-hub/call-campaigns");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("call_campaigns")
    .update({ status: "Completed", completed_at: new Date().toISOString() })
    .eq("id", campaignId);

  if (error) {
    redirect(`/sales-hub/call-campaigns/${campaignId}?error=${encodeURIComponent(error.message || "Could not complete campaign.")}`);
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: displayUserNameFromEmail(user.email) || null,
    action: "call_campaign_completed",
    entity_type: "call_campaign",
    entity_id: campaignId,
  });

  redirect(`/sales-hub/call-campaigns/${campaignId}?success=${encodeURIComponent("Campaign marked as completed.")}`);
}

async function reopenCampaign(formData: FormData) {
  "use server";

  const campaignId = clean(formData.get("campaign_id"));
  if (!campaignId) redirect("/sales-hub/call-campaigns");

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("call_campaigns")
    .update({ status: "Active", completed_at: null })
    .eq("id", campaignId);

  if (error) {
    redirect(`/sales-hub/call-campaigns/${campaignId}?error=${encodeURIComponent(error.message || "Could not reopen campaign.")}`);
  }

  await writeAuditLog({
    actor_user_id: user.id,
    actor_username: displayUserNameFromEmail(user.email) || null,
    action: "call_campaign_reopened",
    entity_type: "call_campaign",
    entity_id: campaignId,
  });

  redirect(`/sales-hub/call-campaigns/${campaignId}?success=${encodeURIComponent("Campaign reopened.")}`);
}

type CampaignDetailPageProps = {
  params: { id: string };
  searchParams?: {
    status?: string;
    service?: string;
    q?: string;
    phone?: string;
    success?: string;
    error?: string;
  };
};

export default async function CampaignDetailPage({ params, searchParams }: CampaignDetailPageProps) {
  const supabase = createSupabaseServerClient();
  const campaignId = params.id;
  const selectedStatus = clean(searchParams?.status) || "all";
  const selectedService = clean(searchParams?.service) || "all";
  const phoneFilter = clean(searchParams?.phone) || "all";
  const q = clean(searchParams?.q).toLowerCase();
  const successMessage = clean(searchParams?.success);
  const errorMessage = clean(searchParams?.error);

  const [{ data: campaign, error: campaignError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase
      .from("call_campaigns")
      .select("id, name, description, status, target_count, filter_settings, created_by_username, created_at, completed_at")
      .eq("id", campaignId)
      .single(),
    supabase
      .from("call_campaign_contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("sort_order", { ascending: true })
      .limit(1000),
  ]);

  if (campaignError || !campaign) {
    return (
      <ClientShell>
        <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{campaignError?.message || "Call campaign not found."}</div>
          <a href="/sales-hub/call-campaigns" style={secondaryBtn}>Back to Call Campaigns</a>
        </div>
      </ClientShell>
    );
  }

  const allRows = contacts ?? [];
  const filteredRows = allRows.filter((row: any) => {
    if (selectedStatus !== "all" && clean(row.status) !== selectedStatus) return false;
    if (!matchesService(row, selectedService)) return false;
    if (phoneFilter === "with_phone" && !normalisePhone(row.phone_snapshot)) return false;
    if (phoneFilter === "no_phone" && normalisePhone(row.phone_snapshot)) return false;

    if (q) {
      const haystack = [
        row.company_name_snapshot,
        row.contact_name_snapshot,
        row.phone_snapshot,
        row.email_snapshot,
        row.contact_source,
        row.contact_source_detail,
        row.normal_hire,
        row.last_site_area,
        row.last_job_type,
        row.call_notes,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  const calledCount = allRows.filter((row: any) => clean(row.status) !== "Not called").length;
  const noAnswerCount = allRows.filter((row: any) => clean(row.status) === "No answer").length;
  const callBackCount = allRows.filter((row: any) => clean(row.status) === "Call back" || row.next_follow_up_on).length;
  const quotedCount = allRows.filter((row: any) => clean(row.status) === "Quoted" || clean(row.outcome) === "Quoted").length;
  const wonCount = allRows.filter((row: any) => clean(row.status) === "Won" || clean(row.outcome) === "Won").length;
  const withPhoneCount = allRows.filter((row: any) => normalisePhone(row.phone_snapshot)).length;

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 98vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <p style={eyebrow}>Sales Hub / Call Campaigns</p>
            <h1 style={{ margin: 0, fontSize: 30 }}>{campaign.name}</h1>
            <p style={{ marginTop: 8, opacity: 0.76 }}>
              {campaign.description || "Work through this list, call customer profile contacts and job contacts, record the outcome and set follow-ups."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href="/sales-hub/call-campaigns" style={secondaryBtn}>Back</a>
            {campaign.status === "Completed" ? (
              <form action={reopenCampaign}>
                <input type="hidden" name="campaign_id" value={campaign.id} />
                <button style={secondaryButtonElement}>Reopen</button>
              </form>
            ) : (
              <form action={completeCampaign}>
                <input type="hidden" name="campaign_id" value={campaign.id} />
                <button style={primaryButtonElement}>Mark completed</button>
              </form>
            )}
          </div>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage || contactsError ? <div style={errorBox}>{errorMessage || contactsError?.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Targets" value={String(allRows.length)} />
          <StatCard label="With phone" value={String(withPhoneCount)} />
          <StatCard label="Called" value={String(calledCount)} />
          <StatCard label="No answer" value={String(noAnswerCount)} />
          <StatCard label="Callbacks" value={String(callBackCount)} />
          <StatCard label="Quoted" value={String(quotedCount)} />
          <StatCard label="Won" value={String(wonCount)} />
        </div>

        <section style={{ ...cardStyle, marginTop: 14 }}>
          <form style={filterGrid}>
            <label style={labelStyle}>
              Search
              <input name="q" defaultValue={searchParams?.q ?? ""} placeholder="company, contact, phone, source, area, normal hire..." style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Status
              <select name="status" defaultValue={selectedStatus} style={inputStyle}>
                <option value="all">All statuses</option>
                <option value="Not called">Not called</option>
                <option value="Called">Called</option>
                <option value="No answer">No answer</option>
                <option value="Left voicemail">Left voicemail</option>
                <option value="Call back">Call back</option>
                <option value="Quoted">Quoted</option>
                <option value="Won">Won</option>
                <option value="Not interested">Not interested</option>
                <option value="Wrong number">Wrong number</option>
                <option value="Do not call">Do not call</option>
              </select>
            </label>
            <label style={labelStyle}>
              Service
              <select name="service" defaultValue={selectedService} style={inputStyle}>
                <option value="all">All services</option>
                <option value="crane">Crane</option>
                <option value="transport">Transport</option>
                <option value="both">Crane + transport</option>
                <option value="hiab">HIAB</option>
                <option value="low_loader">Low loader</option>
                <option value="spider">Spider / Jekko</option>
                <option value="contract_lift">Contract lift</option>
              </select>
            </label>
            <label style={labelStyle}>
              Phone
              <select name="phone" defaultValue={phoneFilter} style={inputStyle}>
                <option value="all">All</option>
                <option value="with_phone">With phone</option>
                <option value="no_phone">No phone</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <button style={primaryButtonElement}>Filter</button>
              <a href={`/sales-hub/call-campaigns/${campaign.id}`} style={secondaryBtn}>Clear</a>
            </div>
          </form>
        </section>

        <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {filteredRows.length === 0 ? (
            <div style={cardStyle}>No contacts match the current filters.</div>
          ) : (
            filteredRows.map((row: any) => {
              const phone = clean(row.phone_snapshot);
              const hasPhone = Boolean(normalisePhone(phone));
              const dormantDays = daysSince(row.last_job_date);

              return (
                <article key={row.id} style={contactCard}>
                  <div style={contactMainGrid}>
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <a href={`/customers/${row.client_id}`} style={companyLink}>{row.company_name_snapshot}</a>
                        <span style={statusPill(row.status)}>{row.status || "Not called"}</span>
                      </div>

                      <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 14 }}>
                        <div><strong>Contact:</strong> {row.contact_name_snapshot || "—"}</div>
                        <div>
                          <strong>Phone:</strong>{" "}
                          {hasPhone ? (
                            <a href={telHref(phone)} style={callLink}>Call {phone}</a>
                          ) : (
                            <span style={{ color: "#b91c1c", fontWeight: 900 }}>No number</span>
                          )}
                        </div>
                        <div><strong>Email:</strong> {row.email_snapshot || "—"}</div>
                        <div>
                          <strong>Contact source:</strong> {row.contact_source || "Customer profile"}
                          {row.contact_source_detail ? ` • ${row.contact_source_detail}` : ""}
                          {row.contact_last_used_on ? ` • Last used ${fmtDate(row.contact_last_used_on)}` : ""}
                        </div>
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 14 }}>
                        <div><strong>Last job:</strong> {fmtDate(row.last_job_date)} {dormantDays !== null ? `(${dormantDays} days ago)` : ""}</div>
                        <div><strong>Last job type:</strong> {row.last_job_type || "—"}</div>
                        <div><strong>Normally hire:</strong> {row.normal_hire || "—"}</div>
                        <div><strong>Last site / route:</strong> {row.last_site_area || "—"}</div>
                        <div><strong>History:</strong> {row.crane_job_count ?? 0} crane • {row.transport_job_count ?? 0} transport • Last value {money(row.last_value)}</div>
                      </div>

                      {row.suggested_call_angle ? (
                        <div style={callAngleBox}>
                          <strong>Suggested opener:</strong> {row.suggested_call_angle}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <a href={`/customers/${row.client_id}`} style={smallBtn}>Customer profile</a>
                        <a href={`/jobs/new?client_id=${row.client_id}`} style={smallBtn}>Create crane job</a>
                        <a href={`/transport-jobs/new?client_id=${row.client_id}`} style={smallBtn}>Create transport job</a>
                      </div>
                    </div>

                    <form action={updateCampaignContact} style={updatePanel}>
                      <input type="hidden" name="campaign_id" value={campaign.id} />
                      <input type="hidden" name="contact_id" value={row.id} />

                      <label style={labelStyle}>
                        Call status
                        <select name="status" defaultValue={row.status || "Not called"} style={inputStyle}>
                          <option value="Not called">Not called</option>
                          <option value="Called">Called</option>
                          <option value="No answer">No answer</option>
                          <option value="Left voicemail">Left voicemail</option>
                          <option value="Call back">Call back</option>
                          <option value="Quoted">Quoted</option>
                          <option value="Won">Won</option>
                          <option value="Not interested">Not interested</option>
                          <option value="Wrong number">Wrong number</option>
                          <option value="Do not call">Do not call</option>
                        </select>
                      </label>

                      <label style={labelStyle}>
                        Outcome
                        <input name="outcome" defaultValue={row.outcome ?? ""} placeholder="e.g. spoke to Steve, asked for quote..." style={inputStyle} />
                      </label>

                      <label style={labelStyle}>
                        Follow-up date
                        <input name="next_follow_up_on" type="date" defaultValue={dateOnly(row.next_follow_up_on)} style={inputStyle} />
                      </label>

                      <label style={labelStyle}>
                        Internal call notes
                        <textarea name="call_notes" defaultValue={row.call_notes ?? ""} rows={5} style={textareaStyle} placeholder="Notes from the call..." />
                      </label>

                      <button style={primaryButtonElement}>Save call result</button>
                    </form>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 24, fontWeight: 1000 }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.68 }}>{label}</div>
    </div>
  );
}

function statusPill(status: string | null | undefined): CSSProperties {
  const s = clean(status) || "Not called";
  let bg = "#e2e8f0";
  let color = "#0f172a";
  if (["Called", "Left voicemail"].includes(s)) bg = "#dbeafe";
  if (s === "No answer") bg = "#fef3c7";
  if (s === "Call back") bg = "#ede9fe";
  if (s === "Quoted") bg = "#cffafe";
  if (s === "Won") bg = "#dcfce7";
  if (["Not interested", "Wrong number", "Do not call"].includes(s)) {
    bg = "#fee2e2";
    color = "#991b1b";
  }

  return {
    display: "inline-flex",
    padding: "4px 9px",
    borderRadius: 999,
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 1000,
  };
}

const headerRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const eyebrow: CSSProperties = {
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontSize: 12,
  fontWeight: 900,
  opacity: 0.65,
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 14px 40px rgba(15,23,42,0.07)",
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const statCard: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
};

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px, 1.4fr) repeat(3, minmax(150px, 0.8fr)) auto",
  gap: 10,
  alignItems: "end",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(15,23,42,0.16)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
};

const contactCard: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
};

const contactMainGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1fr) minmax(280px, 380px)",
  gap: 16,
};

const updatePanel: CSSProperties = {
  display: "grid",
  gap: 10,
  alignSelf: "start",
  background: "#f8fafc",
  border: "1px solid rgba(15,23,42,0.10)",
  borderRadius: 16,
  padding: 12,
};

const companyLink: CSSProperties = {
  fontSize: 20,
  fontWeight: 1000,
  color: "#0f172a",
  textDecoration: "none",
};

const callLink: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#0f172a",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 1000,
};

const callAngleBox: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: "#fefce8",
  border: "1px solid #fde68a",
  fontSize: 14,
};

const smallBtn: CSSProperties = {
  display: "inline-flex",
  padding: "7px 10px",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(15,23,42,0.12)",
  fontSize: 13,
};

const secondaryBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.16)",
  color: "#0f172a",
  textDecoration: "none",
  fontWeight: 900,
  background: "#fff",
};

const primaryButtonElement: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 1000,
  cursor: "pointer",
};

const secondaryButtonElement: CSSProperties = {
  border: "1px solid rgba(15,23,42,0.16)",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 1000,
  cursor: "pointer",
};

const successBox: CSSProperties = {
  margin: "14px 0",
  padding: 12,
  borderRadius: 14,
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  fontWeight: 800,
};

const errorBox: CSSProperties = {
  margin: "14px 0",
  padding: 12,
  borderRadius: 14,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontWeight: 800,
};
