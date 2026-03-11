import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function updateOperator(formData: FormData) {
  "use server";

  const supabase = createSupabaseServerClient();

  const id = String(formData.get("id") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim();

  if (!id) return;

  const { error } = await supabase
    .from("operators")
    .update({
      full_name: full_name || null,
      email: email || null,
      phone: phone || null,
      status: status || "active",
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/operators");
  revalidatePath(`/operators/${id}`);
  revalidatePath(`/operators/${id}/edit`);

  redirect(`/operators/${id}`);
}

export default async function EditOperatorPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: operator, error } = await supabase
    .from("operators")
    .select("*")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(760px, 95vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Edit Operator</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Update operator details.
              </p>
            </div>

            <a href="/operators" style={btnStyle}>
              ← Back
            </a>
          </div>

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : !operator ? (
            <div style={errorBox}>Operator not found.</div>
          ) : (
            <form action={updateOperator} style={{ marginTop: 16 }}>
              <input type="hidden" name="id" value={operator.id} />

              <div style={gridStyle}>
                <Field
                  label="Full name"
                  name="full_name"
                  defaultValue={operator.full_name ?? ""}
                />
                <Field
                  label="Email"
                  name="email"
                  defaultValue={operator.email ?? ""}
                />
                <Field
                  label="Phone"
                  name="phone"
                  defaultValue={operator.phone ?? ""}
                />
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={labelStyle}>Status</label>
                  <select
                    name="status"
                    defaultValue={operator.status ?? "active"}
                    style={inputStyle}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                <button type="submit" style={saveBtn}>
                  Save operator
                </button>
                <a href={`/operators/${operator.id}`} style={btnStyle}>
                  Cancel
                </a>
              </div>
            </form>
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
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      <input name={name} defaultValue={defaultValue} style={inputStyle} />
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const saveBtn: React.CSSProperties = {
  padding: "10px 16px",
  background: "#111",
  color: "#fff",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
