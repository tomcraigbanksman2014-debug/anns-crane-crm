import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import EquipmentArchiveButton from "./EquipmentArchiveButton";

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function plusDaysDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
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

type EquipmentPageProps = {
  searchParams?: {
    view?: string;
    cert?: string;
    loler?: string;
    q?: string;
  };
};

function makeHref(params: {
  view?: string;
  cert?: string;
  loler?: string;
  q?: string;
}) {
  const sp = new URLSearchParams();

  if (params.view) sp.set("view", params.view);
  if (params.cert) sp.set("cert", params.cert);
  if (params.loler) sp.set("loler", params.loler);
  if (params.q) sp.set("q", params.q);

  const qs = sp.toString();
  return `/equipment${qs ? `?${qs}` : ""}`;
}

function activeFilterText(cert: string, loler: string) {
  if (cert === "expired") return "Showing expired certification only";
  if (cert === "expiring") return "Showing certification expiring within 30 days";
  if (loler === "overdue") return "Showing overdue LOLER only";
  if (loler === "due") return "Showing LOLER due within 30 days";
  if (loler === "indate") return "Showing LOLER in date only";
  return "";
}

export default async function EquipmentPage({
  searchParams,
}: EquipmentPageProps) {
  const supabase = createSupabaseServerClient();

  const view = String(searchParams?.view ?? "active").toLowerCase();
  const cert = String(searchParams?.cert ?? "").toLowerCase();
  const loler = String(searchParams?.loler ?? "").toLowerCase();
  const q = String(searchParams?.q ?? "").trim();

  const today = isoDate();
  const in30Days = plusDaysDate(30);

  let query = supabase
    .from("equipment")
    .select(`
      id,
      name,
      asset_number,
      type,
      capacity,
      status,
      archived,
      certification_expires_on,
      loler_due_on
    `)
    .order("name", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no archived filter
  } else {
    query = query.eq("archived", false);
  }

  if (cert === "expired") {
    query = query.lt("certification_expires_on", today);
  } else if (cert === "expiring") {
    query = query
      .gte("certification_expires_on", today)
      .lte("certification_expires_on", in30Days);
  }

  if (loler === "overdue") {
    query = query.lt("loler_due_on", today);
  } else if (loler === "due") {
    query = query
      .gte("loler_due_on", today)
      .lte("loler_due_on", in30Days);
  } else if (loler === "indate") {
    query = query.gte("loler_due_on", today);
  }

  if (q) {
    const escaped = q.replace(/[%_]/g, "");
    query = query.or(
      `name.ilike.%${escaped}%,asset_number.ilike.%${escaped}%,type.ilike.%${escaped}%,capacity.ilike.%${escaped}%,status.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;
  const rows = data ?? [];
  const filterText = activeFilterText(cert, loler);

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Equipment</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Manage cranes, plant and supporting equipment records.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/jobs" style={secondaryBtn}>
                Open jobs
              </a>
              <a href="/equipment/new" style={primaryBtn}>
                + Add equipment
              </a>
            </div>
          </div>

          <div style={tabsRow}>
            <a
              href={makeHref({ view: "active", cert, loler, q })}
              style={view === "active" ? activeTabBtn : tabBtn}
            >
              Active
            </a>
            <a
              href={makeHref({ view: "archived", cert, loler, q })}
              style={view === "archived" ? activeTabBtn : tabBtn}
            >
              Archived
            </a>
            <a
              href={makeHref({ view: "all", cert, loler, q })}
              style={view === "all" ? activeTabBtn : tabBtn}
            >
              All
            </a>
          </div>

          <form method="get" style={searchRow}>
            <input type="hidden" name="view" value={view} />
            {cert ? <input type="hidden" name="cert" value={cert} /> : null}
            {loler ? <input type="hidden" name="loler" value={loler} /> : null}

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search name, asset number, type, capacity or status..."
              style={searchInput}
            />

            <button type="submit" style={primaryBtn}>
              Search
            </button>

            <a
              href={makeHref({ view, cert, loler })}
              style={secondaryBtn}
            >
              Clear search
            </a>

            {(cert || loler) ? (
              <a
                href={makeHref({ view, q })}
                style={warningBtn}
              >
                Clear alert filter
              </a>
            ) : null}
          </form>

          {filterText ? (
            <div style={filterInfoBox}>
              <div style={{ fontWeight: 900 }}>{filterText}</div>
              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                Matching items: {rows.length}
              </div>
            </div>
          ) : null}

          {error ? (
            <div style={errorBox}>{error.message}</div>
          ) : rows.length === 0 ? (
            <div style={emptyBox}>No equipment found for this view/filter.</div>
          ) : (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Name</th>
                    <th align="left" style={thStyle}>Asset number</th>
                    <th align="left" style={thStyle}>Type</th>
                    <th align="left" style={thStyle}>Capacity</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Archived</th>
                    <th align="left" style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>{fmtText(item.name)}</td>
                      <td style={tdStyle}>{fmtText(item.asset_number)}</td>
                      <td style={tdStyle}>{fmtText(item.type)}</td>
                      <td style={tdStyle}>{fmtText(item.capacity)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...statusStyle(item.status),
                          }}
                        >
                          {fmtText(item.status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{item.archived ? "Yes" : "No"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/equipment/${item.id}`} style={actionBtn}>
                            Open
                          </a>
                          <a href={`/equipment/${item.id}/edit`} style={actionBtn}>
                            Edit
                          </a>
                          <EquipmentArchiveButton
                            equipmentId={item.id}
                            archived={!!item.archived}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
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

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
  marginTop: 16,
};

const searchInput: React.CSSProperties = {
  flex: "1 1 360px",
  minWidth: 260,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  padding: "10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.78,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 900,
  border: "none",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const warningBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,170,0,0.14)",
  color: "#8a5200",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(255,170,0,0.24)",
};

const tabBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const filterInfoBox: React.CSSProperties = {
  marginTop: 16,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,170,0,0.10)",
  border: "1px solid rgba(255,170,0,0.22)",
};

const emptyBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};
