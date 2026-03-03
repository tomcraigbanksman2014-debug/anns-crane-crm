import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function fmtDate(d: string | null | undefined) {
  if (!d) return "-";
  // start_date / end_date are DATEs so this is safe
  return new Date(d + "T00:00:00").toLocaleDateString();
}

function isoDate(d: Date) {
  // yyyy-mm-dd
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; status?: string };
}) {
  const supabase = createSupabaseServerClient();

  const today = new Date();
  const defaultFrom = isoDate(today);

  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 30);
  const defaultTo = isoDate(toDate);

  const from = (searchParams?.from || defaultFrom).trim();
  const to = (searchParams?.to || defaultTo).trim();
  const status = (searchParams?.status || "").trim();

  let q = supabase
    .from("bookings")
    .select(
      `
        id,
        start_date,
        end_date,
        location,
        status,
        hire_price,
        invoice_status,
        created_at,
        clients ( company_name, contact_name ),
        equipment ( name, asset_number )
      `
    )
    .gte("start_date", from)
    .lte("start_date", to)
    .order("start_date", { ascending: true });

  if (status) q = q.eq("status", status);

  const { data: bookings, error } = await q;

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Calendar</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View bookings by date range.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <a href="/bookings" style={pillStyle}>
              View bookings
            </a>
            <a href="/dashboard" style={pillStyle}>
              ← Dashboard
            </a>
          </div>
        </div>

        <div style={panelStyle}>
          <form
            method="GET"
            action="/calendar"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle}>From</label>
              <input name="from" type="date" defaultValue={from} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>To</label>
              <input name="to" type="date" defaultValue={to} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Status (optional)</label>
              <select name="status" defaultValue={status} style={inputStyle}>
                <option value="">All</option>
                <option value="Inquiry">Inquiry</option>
                <option value="Booked">Booked</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <button type="submit" style={buttonStyle}>
              Apply filters
            </button>
          </form>

          {error && (
            <div style={errorStyle}>
              {error.message}
            </div>
          )}

          {!bookings || bookings.length === 0 ? (
            <p style={{ marginTop: 14, marginBottom: 0 }}>No bookings found in this range.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Start</th>
                    <th align="left" style={thStyle}>End</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Equipment</th>
                    <th align="left" style={thStyle}>Location</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Invoice</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b: any) => {
                    const customer =
                      b?.clients?.company_name ||
                      b?.clients?.contact_name ||
                      "-";
                    const equip =
                      b?.equipment?.name ||
                      b?.equipment?.asset_number ||
                      "-";

                    return (
                      <tr key={b.id}>
                        <td style={tdStyle}>{fmtDate(b.start_date)}</td>
                        <td style={tdStyle}>{fmtDate(b.end_date)}</td>
                        <td style={tdStyle}>{customer}</td>
                        <td style={tdStyle}>{equip}</td>
                        <td style={tdStyle}>{b.location ?? "-"}</td>
                        <td style={tdStyle}>{b.status ?? "-"}</td>
                        <td style={tdStyle}>{b.invoice_status ?? "-"}</td>
                        <td style={tdStyle}>
                          <a href={`/bookings/${b.id}`} style={linkStyle}>
                            View
                          </a>
                          {" · "}
                          <a href={`/bookings/${b.id}/edit`} style={linkStyle}>
                            Edit
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  outline: "none",
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "white",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
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

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const linkStyle: React.CSSProperties = {
  textDecoration: "none",
  fontWeight: 800,
  color: "#111",
};

const errorStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
