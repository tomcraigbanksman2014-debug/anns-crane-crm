import ClientShell from "../../../ClientShell";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import EquipmentEditForm from "./EquipmentEditForm";

export default async function EditEquipmentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", params.id)
    .single();

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Edit equipment</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Update equipment details and certification expiry.
            </p>
          </div>

          <a href="/equipment" style={btnStyle}>
            ← Back
          </a>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !equipment ? (
          <div style={errorBox}>Equipment not found.</div>
        ) : (
          <div style={{ marginTop: 16 }}>
            <EquipmentEditForm equipment={equipment} />
          </div>
        )}
      </div>
    </ClientShell>
  );
}

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

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
