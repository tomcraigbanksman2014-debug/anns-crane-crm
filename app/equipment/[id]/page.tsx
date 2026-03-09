import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: string | null | undefined) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-GB") : "-";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function certMeta(value: string | null | undefined) {
  const d = toDate(value);
  if (!d) {
    return {
      label: "No date",
      bg: "rgba(0,0,0,0.08)",
      color: "#111",
    };
  }

  const today = startOfToday();
  const soon = addDays(today, 30);

  if (d < today) {
    return {
      label: "Expired",
      bg: "rgba(255,0,0,0.12)",
      color: "#8a1f1f",
    };
  }

  if (d <= soon) {
    return {
      label: "Expiring soon",
      bg: "rgba(255,170,0,0.16)",
      color: "#8a6200",
    };
  }

  return {
    label: "Valid",
    bg: "rgba(0,160,80,0.14)",
    color: "#0b6b34",
  };
}

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

  const certification = certMeta(equipment?.certification_expires_on);

  return (
    <ClientShell>
      <div style={{ width: "min(900px,95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
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
              <Row
                label="Certification expires"
                value={fmtDate(equipment.certification_expires_on)}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  alignItems: "center",
                }}
              >
                <div style={{ opacity: 0.7 }}>Certification status</div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 800,
                    background: certification.bg,
                    color: certification.color,
                  }}
                >
                  {certification.label}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Row({ label, value }: any) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        gap: 12,
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ fontWeight: 800, textAlign: "right" }}>{value || "-"}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  marginTop: 20,
  padding: 20,
  borderRadius: 12,
  background: "rgba(255,255,255,0.2)",
  border: "1px solid rgba(255,255,255,0.4)",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.4)",
  border: "1px solid rgba(0,0,0,0.1)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  padding: 10,
  background: "rgba(255,0,0,0.1)",
  border: "1px solid rgba(255,0,0,0.3)",
  borderRadius: 10,
};
