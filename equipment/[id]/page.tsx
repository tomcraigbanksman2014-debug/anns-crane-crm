import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import ServiceLogForm from "./ServiceLogForm";

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: string | null | undefined) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-GB") : "-";
}

function fmtDateTime(value: string | null | undefined) {
  const d = toDate(value);
  return d ? d.toLocaleString("en-GB") : "-";
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
    return { label: "No date", bg: "rgba(0,0,0,0.08)", color: "#111" };
  }

  const today = startOfToday();
  const soon = addDays(today, 30);

  if (d < today) {
    return { label: "Expired", bg: "rgba(255,0,0,0.12)", color: "#8a1f1f" };
  }

  if (d <= soon) {
    return { label: "Expiring soon", bg: "rgba(255,170,0,0.16)", color: "#8a6200" };
  }

  return { label: "Valid", bg: "rgba(0,160,80,0.14)", color: "#0b6b34" };
}

function lolerMeta(value: string | null | undefined) {
  const d = toDate(value);
  if (!d) {
    return { label: "No date", bg: "rgba(0,0,0,0.08)", color: "#111" };
  }

  const today = startOfToday();
  const soon = addDays(today, 30);

  if (d < today) {
    return { label: "Overdue", bg: "rgba(255,0,0,0.12)", color: "#8a1f1f" };
  }

  if (d <= soon) {
    return { label: "Due soon", bg: "rgba(255,170,0,0.16)", color: "#8a6200" };
  }

  return { label: "In date", bg: "rgba(0,160,80,0.14)", color: "#0b6b34" };
}

function serviceTypeMeta(type: string | null | undefined) {
  const t = String(type ?? "").toLowerCase();

  if (t === "loler") return { label: "LOLER", bg: "rgba(140,0,255,0.10)" };
  if (t === "inspection") return { label: "INSPECTION", bg: "rgba(0,120,255,0.10)" };
  if (t === "repair") return { label: "REPAIR", bg: "rgba(255,140,0,0.14)" };
  if (t === "breakdown") return { label: "BREAKDOWN", bg: "rgba(255,0,0,0.10)" };
  if (t === "service") return { label: "SERVICE", bg: "rgba(0,160,80,0.12)" };

  return { label: "NOTE", bg: "rgba(0,0,0,0.08)" };
}

export default async function EquipmentPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: equipment, error }, { data: serviceLog, error: serviceError }] =
    await Promise.all([
      supabase.from("equipment").select("*").eq("id", params.id).single(),
      supabase
        .from("equipment_service_log")
        .select("id, entry_type, service_date, engineer, notes, created_at")
        .eq("equipment_id", params.id)
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const certification = certMeta(equipment?.certification_expires_on);
  const loler = lolerMeta(equipment?.loler_due_on);

  return (
    <ClientShell>
      <div style={{ width: "min(1180px,95vw)", margin: "0 auto" }}>
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
            <p style={{ opacity: 0.8 }}>Equipment details and service history</p>
          </div>

          <a href="/equipment" style={btn}>
            ← Back
          </a>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !equipment ? (
          <div style={errorBox}>Equipment not found.</div>
        ) : (
          <div
            style={{
              marginTop: 20,
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <div style={card}>
                <h2 style={sectionTitle}>Equipment details</h2>

                <Row label="Name" value={equipment.name} />
                <Row label="Asset number" value={equipment.asset_number} />
                <Row label="Type" value={equipment.type} />
                <Row label="Capacity" value={equipment.capacity} />
                <Row label="Status" value={equipment.status} />
                <Row
                  label="Certification expires"
                  value={fmtDate(equipment.certification_expires_on)}
                />
                <BadgeRow label="Certification status" meta={certification} />
                <Row label="LOLER due" value={fmtDate(equipment.loler_due_on)} />
                <BadgeRow label="LOLER status" meta={loler} />
              </div>

              <div style={card}>
                <h2 style={sectionTitle}>Service history</h2>

                {serviceError ? (
                  <div style={errorBox}>{serviceError.message}</div>
                ) : !serviceLog || serviceLog.length === 0 ? (
                  <p style={{ margin: 0 }}>No service records yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {serviceLog.map((entry: any) => {
                      const meta = serviceTypeMeta(entry.entry_type);

                      return (
                        <div key={entry.id} style={entryCardStyle}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                              flexWrap: "wrap",
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: meta.bg,
                                }}
                              >
                                {meta.label}
                              </span>

                              <strong>{fmtDate(entry.service_date)}</strong>
                            </div>

                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                              Added {fmtDateTime(entry.created_at)}
                            </span>
                          </div>

                          <div style={{ fontSize: 14, marginBottom: 8 }}>
                            <strong>Engineer:</strong> {entry.engineer ?? "-"}
                          </div>

                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {entry.notes}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <ServiceLogForm equipmentId={params.id} />
            </div>
          </div>
        )}
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

function BadgeRow({
  label,
  meta,
}: {
  label: string;
  meta: { label: string; bg: string; color: string };
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ opacity: 0.7 }}>{label}</div>
      <span
        style={{
          display: "inline-block",
          padding: "4px 8px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          background: meta.bg,
          color: meta.color,
        }}
      >
        {meta.label}
      </span>
    </div>
  );
}

const card: React.CSSProperties = {
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
  marginTop: 16,
  padding: 10,
  background: "rgba(255,0,0,0.1)",
  border: "1px solid rgba(255,0,0,0.3)",
  borderRadius: 10,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const entryCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};
