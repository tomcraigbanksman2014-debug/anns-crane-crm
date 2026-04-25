import ClientShell from "../../../../ClientShell";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { geocodeAddress } from "../../../../lib/geocode";
import { redirect } from "next/navigation";
import SubcontractorForm from "../../SubcontractorForm";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function cleanNullable(value: FormDataEntryValue | null) {
  const s = clean(value);
  return s.length ? s : null;
}
function cleanNumber(value: FormDataEntryValue | null) {
  const s = clean(value);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function updateSubcontractor(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));
  if (!id) redirect(`/subcontractors?error=${encodeURIComponent("Subcontractor id missing.")}`);

  const fullName = clean(formData.get("full_name"));
  if (!fullName) {
    redirect(`/subcontractors/${id}/edit?error=${encodeURIComponent("Full name is required.")}`);
  }

  const basePostcode = cleanNullable(formData.get("base_postcode"));
  const coords = basePostcode ? await geocodeAddress(basePostcode) : null;

  const payload = {
    full_name: fullName,
    company_name: cleanNullable(formData.get("company_name")),
    phone: cleanNullable(formData.get("phone")),
    email: cleanNullable(formData.get("email")),
    role: cleanNullable(formData.get("role")),
    status: clean(formData.get("status")) || "active",
    notes: cleanNullable(formData.get("notes")),
    employment_type: "subcontractor",
    has_login: false,
    base_postcode: basePostcode,
    base_lat: coords?.lat ?? null,
    base_lng: coords?.lng ?? null,
    address_line_1: cleanNullable(formData.get("address_line_1")),
    address_line_2: cleanNullable(formData.get("address_line_2")),
    town_city: cleanNullable(formData.get("town_city")),
    county: cleanNullable(formData.get("county")),
    standard_day_rate: cleanNumber(formData.get("standard_day_rate")),
    standard_hourly_rate: cleanNumber(formData.get("standard_hourly_rate")),
    pay_basis: cleanNullable(formData.get("pay_basis")),
    payroll_notes: cleanNullable(formData.get("payroll_notes")),
    emergency_contact_name: cleanNullable(formData.get("emergency_contact_name")),
    emergency_contact_phone: cleanNullable(formData.get("emergency_contact_phone")),
    card_notes: cleanNullable(formData.get("card_notes")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("operators").update(payload).eq("id", id);
  if (error) {
    redirect(`/subcontractors/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/subcontractors/${id}?success=${encodeURIComponent("Subcontractor updated.")}`);
}

export default async function EditSubcontractorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: operator, error } = await supabase
    .from("operators")
    .select("*")
    .eq("id", params.id)
    .eq("employment_type", "subcontractor")
    .single();

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit subcontractor</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>Update subcontractor details, rates and location.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/subcontractors" style={secondaryBtn}>← Back to subcontractors</a>
            {operator?.id ? <a href={`/subcontractors/${operator.id}`} style={secondaryBtn}>Open subcontractor</a> : null}
          </div>
        </div>

        {error ? <div style={errorBox}>{error.message}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {!operator ? <div style={errorBox}>Subcontractor not found.</div> : <SubcontractorForm action={updateSubcontractor} initial={operator as any} submitLabel="Save subcontractor" />}
      </div>
    </ClientShell>
  );
}

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};
const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};
const errorBox: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};
