import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { geocodeAddress } from "../lib/geocode";

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
  const supabase = createSupabaseServerClient();
  const q = String(searchParams?.q ?? "").trim().toLowerCase();
  const qualificationFilter = String(searchParams?.qualification ?? "").trim().toLowerCase();
  const postcode = String(searchParams?.postcode ?? "").trim();
  const radiusMiles = Math.max(0, Number(searchParams?.radius ?? 0) || 0);
  const view = String(searchParams?.view ?? "active").toLowerCase();

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

  const quals = qualifications ?? [];
  const qualificationsByOperator = new Map<string, any[]>();
  const qualificationOptions = Array.from(
    new Set(
      quals
        .map((item: any) => String(item.qualification_name ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

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
      const haystack = [row.full_name, row.company_name, row.role, row.email, row.phone, row.base_postcode]
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
            <a href="/subcontractors/new" style={primaryBtn}>+ Add subcontractor</a>
          </div>
        </div>

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

function Field({ label, name, defaultValue, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} defaultValue={defaultValue} placeholder={placeholder} type={type} style={inputStyle} />
    </div>
  );
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
