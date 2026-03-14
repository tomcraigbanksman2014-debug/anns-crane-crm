import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function createVehicle(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const payload = {
    name: clean(formData.get("name")) || null,
    reg_number: clean(formData.get("reg_number")) || null,
    vehicle_type: clean(formData.get("vehicle_type")) || null,
    capacity: clean(formData.get("capacity")) || null,
    trailer_type: clean(formData.get("trailer_type")) || null,
    status: clean(formData.get("status")) || "active",
    mot_due_date: clean(formData.get("mot_due_date")) || null,
    service_due_date: clean(formData.get("service_due_date")) || null,
    inspection_due_date: clean(formData.get("inspection_due_date")) || null,
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vehicles")
    .insert(payload)
    .select("id, name")
    .single();

  if (error || !data?.id) {
    redirect(`/vehicles/new?error=${encodeURIComponent(error?.message ?? "Could not create vehicle.")}`);
  }

  redirect(`/vehicles/${data.id}?success=${encodeURIComponent(`${data.name ?? "Vehicle"} saved.`)}`);
}

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Create Vehicle</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Add a truck, wagon, low loader or other transport vehicle.
              </p>
            </div>

            <a href="/vehicles" style={secondaryBtn}>
              ← Back to vehicles
            </a>
          </div>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form action={createVehicle} style={{ display: "grid", gap: 14 }}>
              <div style={gridStyle}>
                <Field label="Vehicle name" name="name" />
                <Field label="Registration" name="reg_number" />
                <Field label="Vehicle type" name="vehicle_type" />
                <Field label="Capacity" name="capacity" />
                <Field label="Trailer type" name="trailer_type" />
                <SelectField
                  label="Status"
                  name="status"
                  defaultValue="active"
                  options={[
                    { value: "active", label: "active" },
                    { value: "workshop", label: "workshop" },
                    { value: "off_hire", label: "off_hire" },
                    { value: "inactive", label: "inactive" },
                  ]}
                />
                <Field label="MOT due" name="mot_due_date" type="date" />
                <Field label="Service due" name="service_due_date" type="date" />
                <Field label="Inspection due" name="inspection_due_date" type="date" />
              </div>

              <FullWidthField label="Notes" name="notes" />

              <div>
                <button type="submit" style={primaryBtn}>
                  Save vehicle
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} defaultValue={defaultValue} type={type} style={inputStyle} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FullWidthField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea name={name} defaultValue={defaultValue} rows={4} style={textareaStyle} />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  opacity: 0.75,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
