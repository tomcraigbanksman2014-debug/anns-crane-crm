import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";
import { getQualificationStatus } from "../../../lib/utils/qualificationStatus";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function expiryStyle(kind: "expired" | "expiring" | "valid" | "none"): React.CSSProperties {
  if (kind === "expired") {
    return {
      background: "rgba(255,0,0,0.12)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  if (kind === "expiring") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (kind === "valid") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  return {
    background: "rgba(255,255,255,0.45)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

async function addQualification(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const operatorId = clean(formData.get("operator_id"));
  const qualificationName = clean(formData.get("qualification_name"));
  const issuer = clean(formData.get("issuer")) || null;
  const certificateNumber = clean(formData.get("certificate_number")) || null;
  const issueDate = clean(formData.get("issue_date")) || null;
  const expiryDate = clean(formData.get("expiry_date")) || null;
  const notes = clean(formData.get("notes")) || null;

  if (!operatorId || !qualificationName) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent("Qualification name is required.")}`);
  }

  const { error } = await supabase.from("operator_qualifications").insert({
    operator_id: operatorId,
    qualification_name: qualificationName,
    issuer,
    certificate_number: certificateNumber,
    issue_date: issueDate,
    expiry_date: expiryDate,
    notes,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/operators/${operatorId}/qualifications?success=${encodeURIComponent("Qualification added.")}`);
}

async function updateQualification(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const operatorId = clean(formData.get("operator_id"));
  const qualificationId = clean(formData.get("qualification_id"));
  const qualificationName = clean(formData.get("qualification_name"));
  const issuer = clean(formData.get("issuer")) || null;
  const certificateNumber = clean(formData.get("certificate_number")) || null;
  const issueDate = clean(formData.get("issue_date")) || null;
  const expiryDate = clean(formData.get("expiry_date")) || null;
  const notes = clean(formData.get("notes")) || null;

  if (!operatorId || !qualificationId || !qualificationName) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent("Qualification update failed.")}`);
  }

  const { error } = await supabase
    .from("operator_qualifications")
    .update({
      qualification_name: qualificationName,
      issuer,
      certificate_number: certificateNumber,
      issue_date: issueDate,
      expiry_date: expiryDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", qualificationId)
    .eq("operator_id", operatorId);

  if (error) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/operators/${operatorId}/qualifications?success=${encodeURIComponent("Qualification updated.")}`);
}

async function deleteQualification(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const operatorId = clean(formData.get("operator_id"));
  const qualificationId = clean(formData.get("qualification_id"));

  if (!operatorId || !qualificationId) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent("Qualification delete failed.")}`);
  }

  const { error } = await supabase
    .from("operator_qualifications")
    .delete()
    .eq("id", qualificationId)
    .eq("operator_id", operatorId);

  if (error) {
    redirect(`/operators/${operatorId}/qualifications?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/operators/${operatorId}/qualifications?success=${encodeURIComponent("Qualification deleted.")}`);
}

export default async function OperatorQualificationsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: operator, error: operatorError },
    { data: qualifications, error: qualsError },
  ] = await Promise.all([
    supabase
      .from("operators")
      .select("id, full_name, email, phone, status, archived")
      .eq("id", params.id)
      .single(),

    supabase
      .from("operator_qualifications")
      .select("*")
      .eq("operator_id", params.id)
      .order("expiry_date", { ascending: true }),
  ]);

  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const rows = qualifications ?? [];

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>
                Operator qualifications
              </h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                {operator?.full_name ?? "Operator"} — manage certificates, tickets and expiry dates.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/operators" style={secondaryBtn}>
                ← Back to operators
              </a>
              <a href={`/operators/${params.id}/edit`} style={secondaryBtn}>
                Edit operator
              </a>
            </div>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
          {operatorError ? <div style={errorBox}>{operatorError.message}</div> : null}
          {qualsError ? <div style={errorBox}>{qualsError.message}</div> : null}

          {!operator ? (
            <div style={errorBox}>Operator not found.</div>
          ) : (
            <div style={{ display: "grid", gap: 18, marginTop: 16 }}>
              <section style={sectionCard}>
                <h2 style={sectionTitle}>Add qualification</h2>

                <form action={addQualification} style={{ display: "grid", gap: 12 }}>
                  <input type="hidden" name="operator_id" value={operator.id} />

                  <div style={grid3}>
                    <Field label="Qualification name *" name="qualification_name" />
                    <Field label="Issuer" name="issuer" />
                    <Field label="Certificate number" name="certificate_number" />
                  </div>

                  <div style={grid3}>
                    <Field label="Issue date" name="issue_date" type="date" />
                    <Field label="Expiry date" name="expiry_date" type="date" />
                    <Field label="Operator status" name="operator_status_readonly" defaultValue={String(operator.status ?? "")} disabled />
                  </div>

                  <TextAreaField label="Notes" name="notes" rows={3} />

                  <div>
                    <button type="submit" style={primaryBtn}>
                      Add qualification
                    </button>
                  </div>
                </form>
              </section>

              <section style={sectionCard}>
                <h2 style={sectionTitle}>Existing qualifications</h2>

                {rows.length === 0 ? (
                  <div style={emptyBox}>No qualifications added yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {rows.map((item: any) => {
                      const kind = getQualificationStatus(item.expiry_date);

                      return (
                        <div key={item.id} style={qualificationCard}>
                          <div style={qualificationHeader}>
                            <div>
                              <div style={{ fontWeight: 1000, fontSize: 17 }}>
                                {item.qualification_name ?? "Qualification"}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                Issuer: {item.issuer ?? "—"} • Cert #: {item.certificate_number ?? "—"}
                              </div>
                            </div>

                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                ...expiryStyle(kind),
                              }}
                            >
                              {kind === "expired"
                                ? "Expired"
                                : kind === "expiring"
                                  ? "Expiring soon"
                                  : kind === "valid"
                                    ? "Valid"
                                    : "No expiry"}
                            </span>
                          </div>

                          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.82 }}>
                            Issue: {fmtDate(item.issue_date)} • Expiry: {fmtDate(item.expiry_date)}
                          </div>

                          <form action={updateQualification} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                            <input type="hidden" name="operator_id" value={operator.id} />
                            <input type="hidden" name="qualification_id" value={item.id} />

                            <div style={grid3}>
                              <Field
                                label="Qualification name *"
                                name="qualification_name"
                                defaultValue={item.qualification_name ?? ""}
                              />
                              <Field
                                label="Issuer"
                                name="issuer"
                                defaultValue={item.issuer ?? ""}
                              />
                              <Field
                                label="Certificate number"
                                name="certificate_number"
                                defaultValue={item.certificate_number ?? ""}
                              />
                            </div>

                            <div style={grid3}>
                              <Field
                                label="Issue date"
                                name="issue_date"
                                type="date"
                                defaultValue={item.issue_date ?? ""}
                              />
                              <Field
                                label="Expiry date"
                                name="expiry_date"
                                type="date"
                                defaultValue={item.expiry_date ?? ""}
                              />
                              <Field
                                label="Qualification id"
                                name="qualification_id_readonly"
                                defaultValue={item.id}
                                disabled
                              />
                            </div>

                            <TextAreaField
                              label="Notes"
                              name="notes"
                              rows={3}
                              defaultValue={item.notes ?? ""}
                            />

                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button type="submit" style={primaryBtn}>
                                Save changes
                              </button>
                            </div>
                          </form>

                          <form action={deleteQualification} style={{ marginTop: 12 }}>
                            <input type="hidden" name="operator_id" value={operator.id} />
                            <input type="hidden" name="qualification_id" value={item.id} />
                            <button type="submit" style={dangerBtn}>
                              Delete qualification
                            </button>
                          </form>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input
        name={name}
        defaultValue={defaultValue}
        type={type}
        style={inputStyle}
        disabled={disabled}
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  rows,
  defaultValue,
}: {
  label: string;
  name: string;
  rows: number;
  defaultValue?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
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

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const qualificationCard: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const qualificationHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
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

const dangerBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,0,0,0.10)",
  color: "#8b0000",
  fontWeight: 900,
  border: "1px solid rgba(255,0,0,0.20)",
  cursor: "pointer",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const emptyBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};
