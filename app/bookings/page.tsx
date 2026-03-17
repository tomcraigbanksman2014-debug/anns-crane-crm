import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import StatusPill, { bookingKind, invoiceKind } from "../components/StatusPill";

type BookingRow = {
  id: string;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
  start_at?: string | null;
  end_at?: string | null;
  location: string | null;
  status: string | null;
  invoice_status: string | null;
  hire_price: number | null;
  vat: number | null;
  total_invoice: number | null;
  payment_received: number | null;
  po_number: string | null;
  job_reference: string | null;
  operator_name: string | null;
  driver_notes: string | null;
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
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `£${Number(n).toFixed(2)}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtDates(row: BookingRow) {
  if (row.start_at && row.end_at) {
    const s = new Date(row.start_at);
    const e = new Date(row.end_at);

    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      const sameDay = s.toDateString() === e.toDateString();
      const date = s.toLocaleDateString("en-GB");
      const startTime = s.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const endDate = e.toLocaleDateString("en-GB");
      const endTime = e.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

      return sameDay
        ? `${date} ${startTime} → ${endTime}`
        : `${date} ${startTime} → ${endDate} ${endTime}`;
    }
  }

  if (row.start_date && row.end_date) {
    return row.start_date === row.end_date
      ? row.start_date
      : `${row.start_date} → ${row.end_date}`;
  }

  return "—";
}

function shortText(value: string | null | undefined, max = 90) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function BookingsPage() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(`
      id,
      created_at,
      start_date,
      end_date,
      start_at,
      end_at,
      location,
      status,
      invoice_status,
      hire_price,
      vat,
      total_invoice,
      payment_received,
      po_number,
      job_reference,
      operator_name,
      driver_notes,
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
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
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
                    <th align="left" style={thStyle}>Financials</th>
                    <th align="left" style={thStyle}>Reference</th>
                    <th align="left" style={thStyle}>Driver / Notes</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const client = first(b.clients);
                    const equip = first(b.equipment);

                    return (
                      <tr key={b.id}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>{fmtDates(b)}</div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            Created: {fmtDate(b.created_at)}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {client?.company_name ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {client?.contact_name ?? "—"}
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ fontWeight: 800 }}>
                            {equip?.name ?? "—"}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                            {equip?.asset_number ?? "—"}
                            {equip?.capacity ? ` • ${equip.capacity}` : ""}
                          </div>
                        </td>

                        <td style={tdStyle}>{b.location ?? "—"}</td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 6 }}>
                            <StatusPill
                              text={b.status ?? "—"}
                              kind={bookingKind(String(b.status ?? ""))}
                            />
                            <StatusPill
                              text={b.invoice_status ?? "—"}
                              kind={invoiceKind(String(b.invoice_status ?? ""))}
                            />
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div><strong>Hire:</strong> {fmtMoney(b.hire_price)}</div>
                            <div><strong>VAT:</strong> {fmtMoney(b.vat)}</div>
                            <div><strong>Total:</strong> {fmtMoney(b.total_invoice)}</div>
                            <div><strong>Paid:</strong> {fmtMoney(b.payment_received)}</div>
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div><strong>PO:</strong> {b.po_number ?? "—"}</div>
                            <div><strong>Ref:</strong> {b.job_reference ?? "—"}</div>
                          </div>
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div><strong>Driver:</strong> {b.operator_name ?? "—"}</div>
                            <div>{shortText(b.driver_notes)}</div>
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
