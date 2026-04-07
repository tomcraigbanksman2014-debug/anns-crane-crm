import ClientShell from "../../../ClientShell";
import OperatorQualificationInlineSummary from "../../../components/OperatorQualificationInlineSummary";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";

import ServerSubmitButton from "../../../components/ServerSubmitButton";
function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function updateOperator(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = clean(formData.get("id"));
  if (!id) {
    redirect(`/operators?error=${encodeURIComponent("Operator id missing.")}`);
  }

  const payload = {
    full_name: clean(formData.get("full_name")) || null,
    email: clean(formData.get("email")) || null,
    phone: clean(formData.get("phone")) || null,
    role: clean(formData.get("role")) || null,
    status: clean(formData.get("status")) || "active",
    notes: clean(formData.get("notes")) || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("operators").update(payload).eq("id", id);

  if (error) {
    redirect(`/operators/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/operators/${id}/edit?success=${encodeURIComponent("Operator updated.")}`);
}

export default async function OperatorEditPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: operator, error } = await supabase
    .from("operators")
    .select("*")
    .eq("id", params.id)
    .single();

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                Edit operator
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Update operator details, role and qualification compliance context.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/operators" style={secondaryBtn}>
                ← Back to operators
              </a>
              {operator?.id ? (
                <a href={`/operators/${operator.id}`} style={secondaryBtn}>
                  Open operator
                </a>
              ) : null}
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {error ? <div style={errorBox}>{error.message}</div> : null}

          {!operator ? (
            <div style={errorBox}>Operator not found.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Operator details</h2>

                <form action={updateOperator} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="id" value={operator.id} />

                  <div style={grid2}>
                    <Field label="Full name" name="full_name" defaultValue={operator.full_name ?? ""} />
                    <Field label="Email" name="email" defaultValue={operator.email ?? ""} type="email" />
                    <Field label="Phone" name="phone" defaultValue={operator.phone ?? ""} />
                    <Field label="Role" name="role" defaultValue={operator.role ?? ""} placeholder="e.g. Crane Operator" />
                    <SelectField
                      label="Status"
                      name="status"
                      defaultValue={operator.status ?? "active"}
                      options={[
                        { value: "active", label: "active" },
                        { value: "inactive", label: "inactive" },
                      ]}
                    />
                    <Field label="Archived" name="archived_readonly" defaultValue={operator.archived ? "Yes" : "No"} disabled />
                  </div>

                  <TextAreaField label="Notes" name="notes" defaultValue={operator.notes ?? ""} rows={4} />

                  <div>
                    <ServerSubmitButton style={primaryBtn} pendingText="Working…">
                      Save operator
                    </ServerSubmitButton>
                  </div>
                </form>
              </section>

              <OperatorQualificationInlineSummary operatorId={params.id} />
            </div>
          )}
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
  disabled = false,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        disabled={disabled}
        placeholder={placeholder}
        style={inputStyle}
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

const pageCard: React.CSSProperties = {
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
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
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

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
