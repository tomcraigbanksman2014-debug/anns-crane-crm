import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const supabase = createSupabaseServerClient();

  const q = String(searchParams?.q ?? "").trim();

  let query = supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (q) {
    const escaped = q.replace(/,/g, " ");
    query = query.or(
      `company_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`
    );
  }

  const { data: customers, error } = await query;

  return (
    <ClientShell>
      <div style={{ width: "min(1100px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Customers</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View, search and manage customer records.
            </p>
          </div>

          <a href="/customers/new" style={primaryBtnStyle}>
            + Add customer
          </a>
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <form
            method="get"
            action="/customers"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by company, contact, phone or email"
              style={inputStyle}
            />

            <button type="submit" style={primaryBtnStyle}>
              Search
            </button>

            <a href="/customers" style={secondaryBtnStyle}>
              Clear
            </a>
          </form>

          {q ? (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Search results for: <strong>{q}</strong>
            </p>
          ) : (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Showing all customers.
            </p>
          )}
        </section>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!customers || customers.length === 0 ? (
            <p style={{ margin: 0 }}>
              {q ? "No customers matched your search." : "No customers yet."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>
                      Company
                    </th>
                    <th align="left" style={thStyle}>
                      Contact
                    </th>
                    <th align="left" style={thStyle}>
                      Phone
                    </th>
                    <th align="left" style={thStyle}>
                      Email
                    </th>
                    <th align="left" style={thStyle}>
                      Created
                    </th>
                    <th align="left" style={thStyle}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c: any) => (
                    <tr key={c.id}>
                      <td style={tdStyle}>{c.company_name ?? "-"}</td>
                      <td style={tdStyle}>{c.contact_name ?? "-"}</td>
                      <td style={tdStyle}>{c.phone ?? "-"}</td>
                      <td style={tdStyle}>{c.email ?? "-"}</td>
                      <td style={tdStyle}>
                        {c.created_at
                          ? new Date(c.created_at).toLocaleString()
                          : "-"}
                      </td>
                      <td style={tdStyle}>
                        <a
                          href={`/customers/${c.id}`}
                          style={{ marginRight: 12, textDecoration: "none" }}
                        >
                          Open
                        </a>
                        <a
                          href={`/customers/${c.id}/delete`}
                          style={{ color: "red", textDecoration: "none" }}
                        >
                          Delete
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

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  fontSize: 14,
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.25)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 700,
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
