import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import OperatorArchiveButton from "./OperatorArchiveButton";

function fmtText(value: string | null | undefined) {
  return value && String(value).trim().length ? value : "—";
}

function statusStyle(status: string | null | undefined): React.CSSProperties {
  const s = String(status ?? "").toLowerCase();

  if (s === "active") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (s === "inactive") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.10)",
  };
}

function qualificationBadgeStyle(kind: "ok" | "warn" | "bad"): React.CSSProperties {
  if (kind === "bad") {
    return {
      background: "rgba(255,0,0,0.12)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  if (kind === "warn") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  return {
    background: "rgba(0,180,120,0.12)",
    color: "#0b7a4b",
    border: "1px solid rgba(0,180,120,0.20)",
  };
}

type OperatorsPageProps = {
  searchParams?: {
    view?: string;
  };
};

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function OperatorsPage({
  searchParams,
}: OperatorsPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").toLowerCase();

  let query = supabase
    .from("operators")
    .select("id, full_name, email, phone, status, notes, archived")
    .order("full_name", { ascending: true });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no filter
  } else {
    query = query.eq("archived", false);
  }

  const [{ data: operators, error }, { data: qualifications }] = await Promise.all([
    query,
    supabase
      .from("operator_qualifications")
      .select("id, operator_id, qualification_name, expiry_date")
      .order("expiry_date", { ascending: true }),
  ]);

  const rows = operators ?? [];
  const quals = qualifications ?? [];

  const today = new Date();
  const todayIso = toIsoDate(today);
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 30);
  const soonIso = toIsoDate(soon);

  function summaryFor(operatorId: string) {
    const items = quals.filter((q: any) => q.operator_id === operatorId);
    const expired = items.filter((q: any) => {
      const expiry = String(q.expiry_date ?? "").trim();
      return !!expiry && expiry < todayIso;
    }).length;

    const expiringSoon = items.filter((q: any) => {
      const expiry = String(q.expiry_date ?? "").trim();
      return !!expiry && expiry >= todayIso && expiry <= soonIso;
    }).length;

    return {
      total: items.length,
      expired,
      expiringSoon,
    };
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1240px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Operators</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Manage operator records and qualification expiry tracking.
            </p>
          </div>

          <a href="/operators/new" style={primaryBtn}>
            + Add operator
          </a>
        </div>

        <div style={tabsRow}>
          <a
            href="/operators?view=active"
            style={view === "active" ? activeTabBtn : tabBtn}
          >
            Active
          </a>
          <a
            href="/operators?view=archived"
            style={view === "archived" ? activeTabBtn : tabBtn}
          >
            Archived
          </a>
          <a
            href="/operators?view=all"
            style={view === "all" ? activeTabBtn : tabBtn}
          >
            All
          </a>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : rows.length === 0 ? (
          <div style={cardStyle}>
            <p style={{ margin: 0 }}>No operators found for this view.</p>
          </div>
        ) : (
          <div style={{ ...cardStyle, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={thStyle}>Name</th>
                  <th align="left" style={thStyle}>Email</th>
                  <th align="left" style={thStyle}>Phone</th>
                  <th align="left" style={thStyle}>Status</th>
                  <th align="left" style={thStyle}>Qualifications</th>
                  <th align="left" style={thStyle}>Archived</th>
                  <th align="left" style={thStyle}>Notes</th>
                  <th align="left" style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((op: any) => {
                  const summary = summaryFor(op.id);

                  return (
                    <tr key={op.id}>
                      <td style={tdStyle}>{fmtText(op.full_name)}</td>
                      <td style={tdStyle}>{fmtText(op.email)}</td>
                      <td style={tdStyle}>{fmtText(op.phone)}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...statusStyle(op.status),
                          }}
                        >
                          {fmtText(op.status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 900,
                              ...qualificationBadgeStyle("ok"),
                            }}
                          >
                            Total {summary.total}
                          </span>

                          {summary.expiringSoon > 0 ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                ...qualificationBadgeStyle("warn"),
                              }}
                            >
                              Expiring {summary.expiringSoon}
                            </span>
                          ) : null}

                          {summary.expired > 0 ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 900,
                                ...qualificationBadgeStyle("bad"),
                              }}
                            >
                              Expired {summary.expired}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td style={tdStyle}>{op.archived ? "Yes" : "No"}</td>
                      <td style={tdStyle}>{fmtText(op.notes)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/operators/${op.id}/edit`} style={secondaryBtn}>
                            Edit
                          </a>
                          <a href={`/operators/${op.id}/qualifications`} style={secondaryBtn}>
                            Qualifications
                          </a>
                          <OperatorArchiveButton
                            operatorId={op.id}
                            archived={!!op.archived}
                          />
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
    </ClientShell>
  );
}

const cardStyle: React.CSSProperties = {
  marginTop: 16,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 800,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
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

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
