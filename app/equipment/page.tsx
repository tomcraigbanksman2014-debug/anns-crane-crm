import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusPill from "../components/StatusPill";

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

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: string | null | undefined) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-GB") : "—";
}

function getCertMeta(value: string | null | undefined) {
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

function getLolerMeta(value: string | null | undefined) {
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
      label: "Overdue",
      bg: "rgba(255,0,0,0.12)",
      color: "#8a1f1f",
    };
  }

  if (d <= soon) {
    return {
      label: "Due soon",
      bg: "rgba(255,170,0,0.16)",
      color: "#8a6200",
    };
  }

  return {
    label: "In date",
    bg: "rgba(0,160,80,0.14)",
    color: "#0b6b34",
  };
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams?: { cert?: string; loler?: string };
}) {
  const supabase = createSupabaseServerClient();

  const certFilter = String(searchParams?.cert ?? "").trim().toLowerCase();
  const lolerFilter = String(searchParams?.loler ?? "").trim().toLowerCase();

  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("*")
    .order("name", { ascending: true });

  const today = startOfToday();
  const soon = addDays(today, 30);

  const filteredEquipment = (equipment ?? []).filter((eq: any) => {
    const cert = toDate(eq.certification_expires_on);
    const loler = toDate(eq.loler_due_on);

    if (certFilter) {
      if (!cert) return false;
      if (certFilter === "expired" && !(cert < today)) return false;
      if (certFilter === "expiring" && !(cert >= today && cert <= soon)) return false;
      if (certFilter === "valid" && !(cert > soon)) return false;
    }

    if (lolerFilter) {
      if (!loler) return false;
      if (lolerFilter === "overdue" && !(loler < today)) return false;
      if (lolerFilter === "due" && !(loler >= today && loler <= soon)) return false;
      if (lolerFilter === "indate" && !(loler > soon)) return false;
    }

    return true;
  });

  return (
    <ClientShell>
      <div style={{ width: "min(1280px,95vw)", margin: "0 auto" }}>
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
              Manage cranes, certification and LOLER due dates.
            </p>
          </div>

          <a href="/equipment/new" style={primaryBtn}>
            + New equipment
          </a>
        </div>

        <div style={{ ...panelStyle, marginTop: 16 }}>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 800 }}>Certification:</span>
              <a href="/equipment" style={filterBtn(certFilter === "" && lolerFilter === "")}>
                All
              </a>
              <a href="/equipment?cert=expiring" style={filterBtn(certFilter === "expiring")}>
                Expiring soon
              </a>
              <a href="/equipment?cert=expired" style={filterBtn(certFilter === "expired")}>
                Expired
              </a>
              <a href="/equipment?cert=valid" style={filterBtn(certFilter === "valid")}>
                Valid
              </a>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 800 }}>LOLER:</span>
              <a href="/equipment?loler=due" style={filterBtn(lolerFilter === "due")}>
                Due soon
              </a>
              <a href="/equipment?loler=overdue" style={filterBtn(lolerFilter === "overdue")}>
                Overdue
              </a>
              <a href="/equipment?loler=indate" style={filterBtn(lolerFilter === "indate")}>
                In date
              </a>
            </div>
          </div>

          {error && <div style={errorBox}>{error.message}</div>}

          {!error && (!filteredEquipment || filteredEquipment.length === 0) ? (
            <p style={{ margin: 0 }}>
              {certFilter || lolerFilter
                ? "No equipment matched this filter."
                : "No equipment yet."}
            </p>
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
                    <th align="left" style={thStyle}>Certification</th>
                    <th align="left" style={thStyle}>LOLER due</th>
                    <th align="left" style={thStyle}>LOLER status</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((eq: any) => {
                    const certMeta = getCertMeta(eq.certification_expires_on);
                    const lolerMeta = getLolerMeta(eq.loler_due_on);

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
                          <span style={badgeStyle(certMeta.bg, certMeta.color)}>
                            {certMeta.label}
                          </span>
                        </td>
                        <td style={tdStyle}>{fmtDate(eq.loler_due_on)}</td>
                        <td style={tdStyle}>
                          <span style={badgeStyle(lolerMeta.bg, lolerMeta.color)}>
                            {lolerMeta.label}
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
    borderRadius: 999,
    textDecoration: "none",
    fontWeight: 800,
    color: "#111",
    background: active ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)",
    border: active
      ? "1px solid rgba(0,0,0,0.12)"
      : "1px solid rgba(0,0,0,0.08)",
  };
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    background: bg,
    color,
  };
}
