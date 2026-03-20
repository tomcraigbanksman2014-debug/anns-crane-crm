import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { getAccessContext, canViewInvoices, canCreateBookings } from "../lib/access";

type BookingRow = {
  id: string;
  created_at: string | null;
  start_date: string | null;
  end_date: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  status: string | null;
  invoice_status: string | null;
  hire_price: number | null;
  total_invoice: number | null;
  payment_received: number | null;
  po_number: string | null;
  job_reference: string | null;
  operator_name: string | null;
};

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

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function fmtDates(row: BookingRow) {
  if (row.start_at || row.end_at) {
    return `${fmtDateTime(row.start_at)} → ${fmtDateTime(row.end_at)}`;
  }

  if (row.start_date || row.end_date) {
    return `${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}`;
  }

  return "—";
}

function pillStyle(kind: "neutral" | "good" | "warn" | "bad"): React.CSSProperties {
  if (kind === "good") {
    return {
      background: "rgba(0,180,120,0.12)",
      color: "#0b7a4b",
      border: "1px solid rgba(0,180,120,0.20)",
    };
  }

  if (kind === "warn") {
    return {
      background: "rgba(255,170,0,0.14)",
      color: "#8a5200",
      border: "1px solid rgba(255,170,0,0.24)",
    };
  }

  if (kind === "bad") {
    return {
      background: "rgba(255,0,0,0.12)",
      color: "#b00020",
      border: "1px solid rgba(255,0,0,0.22)",
    };
  }

  return {
    background: "rgba(255,255,255,0.45)",
    color: "#111",
    border: "1px solid rgba(0,0,0,0.08)",
  };
}

function bookingKind(status: string | null | undefined): "neutral" | "good" | "warn" | "bad" {
  const s = String(status ?? "").toLowerCase();

  if (["confirmed", "booked", "live", "in_progress"].includes(s)) return "good";
  if (["pending", "draft", "enquiry", "inquiry"].includes(s)) return "warn";
  if (["cancelled", "canceled"].includes(s)) return "bad";
  return "neutral";
}

function invoiceKind(status: string | null | undefined): "neutral" | "good" | "warn" | "bad" {
  const s = String(status ?? "").toLowerCase();

  if (["paid"].includes(s)) return "good";
  if (["sent", "part_paid", "part paid"].includes(s)) return "warn";
  if (["overdue"].includes(s)) return "bad";
  return "neutral";
}

export default async function BookingsPage() {
  const access = await getAccessContext();
  const showInvoices = canViewInvoices(access);
  const allowCreate = canCreateBookings(access);

  const supabase = createSupabaseServerClient();

  let rows: BookingRow[] = [];
  let loadError = "";

  try {
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
        total_invoice,
        payment_received,
        po_number,
        job_reference,
        operator_name
      `)
      .order("created_at", { ascending: false });

    if (error) {
      loadError = error.message;
    } else {
      rows = (data ?? []) as BookingRow[];
    }
  } catch (e: any) {
    loadError = e?.message ?? "Could not load bookings.";
  }

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Bookings</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Create and manage crane hire bookings.
            </p>
          </div>

          {allowCreate ? (
            <a href="/bookings/new" style={primaryBtn}>
              + New booking
            </a>
          ) : (
            <div style={disabledBtn}>Booking creation disabled</div>
          )}
        </div>

        {!showInvoices ? (
          <div style={infoBox}>Invoice visibility is disabled for your staff role.</div>
        ) : null}

        <div style={panelStyle}>
          {loadError ? <div style={errorBox}>{loadError}</div> : null}

          {!loadError && rows.length === 0 ? (
            <div style={emptyBox}>No bookings found.</div>
          ) : null}

          {!loadError && rows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>Dates</th>
                    <th align="left" style={thStyle}>Location</th>
                    <th align="left" style={thStyle}>Status</th>
                    {showInvoices ? <th align="left" style={thStyle}>Invoice</th> : null}
                    {showInvoices ? <th align="left" style={thStyle}>Financials</th> : null}
                    <th align="left" style={thStyle}>Reference</th>
                    <th align="left" style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800 }}>{fmtDates(row)}</div>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.72 }}>
                          Created: {fmtDateTime(row.created_at)}
                        </div>
                      </td>

                      <td style={tdStyle}>{row.location || "—"}</td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            ...pillStyle(bookingKind(row.status)),
                          }}
                        >
                          {row.status || "—"}
                        </span>
                      </td>

                      {showInvoices ? (
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 900,
                              ...pillStyle(invoiceKind(row.invoice_status)),
                            }}
                          >
                            {row.invoice_status || "—"}
                          </span>
                        </td>
                      ) : null}

                      {showInvoices ? (
                        <td style={tdStyle}>
                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div><strong>Hire:</strong> {fmtMoney(row.hire_price)}</div>
                            <div><strong>Total:</strong> {fmtMoney(row.total_invoice)}</div>
                            <div><strong>Paid:</strong> {fmtMoney(row.payment_received)}</div>
                          </div>
                        </td>
                      ) : null}

                      <td style={tdStyle}>
                        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                          <div><strong>PO:</strong> {row.po_number || "—"}</div>
                          <div><strong>Ref:</strong> {row.job_reference || "—"}</div>
                          <div><strong>Driver:</strong> {row.operator_name || "—"}</div>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={`/bookings/${row.id}`} style={actionBtn}>
                            Open
                          </a>
                          <a href={`/bookings/${row.id}/edit`} style={actionBtn}>
                            Edit
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </ClientShell>
  );
}

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const panelStyle: React.CSSProperties = {
  marginTop: 18,
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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
};

const disabledBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.55)",
  color: "#666",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.08)",
};

const actionBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const emptyBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const infoBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  color: "#111",
  fontWeight: 700,
};
