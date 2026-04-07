import ClientShell from "../../../ClientShell";
import ServerSubmitButton from "../../../components/ServerSubmitButton";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import CraneDocumentsManager from "../CraneDocumentsManager";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateCrane(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  const regNumber = clean(formData.get("reg_number")) || null;
  const fleetNumber = clean(formData.get("fleet_number")) || null;
  const make = clean(formData.get("make")) || null;
  const model = clean(formData.get("model")) || null;
  const capacity = clean(formData.get("capacity")) || null;
  const status = clean(formData.get("status")) || "available";
  const registrationExpiresOn = clean(formData.get("registration_expires_on")) || null;
  const motDueOn = clean(formData.get("mot_due_on")) || null;
  const serviceDueOn = clean(formData.get("service_due_on")) || null;
  const lastServiceOn = clean(formData.get("last_service_on")) || null;
  const inspectionDueOn = clean(formData.get("inspection_due_on")) || null;
  const lastInspectionOn = clean(formData.get("last_inspection_on")) || null;
  const lolerDueOn = clean(formData.get("loler_due_on")) || null;
  const lastLolerOn = clean(formData.get("last_loler_on")) || null;
  const insuranceDueOn = clean(formData.get("insurance_due_on")) || null;
  const taxDueOn = clean(formData.get("tax_due_on")) || null;
  const notes = clean(formData.get("notes")) || null;

  if (!id || !name) {
    redirect(`/cranes/${id}/edit?error=${encodeURIComponent("Crane name is required.")}`);
  }

  const { error } = await supabase
    .from("cranes")
    .update({
      name,
      reg_number: regNumber,
      fleet_number: fleetNumber,
      make,
      model,
      capacity,
      status,
      registration_expires_on: registrationExpiresOn,
      mot_due_on: motDueOn,
      service_due_on: serviceDueOn,
      last_service_on: lastServiceOn,
      inspection_due_on: inspectionDueOn,
      last_inspection_on: lastInspectionOn,
      loler_due_on: lolerDueOn,
      last_loler_on: lastLolerOn,
      insurance_due_on: insuranceDueOn,
      tax_due_on: taxDueOn,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/cranes/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/cranes/${id}?success=${encodeURIComponent("Crane updated.")}`);
}

async function archiveCrane(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();
  const id = clean(formData.get("id"));

  if (!id) {
    redirect(`/cranes?error=${encodeURIComponent("Crane id missing.")}`);
  }

  const { error } = await supabase
    .from("cranes")
    .update({
      archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/cranes/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/cranes?success=${encodeURIComponent("Crane archived.")}`);
}

export default async function EditCranePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: crane, error }, { data: docs }] = await Promise.all([
    supabase.from("cranes").select("*").eq("id", params.id).single(),
    supabase
      .from("crane_documents")
      .select("*")
      .eq("crane_id", params.id)
      .order("uploaded_at", { ascending: false }),
  ]);

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div style={pageHeader}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit Crane</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update fleet, service, inspection and LOLER information.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={`/cranes/${params.id}`} style={secondaryBtn}>Open crane</a>
            <a href="/cranes" style={secondaryBtn}>← Back to cranes</a>
          </div>
        </div>

        {error ? <div style={errorBox}>{error.message}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {!crane ? <div style={errorBox}>Crane not found.</div> : null}

        {crane ? (
          <>
            <div style={pageCard}>
              <form action={updateCrane} style={{ display: "grid", gap: 14 }}>
                <input type="hidden" name="id" value={crane.id} />

                <div style={grid3}>
                  <Field label="Crane name *" name="name" defaultValue={crane.name ?? ""} />
                  <Field label="Reg number" name="reg_number" defaultValue={crane.reg_number ?? ""} />
                  <Field label="Fleet number" name="fleet_number" defaultValue={crane.fleet_number ?? ""} />
                  <Field label="Make" name="make" defaultValue={crane.make ?? ""} />
                  <Field label="Model" name="model" defaultValue={crane.model ?? ""} />
                  <Field label="Capacity" name="capacity" defaultValue={crane.capacity ?? ""} />
                </div>

                <div style={{ maxWidth: 260 }}>
                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={crane.status ?? "available"}
                    options={[
                      { value: "available", label: "available" },
                      { value: "on_hire", label: "on_hire" },
                      { value: "maintenance", label: "maintenance" },
                      { value: "inactive", label: "inactive" },
                    ]}
                  />
                </div>

                <div style={grid3}>
                  <Field label="Registration expires" name="registration_expires_on" type="date" defaultValue={crane.registration_expires_on ?? ""} />
                  <Field label="MOT due" name="mot_due_on" type="date" defaultValue={crane.mot_due_on ?? ""} />
                  <Field label="Insurance due" name="insurance_due_on" type="date" defaultValue={crane.insurance_due_on ?? ""} />
                  <Field label="Tax due" name="tax_due_on" type="date" defaultValue={crane.tax_due_on ?? ""} />
                  <Field label="Last service" name="last_service_on" type="date" defaultValue={crane.last_service_on ?? ""} />
                  <Field label="Service due" name="service_due_on" type="date" defaultValue={crane.service_due_on ?? ""} />
                  <Field label="Last inspection" name="last_inspection_on" type="date" defaultValue={crane.last_inspection_on ?? ""} />
                  <Field label="Inspection due" name="inspection_due_on" type="date" defaultValue={crane.inspection_due_on ?? ""} />
                  <Field label="Last LOLER" name="last_loler_on" type="date" defaultValue={crane.last_loler_on ?? ""} />
                  <Field label="LOLER due" name="loler_due_on" type="date" defaultValue={crane.loler_due_on ?? ""} />
                </div>

                <TextAreaField
                  label="Notes"
                  name="notes"
                  rows={5}
                  defaultValue={crane.notes ?? ""}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <ServerSubmitButton style={primaryBtn} pendingText="Updating crane…">
                    Save crane
                  </ServerSubmitButton>
                  <a href={`/cranes/${params.id}`} style={secondaryBtn}>
                    Cancel
                  </a>
                </div>
              </form>

              <form action={archiveCrane} style={{ marginTop: 14 }}>
                <input type="hidden" name="id" value={crane.id} />
                <ServerSubmitButton style={dangerBtn} pendingText="Working…">
                  Archive crane
                </ServerSubmitButton>
              </form>
            </div>

            <div style={{ marginTop: 18 }}>
              <CraneDocumentsManager craneId={crane.id} initialDocuments={docs ?? []} />
            </div>
          </>
        ) : null}
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

function TextAreaField({
  label,
  name,
  defaultValue,
  rows,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows: number;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        style={textareaStyle}
      />
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
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 18,
};

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

const dangerBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
