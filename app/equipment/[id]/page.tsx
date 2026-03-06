import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function EquipmentPage({
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
      <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0 }}>{equipment?.name || "Equipment"}</h1>
            <p style={{ opacity: 0.8 }}>Equipment details</p>
          </div>

          <a href="/equipment" style={btn}>
            ← Back
          </a>
        </div>

        <div style={card}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!equipment ? (
            <p>Equipment not found</p>
          ) : (
            <>
              <Row label="Name" value={equipment.name} />
              <Row label="Asset number" value={equipment.asset_number} />
              <Row label="Type" value={equipment.type} />
              <Row label="Capacity" value={equipment.capacity} />
              <Row label="Status" value={equipment.status} />
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{value || "-"}</div>
    </div>
  );
}

const card = {
  marginTop: 20,
  padding: 20,
  borderRadius: 12,
  background: "rgba(255,255,255,0.2)",
  border: "1px solid rgba(255,255,255,0.4)",
};

const btn = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.4)",
  border: "1px solid rgba(0,0,0,0.1)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox = {
  padding: 10,
  background: "rgba(255,0,0,0.1)",
  border: "1px solid rgba(255,0,0,0.3)",
  borderRadius: 10,
};
