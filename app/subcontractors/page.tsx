import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { geocodeAddress } from "../lib/geocode";
import { requireOfficeUser } from "../lib/routeGuards";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { isInviteExpired, onboardingStatusLabel } from "../lib/subcontractorOnboarding";
import PublicOnboardingLink from "./PublicOnboardingLink";

type SearchParams = {
  q?: string;
  qualification?: string;
  postcode?: string;
  radius?: string;
  view?: string;
};

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return earthRadiusMiles * c;
}

export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireOfficeUser();
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const q = String(searchParams?.q ?? "").trim().toLowerCase();
  const qualificationFilter = String(searchParams?.qualification ?? "").trim().toLowerCase();
  const postcode = String(searchParams?.postcode ?? "").trim();
  const radiusMiles = Math.max(0, Number(searchParams?.radius ?? 0) || 0);
  const view = String(searchParams?.view ?? "active").toLowerCase();

  const { data: onboardingRows, error: onboardingError } = await admin
    .from("subcontractor_onboarding_invites")
    .select("id, invitee_name, invitee_email, invitee_phone, invited_role, status, expires_at, first_opened_at, last_saved_at, submitted_at, updated_at")
    .in("status", ["invite_sent", "in_progress", "submitted_for_review", "changes_required"])
    .order("updated_at", { ascending: false })
    .limit(20);

  const onboardingIds = (onboardingRows ?? []).map((row: any) => row.id);
  const { data: deliveryEvents } = onboardingIds.length
    ? await admin
        .from("subcontractor_onboarding_events")
        .select("invite_id, event_type, created_at")
        .in("invite_id", onboardingIds)
        .in("event_type", ["email_sent", "whatsapp_opened"])
        .order("created_at", { ascending: false })
    : { data: [] as any[] };

  const latestDeliveryByInvite = new Map<string, any>();
  for (const event of deliveryEvents ?? []) {
    if (!latestDeliveryByInvite.has(String(event.invite_id))) {
      latestDeliveryByInvite.set(String(event.invite_id), event);
    }
  }

  const onboardingWithDelivery = (onboardingRows ?? []).map((invite: any) => ({
    ...invite,
    latestDelivery: latestDeliveryByInvite.get(String(invite.id)) ?? null,
  }));
  const submittedOnboarding = onboardingWithDelivery.filter((invite: any) => invite.status === "submitted_for_review");
  const needsSendingOnboarding = onboardingWithDelivery.filter((invite: any) =>
    invite.status !== "submitted_for_review" && !invite.latestDelivery && !invite.first_opened_at
  );
  const awaitingOnboarding = onboardingWithDelivery.filter((invite: any) =>
    invite.status !== "submitted_for_review" && (invite.latestDelivery || invite.first_opened_at)
  );

  let query = supabase
    .from("operators")
    .select(`
      id,
      full_name,
      company_name,
      phone,
      email,
      role,
      status,
      notes,
      archived,
      base_postcode,
      base_lat,
      base_lng,
      standard_day_rate,
      standard_hourly_rate,
      pay_basis,
      subcontractor_payment_type,
      has_login,
      employment_type
    `)
    .eq("employment_type", "subcontractor")
    .order("full_name", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no filter
  } else {
    query = query.eq("archived", false);
  }

  const { data: operators, error } = await query;
  const rows = operators ?? [];

  const operatorIds = rows.map((row: any) => row.id);
  const { data: qualifications } = operatorIds.length
    ? await supabase
        .from("operator_qualifications")
        .select("id, operator_id, qualification_name, expiry_date")
        .in("operator_id", operatorIds)
        .order("qualification_name", { ascending: true })
    : { data: [] as any[] };

  const quals = (qualifications ?? []) as any[];
  const qualificationsByOperator = new Map<string, any[]>();
  const qualificationOptions = Array.from(
    new Set<string>(
      quals
        .map((item: any) => String(item.qualification_name ?? "").trim())
        .filter((value: string) => value.length > 0)
    )
  ).sort((a: string, b: string) => a.localeCompare(b));

  quals.forEach((item: any) => {
    const key = String(item.operator_id);
    const existing = qualificationsByOperator.get(key) ?? [];
    existing.push(item);
    qualificationsByOperator.set(key, existing);
  });

  let origin: { lat: number; lng: number } | null = null;
  if (postcode && radiusMiles > 0) {
    const geocoded = await geocodeAddress(postcode);
    if (geocoded) {
      origin = { lat: geocoded.lat, lng: geocoded.lng };
    }
  }

  const enriched = [] as any[];
  for (const row of rows) {
    let milesAway: number | null = null;
    let lat = row.base_lat != null ? Number(row.base_lat) : null;
    let lng = row.base_lng != null ? Number(row.base_lng) : null;

    if (origin && (!(Number.isFinite(lat) && Number.isFinite(lng))) && row.base_postcode) {
      const geocoded = await geocodeAddress(String(row.base_postcode));
      if (geocoded) {
        lat = geocoded.lat;
        lng = geocoded.lng;
      }
    }

    if (origin && Number.isFinite(lat) && Number.isFinite(lng)) {
      milesAway = distanceMiles(origin.lat, origin.lng, Number(lat), Number(lng));
    }

    enriched.push({
      ...row,
      milesAway,
      qualifications: qualificationsByOperator.get(String(row.id)) ?? [],
    });
  }

  const filtered = enriched.filter((row) => {
    if (q) {
      const haystack = [row.full_name, row.company_name, row.role, row.email, row.phone, row.base_postcode, paymentTypeLabel(row.subcontractor_payment_type)]
        .map((v: any) => String(v ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(q)) return false;
    }

    if (qualificationFilter) {
      const hasQualification = (row.qualifications ?? []).some((item: any) =>
        String(item.qualification_name ?? "").trim().toLowerCase() === qualificationFilter
      );
      if (!hasQualification) return false;
    }

    if (origin && radiusMiles > 0) {
      if (row.milesAway == null) return false;
      if (row.milesAway > radiusMiles) return false;
    }

    return true;
  });

  return (
    <ClientShell>
      <div style={{ width: "min(1300px, 96vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Subcontractors</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Directory of assignable subcontractors with qualifications, postcode radius filtering and pay details.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/subcontractors/pay-report" style={secondaryBtn}>Weekly pay report</a>
            <a href="/subcontractors/new" style={secondaryBtn}>Add manually</a>
            <a href="/subcontractor-onboarding" target="_blank" rel="noreferrer" style={primaryBtn}>Open public onboarding form</a>
          </div>
        </div>


        <section style={onboardingCard}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Subcontractor onboarding</h2>
              <p style={{ margin: "5px 0 0", opacity: 0.76 }}>Public applications and direct invitations awaiting completion, review or changes.</p>
            </div>
          </div>
          <PublicOnboardingLink />
          {onboardingError ? (
            <div style={setupWarning}>Onboarding tables are not available yet. Run the supplied Supabase onboarding SQL before using invitations.</div>
          ) : onboardingWithDelivery.length === 0 ? (
            <div style={{ opacity: 0.72 }}>No open onboarding applications.</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <OnboardingGroup
                title="Submitted for review"
                description="Completed applications ready for the office to review."
                rows={submittedOnboarding}
                emptyText="No applications are currently awaiting review."
                defaultOpen={submittedOnboarding.length > 0}
              />
              <OnboardingGroup
                title="Needs link sending"
                description="No email or WhatsApp action has been recorded and the private form has not been opened."
                rows={needsSendingOnboarding}
                emptyText="No applications are waiting for their private link to be sent."
              />
              <OnboardingGroup
                title="Awaiting completion"
                description="The link has been shared or opened, but the application has not yet been submitted."
                rows={awaitingOnboarding}
                emptyText="No applications are currently awaiting completion."
              />
            </div>
          )}
        </section>

        <form method="get" style={filterCard}>
          <div style={filterGrid}>
            <Field label="Search" name="q" defaultValue={String(searchParams?.q ?? "")} placeholder="Name, company, role, postcode" />
            <div style={{ display: "grid", gap: 6 }}>
              <label style={labelStyle}>Qualification</label>
              <select name="qualification" defaultValue={String(searchParams?.qualification ?? "")} style={inputStyle}>
                <option value="">All qualifications</option>
                {qualificationOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <Field label="Postcode" name="postcode" defaultValue={String(searchParams?.postcode ?? "")} placeholder="e.g. SA1 8LB" />
            <Field label="Radius (miles)" name="radius" defaultValue={String(searchParams?.radius ?? "25")} type="number" />
            <div style={{ display: "grid", gap: 6 }}>
              <label style={labelStyle}>View</label>
              <select name="view" defaultValue={view} style={inputStyle}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={primaryBtn}>Apply filters</button>
            <a href="/subcontractors" style={secondaryBtn}>Reset</a>
          </div>
        </form>

        {error ? <div style={errorBox}>{error.message}</div> : null}

        {filtered.length === 0 ? (
          <div style={emptyCard}>No subcontractors found for the current filters.</div>
        ) : (
          <div style={gridCards}>
            {filtered.map((row: any) => (
              <a key={row.id} href={`/subcontractors/${row.id}`} style={cardLink}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 1000 }}>{row.full_name || "Unnamed"}</div>
                    <div style={{ marginTop: 4, opacity: 0.8 }}>{fmtText(row.company_name)}</div>
                  </div>
                  <span style={{ ...pill, ...(String(row.status).toLowerCase() === "active" ? pillGreen : pillAmber) }}>
                    {fmtText(row.status)}
                  </span>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 14 }}>
                  <div><strong>Trade:</strong> {fmtText(row.role)}</div>
                  <div><strong>Phone:</strong> {fmtText(row.phone)}</div>
                  <div><strong>Postcode:</strong> {fmtText(row.base_postcode)}</div>
                  <div><strong>Day rate:</strong> {row.standard_day_rate != null ? `£${Number(row.standard_day_rate).toFixed(2)}` : "—"}</div>
                  <div><strong>Pay basis:</strong> {fmtText(row.pay_basis)}</div>
                  <div><strong>How paid:</strong> {paymentTypeLabel(row.subcontractor_payment_type)}</div>
                  <div><strong>Login:</strong> {row.has_login ? "Yes" : "No"}</div>
                  {row.milesAway != null ? <div><strong>Distance:</strong> {row.milesAway.toFixed(1)} miles</div> : null}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(row.qualifications ?? []).slice(0, 6).map((item: any) => (
                    <span key={item.id} style={pillSmall}>{item.qualification_name}</span>
                  ))}
                  {(row.qualifications ?? []).length === 0 ? <span style={pillSmall}>No qualifications saved</span> : null}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function OnboardingGroup({
  title,
  description,
  rows,
  emptyText,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  rows: any[];
  emptyText: string;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} style={onboardingGroupDetails}>
      <summary style={onboardingGroupSummary}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 950, fontSize: 17 }}>
            {title} <span style={{ opacity: 0.55 }}>({rows.length})</span>
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{description}</div>
        </div>
        <span aria-hidden="true" style={dropdownHint}>Open / close</span>
      </summary>
      <div style={{ paddingTop: 10 }}>
        {rows.length === 0 ? <div style={groupEmpty}>{emptyText}</div> : (
          <div style={onboardingGrid}>
            {rows.map((invite: any) => {
              const expired = isInviteExpired(invite);
              const delivery = invite.latestDelivery;
              const deliveryText = delivery?.event_type === "email_sent"
                ? `Email sent ${fmtDateTime(delivery.created_at)}`
                : delivery?.event_type === "whatsapp_opened"
                  ? `WhatsApp opened ${fmtDateTime(delivery.created_at)}`
                  : invite.first_opened_at
                    ? `Form opened ${fmtDateTime(invite.first_opened_at)}`
                    : "Private link not sent";
              return (
                <a key={invite.id} href={`/subcontractors/onboarding/${invite.id}`} style={onboardingRow}>
                  <div>
                    <div style={{ fontWeight: 950 }}>{invite.invitee_name || "Unnamed"}</div>
                    <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75 }}>
                      {invite.invited_role || invite.invitee_email || invite.invitee_phone || "No role or contact details"}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 12, fontWeight: 800, opacity: 0.72 }}>{deliveryText}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ ...pill, ...onboardingPill(invite.status) }}>{onboardingStatusLabel(invite.status)}</span>
                    {expired ? <span style={{ ...pill, ...pillRed }}>Expired</span> : null}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function Field({ label, name, defaultValue, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} type={type} style={inputStyle} />
    </div>
  );
}

function onboardingPill(status: string): React.CSSProperties {
  if (status === "submitted_for_review") return { background: "rgba(37,99,235,.12)", color: "#1d4ed8", border: "1px solid rgba(37,99,235,.24)" };
  if (status === "changes_required") return { background: "rgba(245,158,11,.15)", color: "#92400e", border: "1px solid rgba(245,158,11,.28)" };
  if (status === "revoked") return pillRed;
  return { background: "rgba(0,0,0,.06)", color: "#111", border: "1px solid rgba(0,0,0,.12)" };
}

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
const filterCard: React.CSSProperties = { background: "rgba(255,255,255,0.18)", padding: 16, borderRadius: 14, border: "1px solid rgba(255,255,255,0.40)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)", display: "grid", gap: 12 };
const filterGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, opacity: 0.78 };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: 42, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,255,255,0.92)" };
const primaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "#111", color: "#fff", textDecoration: "none", fontWeight: 900, border: "none" };
const secondaryBtn: React.CSSProperties = { display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.82)", color: "#111", textDecoration: "none", fontWeight: 800, border: "1px solid rgba(0,0,0,0.10)" };
const errorBox: React.CSSProperties = { padding: "12px 14px", borderRadius: 12, background: "rgba(180,0,0,0.12)", border: "1px solid rgba(180,0,0,0.18)", color: "#8b0000", fontWeight: 700 };
const emptyCard: React.CSSProperties = { padding: 18, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.40)" };
const gridCards: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 };
const cardLink: React.CSSProperties = { display: "block", padding: 16, borderRadius: 14, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.40)", boxShadow: "0 8px 30px rgba(0,0,0,0.08)", color: "#111", textDecoration: "none" };
const pill: React.CSSProperties = { display: "inline-block", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900 };
const pillGreen: React.CSSProperties = { background: "rgba(0,180,120,0.12)", color: "#0b7a4b", border: "1px solid rgba(0,180,120,0.20)" };
const pillAmber: React.CSSProperties = { background: "rgba(255,170,0,0.14)", color: "#8a5200", border: "1px solid rgba(255,170,0,0.24)" };
const pillSmall: React.CSSProperties = { display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.10)" };

const onboardingCard: React.CSSProperties = { background: "rgba(255,255,255,0.24)", padding: 16, borderRadius: 14, border: "1px solid rgba(255,255,255,0.48)", boxShadow: "0 8px 30px rgba(0,0,0,0.07)", display: "grid", gap: 12 };
const onboardingGroupDetails: React.CSSProperties = { borderRadius: 12, border: "1px solid rgba(0,0,0,.08)", background: "rgba(255,255,255,.18)", padding: "0 12px 12px" };
const onboardingGroupSummary: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer", padding: "12px 0", listStyle: "none" };
const dropdownHint: React.CSSProperties = { flexShrink: 0, fontSize: 12, fontWeight: 850, opacity: 0.58 };
const onboardingGrid: React.CSSProperties = { display: "grid", gap: 8 };
const onboardingRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 12, borderRadius: 11, background: "rgba(255,255,255,.66)", border: "1px solid rgba(0,0,0,.07)", textDecoration: "none", color: "#111" };
const groupEmpty: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.42)", border: "1px dashed rgba(0,0,0,.12)", fontSize: 13, opacity: 0.72 };
const setupWarning: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, background: "rgba(245,158,11,.14)", border: "1px solid rgba(245,158,11,.24)", color: "#854d0e", fontWeight: 700 };
const pillRed: React.CSSProperties = { background: "rgba(190,0,0,.12)", color: "#991b1b", border: "1px solid rgba(190,0,0,.22)" };
