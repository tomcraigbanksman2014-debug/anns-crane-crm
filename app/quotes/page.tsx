import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "-";
  return `£${n.toFixed(2)}`;
}

export default async function QuotesPage() {
  const supabase = createSupabaseServerClient();

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(`
      id,
      status,
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
                      <td style={tdStyle}>{q.status ?? "-"}</td>
                      <td style={tdStyle}>
                        {q.quote_date ? new Date(q.quote_date).toLocaleDateString() : "-"}
                      </td>
                      <td style={tdStyle}>
                        {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : "-"}
                      </td>
                      <td style={tdStyle}>{fmtMoney(q.amount)}</td>
                      <td style={tdStyle}>
                        <a href={`/quotes/${q.id}`} style={{ textDecoration: "none" }}>
                          Open
                        </a>
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
