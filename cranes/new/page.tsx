import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { redirect } from "next/navigation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function createCrane(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const name = clean(formData.get("name"));
  const regNumber = clean(formData.get("reg_number")) || null;
  const fleetNumber = clean(formData.get("fleet_number")) || null;
  const make = clean(formData.get("make")) || null;
  const model = clean(formData.get("model")) || null;
  const capacity = clean(formData.get("capacity")) || null;
  const status = clean(formData.get("status")) || "available";

  if (!name) {
    redirect(`/cranes/new?error=${encodeURIComponent("Crane name is required.")}`);
  }

  const { error } = await supabase.from("cranes").insert({
    name,
    reg_number: regNumber,
    fleet_number: fleetNumber,
    make,
    model,
    capacity,
    status,
    archived: false,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    redirect(`/cranes/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/cranes?success=${encodeURIComponent("Crane created.")}`);
}

export default function NewCranePage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(980px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <h1 style={{ marginTop: 0, fontSize: 32 }}>New Crane</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Add a main hire crane. This will appear in bookings.
          </p>

          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <form action={createCrane} style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <div style={grid3}>
              <Field label="Crane name *" name="name" />
              <Field label="Reg number" name="reg_number" />
              <Field label="Fleet number" name="fleet_number" />
              <Field label="Make" name="make" />
              <Field label="Model" name="model" />
              <Field label="Capacity" name="capacity" />
            </div>

            <div style={{ maxWidth: 260 }}>
              <SelectField
                label="Status"
                name="status"
                options={[
                  { value: "available", label: "available" },
                  { value: "on_hire", label: "on_hire" },
                  { value: "maintenance", label: "maintenance" },
                  { value: "inactive", label: "inactive" },
                ]}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Create crane
              </button>
              <a href="/cranes" style={secondaryBtn}>
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({
  label,
  name,
}: {
  label: string;
  name: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} style={inputStyle} />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <select name={name} style={inputStyle}>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
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

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
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
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
  textDecoration: "none",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
