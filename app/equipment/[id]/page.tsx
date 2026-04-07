import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import EquipmentArchiveButton from "../EquipmentArchiveButton";
import ServiceLogForm from "./ServiceLogForm";

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "active" || s === "available") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "maintenance") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (s === "inactive" || s === "out_of_service") {
    return {
      background: "rgba(120,120,120,0.12)",
      color: "#555",
      border: "1px solid rgba(120,120,120,0.18)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: equipment, error }, { data: serviceLog, error: logError }] = await Promise.all([
    supabase
      .from("equipment")
      .select("*")
      .eq("id", params.id)
      .single(),
    supabase
      .from("equipment_service_log")
      .select("*")
      .eq("equipment_id", params.id)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (error || !equipment) {
    return (
      <ClientShell>
        <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
          <div style={errorBox}>{error?.message || "Equipment not found."}</div>
        </div>
      </ClientShell>
    );
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1250px, 95vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>{fmtText(equipment.name)}</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Equipment record, certification dates and service history.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/equipment" style={secondaryBtn}>
              ← Equipment
            </a>
            <a href={`/equipment/${equipment.id}/edit`} style={primaryBtn}>
              Edit equipment
            </a>
            <EquipmentArchiveButton
              equipmentId={equipment.id}
              archived={Boolean(equipment.archived)}
            />
          </div>
        </div>

        <div style={layoutGrid}>
          <section style={card}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Equipment details</h2>
            <div style={detailsGrid}>
              <Line label="Asset number">{fmtText(equipment.asset_number)}</Line>
              <Line label="Type">{fmtText(equipment.type)}</Line>
              <Line label="Capacity">{fmtText(equipment.capacity)}</Line>
              <Line label="Status">
                <span style={{ ...pillBase, ...statusStyle(equipment.status) }}>
                  {fmtText(equipment.status)}
                </span>
              </Line>
              <Line label="Certification expiry">
                {fmtDate(equipment.certification_expires_on)}
              </Line>
              <Line label="LOLER due">
                {fmtDate(equipment.loler_due_on)}
              </Line>
              <Line label="Created">{fmtDate(equipment.created_at)}</Line>
              <Line label="Updated">{fmtDate(equipment.updated_at)}</Line>
              <div style={{ gridColumn: "1 / -1" }}>
                <Line label="Notes">{fmtText(equipment.notes)}</Line>
              </div>
            </div>
          </section>

          <ServiceLogForm equipmentId={equipment.id} />
        </div>

        <section style={{ ...card, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>Service history</h2>

          {logError ? <div style={errorBox}>{logError.message}</div> : null}

          {!serviceLog || serviceLog.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.75 }}>No service history recorded yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Date</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Engineer</th>
                    <th align="left" style={thStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceLog.map((row: any) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>{fmtDate(row.service_date)}</td>
                      <td style={tdStyle}>{fmtText(row.entry_type)}</td>
                      <td style={tdStyle}>{fmtText(row.engineer)}</td>
                      <td style={tdStyle}>{fmtText(row.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ClientShell>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 600, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const layoutGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
  gap: 16,
  alignItems: "start",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const detailsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 13,
  opacity: 0.78,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  verticalAlign: "top",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
