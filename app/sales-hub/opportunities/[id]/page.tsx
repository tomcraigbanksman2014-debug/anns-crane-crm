import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { writeAuditLog } from "../../../lib/audit";
import { getAccessContext, canCreateCustomers } from "../../../lib/access";
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

  const { data: lead, error } = await supabase
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
    .single();

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

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{lead.company_name}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Opportunity detail and forecast settings.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub/opportunities" style={secondaryBtn}>
              ← Opportunities
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

        <div style={statsGrid}>
          <StatCard label="Lead score" value={String(lead.lead_score ?? 0)} />
          <StatCard label="Probability" value={`${probability}%`} />
          <StatCard label="Opportunity value" value={moneyGBP(lead.opportunity_value)} />
          <StatCard label="Weighted value" value={moneyGBP(weightedValue)} />
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
                <button type="submit" style={primaryBtn}>
                  Save opportunity
                </button>
              </div>
            </form>
          </section>

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
