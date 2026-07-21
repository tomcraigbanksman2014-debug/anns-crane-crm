import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getQualificationSummary } from "../../lib/utils/qualificationStatus";
import { requireOfficeUser } from "../../lib/routeGuards";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { SUBCONTRACTOR_DOCUMENT_BUCKET } from "../../lib/subcontractorOnboarding";

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || value === null || value === undefined || value === "") return "—";
  return `£${n.toFixed(2)}`;
}

function paymentTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "limited_company_invoice") return "Limited company - invoice";
  if (raw === "sole_trader_invoice") return "Sole trader - invoice";
  if (raw === "paye") return "PAYE";
  if (raw === "cis_20") return "CIS 20%";
  if (raw === "cis_30") return "CIS 30%";
  if (raw === "other") return "Other / confirm with office";
  return "—";
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") return { background: "rgba(0,180,120,0.12)", color: "#0b7a4b", border: "1px solid rgba(0,180,120,0.20)" };
  if (s === "inactive") return { background: "rgba(255,170,0,0.14)", color: "#8a5200", border: "1px solid rgba(255,170,0,0.24)" };
  return { background: "rgba(255,255,255,0.35)", color: "#111", border: "1px solid rgba(0,0,0,0.10)" };
}

export default async function SubcontractorDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string };
}) {
  const access = await requireOfficeUser();
  const canViewPrivate = access.role === "admin";
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const privateDetailsQuery = canViewPrivate
    ? admin.from("subcontractor_private_details").select("*").eq("operator_id", params.id).maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [{ data: operator, error }, { data: qualifications }, { data: privateDetails }, { data: onboardingDocuments }] = await Promise.all([
    supabase.from("operators").select("*").eq("id", params.id).eq("employment_type", "subcontractor").single(),
    supabase.from("operator_qualifications").select("*").eq("operator_id", params.id).order("expiry_date", { ascending: true }),
    privateDetailsQuery,
    admin.from("subcontractor_onboarding_documents").select("*").eq("operator_id", params.id).order("created_at", { ascending: false }),
  ]);

  const signedOnboardingDocuments = await Promise.all((onboardingDocuments ?? []).map(async (document: any) => {
    const { data } = await admin.storage
      .from(document.storage_bucket || SUBCONTRACTOR_DOCUMENT_BUCKET)
      .createSignedUrl(document.storage_path, 60 * 60, { download: document.original_filename || "document" });
    return { ...document, signedUrl: data?.signedUrl || null };
  }));

  const sourceSubmission = (privateDetails?.source_submission_data || {}) as Record<string, any>;
  const qualificationItems = qualifications ?? [];
  const summary = getQualificationSummary(qualificationItems as any);
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{operator?.full_name ?? "Subcontractor"}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Subcontractor profile, qualifications and pay details.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/subcontractors" style={secondaryBtn}>← Back to subcontractors</a>
            {operator?.id && canViewPrivate ? <a href={`/subcontractors/${operator.id}/edit`} style={secondaryBtn}>Edit subcontractor</a> : null}
            {operator?.id ? <a href={`/operators/${operator.id}/qualifications`} style={secondaryBtn}>Qualifications</a> : null}
          </div>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {error ? <div style={errorBox}>{error.message}</div> : null}

        {!operator ? (
          <div style={errorBox}>Subcontractor not found.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 16 }}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Profile</h2>
              <Row label="Full name" value={operator.full_name} />
              <Row label="Company name" value={operator.company_name} />
              <Row label="Role / trade" value={operator.role} />
              <Row label="Phone" value={operator.phone} />
              <Row label="Email" value={operator.email} />
              <Row label="Status" value={<span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, ...statusStyle(operator.status) }}>{operator.status || "—"}</span>} />
              <Row label="Base postcode" value={operator.base_postcode} />
              <Row label="Address line 1" value={operator.address_line_1} />
              <Row label="Address line 2" value={operator.address_line_2} />
              <Row label="Town / city" value={operator.town_city} />
              <Row label="County" value={operator.county} />
              <Row label="Has login" value={operator.has_login ? "Yes" : "No"} />
              <Block label="General notes" value={operator.notes} />
            </section>

            <div style={{ display: "grid", gap: 16 }}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Rates & payroll</h2>
                <Row label="Pay basis" value={operator.pay_basis} />
                <Row label="How paid" value={paymentTypeLabel(operator.subcontractor_payment_type)} />
                <Row label="Standard day rate" value={fmtMoney(operator.standard_day_rate)} />
                <Row label="Standard hourly rate" value={fmtMoney(operator.standard_hourly_rate)} />
                <Block label="Payroll notes" value={operator.payroll_notes} />
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Cards & qualifications</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={pillNeutral}>Total {summary.total}</span>
                  {summary.expiring > 0 ? <span style={pillWarn}>Expiring {summary.expiring}</span> : null}
                  {summary.expired > 0 ? <span style={pillBad}>Expired {summary.expired}</span> : null}
                </div>
                <Block label="Card notes" value={operator.card_notes} />
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {qualificationItems.length === 0 ? (
                    <div style={{ opacity: 0.72 }}>No qualifications saved yet.</div>
                  ) : qualificationItems.map((qualification: any) => (
                    <div key={qualification.id} style={miniCard}>
                      <div style={{ fontWeight: 900 }}>{qualification.qualification_name || "Qualification"}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        {qualification.issuer ? `${qualification.issuer} • ` : ""}
                        {qualification.certificate_number || "No certificate number"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>
                        Expiry: {qualification.expiry_date || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {privateDetails ? (
                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Onboarding & private details</h2>
                  <div style={privateWarning}>Sensitive information — admin access only.</div>
                  <Row label="Business type" value={String(privateDetails.business_type || "").replace(/_/g, " ")} />
                  <Row label="Date of birth" value={sourceSubmission.date_of_birth} />
                  <Row label="NI number" value={sourceSubmission.national_insurance_number} />
                  <Row label="Right to work confirmed" value={sourceSubmission.right_to_work_confirmed ? "Yes" : "No"} />
                  <Row label="Distance willing to travel" value={sourceSubmission.willing_travel_distance} />
                  <Row label="UTR" value={privateDetails.utr_number} />
                  <Row label="VAT number" value={privateDetails.vat_number} />
                  <Row label="Company number" value={privateDetails.company_registration_number} />
                  <Row label="Bank account name" value={privateDetails.bank_account_name} />
                  <Row label="Bank sort code" value={privateDetails.bank_sort_code} />
                  <Row label="Bank account number" value={privateDetails.bank_account_number} />
                  <Row label="Has own insurance" value={sourceSubmission.has_insurance_cover === "yes" ? "Yes" : sourceSubmission.has_insurance_cover === "no" ? "No" : "—"} />
                  <Row label="Insurance provider" value={privateDetails.insurance_provider} />
                  <Row label="Policy number" value={privateDetails.insurance_policy_number} />
                  <Row label="Insurance cover" value={privateDetails.insurance_cover_amount} />
                  <Row label="Insurance expiry" value={privateDetails.insurance_expiry_date} />
                  <Row label="Working terms accepted" value={sourceSubmission.working_terms_accepted ? "Yes" : "No"} />
                  <Row label="Declaration" value={privateDetails.declaration_name} />
                </section>
              ) : null}

              {signedOnboardingDocuments.length > 0 ? (
                <section style={sectionCard}>
                  <h2 style={sectionTitle}>Onboarding documents</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    {signedOnboardingDocuments.map((document: any) => (
                      <div key={document.id} style={documentRow}>
                        <div>
                          <div style={{ fontWeight: 900 }}>{document.original_filename}</div>
                          <div style={{ marginTop: 3, fontSize: 12, opacity: 0.72 }}>
                            {String(document.category || "other").replace(/_/g, " ")}
                            {document.expiry_date ? ` • Expires ${document.expiry_date}` : ""}
                          </div>
                        </div>
                        {document.signedUrl ? <a href={document.signedUrl} target="_blank" rel="noreferrer" style={openDocBtn}>Open</a> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Emergency contact</h2>
                <Row label="Name" value={operator.emergency_contact_name} />
                <Row label="Phone" value={operator.emergency_contact_phone} />
              </section>
            </div>
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={rowLabel}>{label}</div>
      <div>{typeof value === "string" ? fmtText(value) : value}</div>
    </div>
  );
}
function Block({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ ...rowStyle, alignItems: "flex-start" }}>
      <div style={rowLabel}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{fmtText(value)}</div>
    </div>
  );
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const secondaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", textDecoration: "none", fontWeight: 800, border: "1px solid rgba(0,0,0,0.10)" };
const sectionCard: React.CSSProperties = { background: "rgba(255,255,255,0.18)", padding: 16, borderRadius: 14, border: "1px solid rgba(255,255,255,0.40)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)" };
const sectionTitle: React.CSSProperties = { margin: "0 0 12px", fontSize: 22 };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "160px minmax(0,1fr)", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" };
const rowLabel: React.CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.4 };
const errorBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.18)", color: "#8b0000", fontWeight: 700 };
const successBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(0,160,80,0.14)", border: "1px solid rgba(0,160,80,0.18)", color: "#0b6b34", fontWeight: 700 };
const pillNeutral: React.CSSProperties = { display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, background: "rgba(0,0,0,0.06)", color: "#111", border: "1px solid rgba(0,0,0,0.10)" };
const pillWarn: React.CSSProperties = { ...pillNeutral, background: "rgba(255,170,0,0.14)", color: "#8a5200", border: "1px solid rgba(255,170,0,0.24)" };
const pillBad: React.CSSProperties = { ...pillNeutral, background: "rgba(255,0,0,0.12)", color: "#b00020", border: "1px solid rgba(255,0,0,0.22)" };
const miniCard: React.CSSProperties = { borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.72)", padding: 12 };

const privateWarning: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, background: "rgba(190,0,0,.08)", border: "1px solid rgba(190,0,0,.14)", color: "#7f1d1d", fontSize: 12, fontWeight: 800, marginBottom: 8 };
const documentRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, background: "rgba(255,255,255,.62)", border: "1px solid rgba(0,0,0,.07)" };
const openDocBtn: React.CSSProperties = { padding: "6px 9px", borderRadius: 8, background: "#111", color: "#fff", textDecoration: "none", fontWeight: 850, fontSize: 12 };
