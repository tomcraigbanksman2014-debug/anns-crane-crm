import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_username: string | null;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  meta: any;
  created_at: string | null;
};

type AuditPageProps = {
  searchParams?: {
    q?: string;
    action?: string;
    entity?: string;
  };
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function safeMetaText(meta: any) {
  if (!meta) return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return "";
  }
}

function prettyMeta(meta: any) {
  if (!meta) return "—";

  const parts: string[] = [];

  if (meta.company_name) parts.push(`company: ${meta.company_name}`);
  if (meta.subject) parts.push(`subject: ${meta.subject}`);
  if (meta.job_number) parts.push(`job #: ${meta.job_number}`);
  if (meta.transport_number) parts.push(`transport #: ${meta.transport_number}`);
  if (meta.invoice_number) parts.push(`invoice #: ${meta.invoice_number}`);
  if (meta.new_status) parts.push(`status: ${meta.new_status}`);
  if (meta.new_invoice_status) parts.push(`invoice status: ${meta.new_invoice_status}`);
  if (meta.amount != null) parts.push(`amount: ${meta.amount}`);
  if (meta.total_invoice != null) parts.push(`total: ${meta.total_invoice}`);
  if (meta.booking_id) parts.push(`booking: ${meta.booking_id}`);
  if (meta.client_id) parts.push(`customer: ${meta.client_id}`);

  if (parts.length > 0) {
    return parts.join(" • ");
  }

  try {
    const text = JSON.stringify(meta);
    return text.length > 180 ? text.slice(0, 180) + "…" : text;
  } catch {
    return "—";
  }
}

function actionTone(action: string | null): React.CSSProperties {
  const a = String(action ?? "").toLowerCase();

  if (
    a.includes("created") ||
    a.includes("generated") ||
    a === "create"
  ) {
    return {
      background: "rgba(0,180,120,0.12)",
      border: "1px solid rgba(0,180,120,0.24)",
      color: "#0b7a4b",
    };
  }

  if (
    a.includes("updated") ||
    a.includes("reset_password") ||
    a.includes("convert") ||
    a.includes("converted")
  ) {
    return {
      background: "rgba(0,120,255,0.12)",
      border: "1px solid rgba(0,120,255,0.24)",
      color: "#0b57d0",
    };
  }

  if (
    a.includes("archived") ||
    a.includes("restored") ||
    a.includes("cancelled") ||
    a.includes("canceled")
  ) {
    return {
      background: "rgba(255,170,0,0.14)",
      border: "1px solid rgba(255,170,0,0.24)",
      color: "#8a5200",
    };
  }

  if (
    a.includes("deleted") ||
    a === "delete"
  ) {
    return {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.22)",
      color: "#b00020",
    };
  }

  return {
    background: "rgba(255,255,255,0.35)",
    border: "1px solid rgba(0,0,0,0.10)",
    color: "#111",
  };
}

function Pill({ text }: { text: string | null | undefined }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
        ...actionTone(text ?? ""),
      }}
    >
      {text ?? "—"}
    </span>
  );
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = String(user?.email ?? "").toLowerCase();
  const masterAdminEmail = String(
    process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL ?? ""
  )
    .trim()
    .toLowerCase();

  const role = String((user?.user_metadata as any)?.role ?? "");
  const isMaster = !!email && !!masterAdminEmail && email === masterAdminEmail;
  const isAdmin = role === "admin" || isMaster;

  const q = String(searchParams?.q ?? "").trim().toLowerCase();
  const actionFilter = String(searchParams?.action ?? "").trim().toLowerCase();
  const entityFilter = String(searchParams?.entity ?? "").trim().toLowerCase();

  let rows: AuditRow[] = [];
  let errorMessage: string | null = null;

  if (isAdmin) {
    const { data, error } = await supabase
      .from("audit_log")
      .select("id, actor_user_id, actor_username, action, entity_type, entity_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      errorMessage = error.message;
    } else {
      rows = ((data ?? []) as AuditRow[]) || [];
    }
  }

  const actionOptions = uniqueSorted(rows.map((row) => row.action));
  const entityOptions = uniqueSorted(rows.map((row) => row.entity_type));

  const filteredRows = rows.filter((row) => {
    const rowAction = String(row.action ?? "").toLowerCase();
    const rowEntity = String(row.entity_type ?? "").toLowerCase();
    const searchable = [
      row.actor_username ?? "",
      row.action ?? "",
      row.entity_type ?? "",
      row.entity_id ?? "",
      safeMetaText(row.meta),
    ]
      .join(" ")
      .toLowerCase();

    if (actionFilter && rowAction !== actionFilter) return false;
    if (entityFilter && rowEntity !== entityFilter) return false;
    if (q && !searchable.includes(q)) return false;

    return true;
  });

  return (
    <ClientShell>
      <div style={{ width: "min(1380px, 96vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Admin: Audit log</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View recent system activity and critical office actions.
            </p>
          </div>

          <a href="/dashboard" style={btnStyle}>
            ← Back to dashboard
          </a>
        </div>

        {!isAdmin ? (
          <div style={errorBox}>Admin access only.</div>
        ) : (
          <>
            <form method="get" style={filterBar}>
              <input
                type="text"
                name="q"
                defaultValue={searchParams?.q ?? ""}
                placeholder="Search user, action, entity id or details..."
                style={searchInput}
              />

              <select
                name="action"
                defaultValue={searchParams?.action ?? ""}
                style={selectStyle}
              >
                <option value="">All actions</option>
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>

              <select
                name="entity"
                defaultValue={searchParams?.entity ?? ""}
                style={selectStyle}
              >
                <option value="">All entities</option>
                {entityOptions.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>

              <button type="submit" style={primaryBtn}>
                Filter
              </button>

              <a href="/admin/audit" style={btnStyle}>
                Clear
              </a>
            </form>

            <div style={statsRow}>
              <MiniStat label="Showing" value={filteredRows.length} />
              <MiniStat label="Loaded" value={rows.length} />
              <MiniStat label="Actions" value={actionOptions.length} />
              <MiniStat label="Entities" value={entityOptions.length} />
            </div>

            <div style={panelStyle}>
              {errorMessage && <div style={errorBox}>{errorMessage}</div>}

              {!errorMessage && filteredRows.length === 0 ? (
                <p style={{ margin: 0 }}>No audit entries found for this filter.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
                    <thead>
                      <tr>
                        <th align="left" style={thStyle}>When</th>
                        <th align="left" style={thStyle}>User</th>
                        <th align="left" style={thStyle}>Action</th>
                        <th align="left" style={thStyle}>Entity</th>
                        <th align="left" style={thStyle}>Entity ID</th>
                        <th align="left" style={thStyle}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td style={tdStyle}>{fmtDateTime(row.created_at)}</td>

                          <td style={tdStyle}>
                            <div style={{ fontWeight: 800 }}>
                              {row.actor_username ?? "—"}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 12,
                                opacity: 0.7,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              }}
                            >
                              {row.actor_user_id ?? "—"}
                            </div>
                          </td>

                          <td style={tdStyle}>
                            <Pill text={row.action} />
                          </td>

                          <td style={tdStyle}>{row.entity_type ?? "—"}</td>

                          <td
                            style={{
                              ...tdStyle,
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              fontSize: 12,
                            }}
                          >
                            {row.entity_id ?? "—"}
                          </td>

                          <td style={tdStyle}>
                            <div>{prettyMeta(row.meta)}</div>
                            {row.meta ? (
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ cursor: "pointer", fontSize: 12, opacity: 0.75 }}>
                                  Show raw meta
                                </summary>
                                <pre
                                  style={{
                                    marginTop: 8,
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                    fontSize: 12,
                                    lineHeight: 1.45,
                                    background: "rgba(255,255,255,0.45)",
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    borderRadius: 10,
                                    padding: 10,
                                  }}
                                >
                                  {JSON.stringify(row.meta, null, 2)}
                                </pre>
                              </details>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ClientShell>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div style={miniStatCard}>
      <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const filterBar: React.CSSProperties = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const searchInput: React.CSSProperties = {
  flex: "1 1 320px",
  minWidth: 260,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  minWidth: 180,
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
};

const statsRow: React.CSSProperties = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const miniStatCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.28)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
};

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
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
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

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
