import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusPill from "../components/StatusPill";

type BookingRow = {
  id: string;
  start_date: string | null;
  end_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  location: string | null;
  status: string | null;
  invoice_status: string | null;
  total_invoice: number | null;
  clients:
    | {
        id: string;
        company_name: string | null;
        contact_name: string | null;
      }
    | {
        id: string;
        company_name: string | null;
        contact_name: string | null;
      }[]
    | null;
  equipment:
    | {
        id: string;
        name: string | null;
        asset_number: string | null;
        capacity: string | null;
      }
    | {
        id: string;
        name: string | null;
        asset_number: string | null;
        capacity: string | null;
      }[]
    | null;
};

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `£${Number(n).toFixed(2)}`;
}

function fmtDates(row: BookingRow) {
  if (row.start_at && row.end_at) {
    const s = new Date(row.start_at);
    const e = new Date(row.end_at);
    const sameDay = s.toDateString() === e.toDateString();

    const date = s.toLocaleDateString("en-GB");
    const startTime = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const endDate = e.toLocaleDateString("en-GB");
    const endTime = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    return sameDay
      ? `${date} ${startTime} → ${endTime}`
      : `${date} ${startTime} → ${endDate} ${endTime}`;
  }

  if (row.start_date && row.end_date) {
    return `${row.start_date} → ${row.end_date}`;
  }

  return "—";
}

export default async function BookingsPage() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      start_date,
      end_date,
      start_at,
      end_at,
      location,
      status,
      invoice_status,
      total_invoice,
      clients:client_id (
        id,
        company_name,
        contact_name
      ),
      equipment:equipment_id (
        id,
        name,
        asset_number,
        capacity
      )
    `)
    .order("start_at", { ascending: true });

  const bookings = ((data ?? []) as BookingRow[]) || [];

  return (
    <ClientShell>
      <div style={{ width: "min(1150px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Bookings</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create and manage crane hire bookings.
            </p>
          </div>

          <a href="/bookings/new" style={primaryBtn}>
            + New booking
          </a>
        </div>

        <div style={panelStyle}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!error && bookings.length === 0 ? (
            <p style={{ margin: 0 }}>No bookings yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Dates</th>
                    <th align="left" style={thStyle}>Customer</th>
                    <th align="left" style={thStyle}>Equipment</th>
                    <th align="left" style={thStyle}>Location</th>
                    <th align="left" style={thStyle}>Status</th>
                    <th align="left" style={thStyle}>Invoice</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const client = first(b.clients);
                    const equip = first(b.equipment);

                    return (
                      <tr key={b.id}>
                        <td style={tdStyle}>{fmtDates(b)}</td>
                        <td style={tdStyle}>
                          {(client?.company_name ?? "—")}
                          {client?.contact_name ? ` — ${client.contact_name}` : ""}
                        </td>
                        <td style={tdStyle}>
                          {(equip?.name ?? "—")}
                          {equip?.asset_number ? ` — ${equip.asset_number}` : ""}
                          {equip?.capacity ? ` — ${equip.capacity}` : ""}
                        </td>
                        <td style={tdStyle}>{b.location ?? "—"}</td>
                        <td style={tdStyle}>
                          <StatusPill text={b.status} />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <StatusPill text={b.invoice_status} />
                            <div style={{ fontWeight: 800 }}>{fmtMoney(b.total_invoice)}</div>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/bookings/${b.id}`} style={actionBtn}>
                              View
                            </a>
                            <a href={`/bookings/${b.id}/edit`} style={actionBtn}>
                              Edit
                            </a>
                            <a
                              href={`/api/bookings/${b.id}/invoice`}
                              target="_blank"
                              rel="noreferrer"
                              style={actionBtn}
                            >
                              Invoice
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
  verticalAlign: "top",
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
