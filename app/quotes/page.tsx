import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import QuoteArchiveButton from "./QuoteArchiveButton";
import StatusBadge from "../components/StatusBadge";

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "-";
  return `£${n.toFixed(2)}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

type QuotesPageProps = {
  searchParams?: {
    view?: string;
  };
};

export default async function QuotesPage({
  searchParams,
}: QuotesPageProps) {
  const supabase = createSupabaseServerClient();
  const view = String(searchParams?.view ?? "active").trim().toLowerCase();

  let query = supabase
    .from("quotes")
    .select(`
      id,
      status,
      archived,
      quote_date,
      valid_until,
      amount,
      subject,
      created_at,
      clients:client_id (
        company_name
      )
    `)
    .order("created_at", { ascending: false });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no filter
  } else {
    query = query.eq("archived", false);
  }

  const { data: quotes, error } = await query;

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Quotes</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create and manage customer quotes.
            </p>
          </div>

          <a href="/quotes/new" style={btnStyle}>
            + New quote
          </a>
        </div>

        <div style={tabsRow}>
          <a
            href="/quotes?view=active"
            style={view === "active" ? activeTabBtn : tabBtn}
          >
            Active
          </a>
          <a
            href="/quotes?view=archived"
            style={view === "archived" ? activeTabBtn : tabBtn}
          >
            Archived
          </a>
          <a
            href="/quotes?view=all"
            style={view === "all" ? activeTabBtn : tabBtn}
          >
            All
          </a>
        </div>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!quotes || quotes.length === 0 ? (
            <p style={{ margin: 0 }}>No quotes yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Subject</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Quote date</th>
                    <th align="left" style={thStyle}>Valid until</th>
                    <th align="left" style={thStyle}>Amount</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q: any) => (
                    <tr key={q.id}>
                      <td style={tdStyle}>{q.clients?.company_name ?? "-"}</td>
                      <td style={tdStyle}>{q.subject ?? "-"}</td>
                      <td style={tdStyle}>
                        <StatusBadge value={q.status} archived={!!q.archived} />
                      </td>
                      <td style={tdStyle}>{fmtDate(q.quote_date)}</td>
                      <td style={tdStyle}>{fmtDate(q.valid_until)}</td>
                      <td style={tdStyle}>{fmtMoney(q.amount)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/quotes/${q.id}`} style={openBtnStyle}>
                            Open
                          </a>
                          <QuoteArchiveButton id={q.id} archived={!!q.archived} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a href="/dashboard" style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}>
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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

const openBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
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
