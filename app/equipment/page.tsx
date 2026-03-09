import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusPill from "../components/StatusPill";

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffMs = target.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function certMeta(value: string | null | undefined) {
  const days = daysUntil(value);

  if (!value || days === null) {
    return {
      label: "No date",
      bg: "rgba(0,0,0,0.08)",
      color: "#111",
    };
  }

  if (days < 0) {
    return {
      label: "Expired",
      bg: "rgba(255,0,0,0.12)",
      color: "#8a1f1f",
    };
  }

  if (days <= 30) {
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
  searchParams,
}: {
  searchParams?: { cert?: string };
}) {
  const supabase = createSupabaseServerClient();

  const certFilter = String(searchParams?.cert ?? "").trim().toLowerCase();

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .order("name", { ascending: true });

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const in30 = new Date(todayStart);
  in30.setDate(in30.getDate() + 30);

  const filteredEquipment = (equipment ?? []).filter((eq: any) => {
    const raw = eq.certification_expires_on;
    if (!certFilter) return true;
    if (!raw) return false;

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return false;

    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (certFilter === "expired") {
      return target < todayStart;
    }

    if (certFilter === "expiring") {
      return target >= todayStart && target <= in30;
    }

    return true;
  });

  const filterLabel =
    certFilter === "expired"
      ? "Showing equipment with expired certification."
      : certFilter === "expiring"
      ? "Showing equipment with certification expiring within 30 days."
      : "Showing all equipment.";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px,95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Equipment</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage cranes and equipment records.
            </p>
          </div>

          <a href="/equipment/new" style={primaryBtn}>
            + New equipment
          </a>
        </div>

        <div style={{ ...panelStyle, marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.8 }}>{filterLabel}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href="/equipment" style={filterBtn(certFilter === "")}>
                All
              </a>
              <a href="/equipment?cert=expiring" style={filterBtn(certFilter === "expiring")}>
                Expiring soon
              </a>
              <a href="/equipment?cert=expired" style={filterBtn(certFilter === "expired")}>
                Expired
              </a>
            </div>
          </div>

          {error && <div style={errorBox}>{error.message}</div>}

          {!error && (!filteredEquipment || filteredEquipment.length === 0) ? (
            <p style={{ margin: 0 }}>No equipment found for this filter.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Name</th>
                    <th align="left" style={thStyle}>Asset #</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Capacity</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Certification expires</th>
                    <th align="left" style={thStyle}>Certification status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((eq: any) => {
                    const cert = certMeta(eq.certification_expires_on);

                    return (
                      <tr key={eq.id}>
                        <td style={tdStyle}>{eq.name ?? "—"}</td>
                        <td style={tdStyle}>{eq.asset_number ?? "—"}</td>
                        <td style={tdStyle}>{eq.type ?? "—"}</td>
                        <td style={tdStyle}>{eq.capacity ?? "—"}</td>
                        <td style={tdStyle}>
                          <StatusPill text={eq.status} />
                        </td>
                        <td style={tdStyle}>{fmtDate(eq.certification_expires_on)}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              background: cert.bg,
                              color: cert.color,
                            }}
                          >
                            {cert.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/equipment/${eq.id}`} style={actionBtn}>
                              View
                            </a>
                            <a href={`/equipment/${eq.id}/edit`} style={actionBtn}>
                              Edit
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/dashboard"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  border: "none",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 9,
  textDecoration: "none",
  background: "rgba(255,255,255,0.52)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

function filterBtn(active: boolean): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 800,
    color: "#111",
    background: active ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.30)",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}
