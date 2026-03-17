import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import StatusPill from "../../components/StatusPill";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "—";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function hasQuoteContext(text: string | null | undefined) {
  const v = String(text ?? "").toLowerCase();
  return (
    v.includes("quote subject:") ||
    v.includes("quote reference:") ||
    v.includes("quote amount:")
  );
}

function bookingKind(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" | "info" {
  const s = String(status ?? "").toLowerCase();
  if (["confirmed", "booked", "live", "in_progress"].includes(s)) return "good";
  if (["inquiry", "enquiry", "pending", "draft"].includes(s)) return "warn";
  if (["cancelled", "canceled"].includes(s)) return "bad";
  if (["completed", "done"].includes(s)) return "info";
  return "neutral";
}

function invoiceKind(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" | "info" {
  const s = String(status ?? "").toLowerCase();
  if (["paid"].includes(s)) return "good";
  if (["sent", "part_paid"].includes(s)) return "warn";
  if (["overdue"].includes(s)) return "bad";
  return "neutral";
}

function equipmentKind(status: string | null | undefined): "good" | "warn" | "bad" | "neutral" | "info" {
  const s = String(status ?? "").toLowerCase();
  if (["available"].includes(s)) return "good";
  if (["maintenance", "repair", "out of service"].includes(s)) return "warn";
  if (["on hire", "booked", "in use"].includes(s)) return "info";
  return "neutral";
}

export default async function BookingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  let booking: any = null;
  let linkedJob: any = null;
  let loadError = "";

  try {
    const [{ data: bookingData, error: bookingError }, { data: linkedJobData }] =
      await Promise.all([
        supabase
          .from("bookings")
          .select(`
            id,
            created_at,
            start_date,
            end_date,
            start_at,
            end_at,
            status,
            location,
            po_number,
            job_reference,
            operator_name,
            notes,
            driver_notes,
            hire_price,
            vat,
            total_invoice,
            payment_received,
            invoice_status,
            client_id,
            equipment_id,
            clients:client_id (
              id,
              company_name,
              contact_name,
              phone,
              email
            ),
            equipment:equipment_id (
              id,
              name,
              asset_number,
              capacity,
              status
            )
          `)
          .eq("id", params.id)
          .single(),

        supabase
          .from("jobs")
          .select("id, job_number, status")
          .eq("booking_id", params.id)
          .limit(1)
          .maybeSingle(),
      ]);

    if (bookingError) {
      loadError = bookingError.message;
    } else {
      booking = bookingData;
      linkedJob = linkedJobData;
    }
  } catch (e: any) {
    loadError = e?.message ?? "Could not load booking.";
  }

  const client = first(booking?.clients);
  const equipment = first(booking?.equipment);
  const notesText = String(booking?.notes ?? booking?.driver_notes ?? "").trim();

  return (
    <ClientShell>
      <div style={{ width: "min(1220px, 95vw)", margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Booking</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View booking details, financials and linked records.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/bookings" style={btnStyle}>
              ← Back to bookings
            </a>

            <a href={`/bookings/${params.id}/edit`} style={btnStyle}>
              Edit booking
            </a>

            {linkedJob?.id ? (
              <a href={`/jobs/${linkedJob.id}`} style={btnStyle}>
                Open job #{linkedJob.job_number ?? ""}
              </a>
            ) : (
              <form
                action={`/api/bookings/${params.id}/convert-to-job`}
                method="post"
                style={{ margin: 0 }}
              >
                <button type="submit" style={primaryBtnStyle}>
                  Convert to job
                </button>
              </form>
            )}

            {booking?.client_id ? (
              <a href={`/customers/${booking.client_id}`} style={btnStyle}>
                Open customer
              </a>
            ) : null}
          </div>
        </div>

        {loadError ? (
          <div style={errorBox}>{loadError}</div>
        ) : !booking ? (
          <div style={errorBox}>Booking not found.</div>
        ) : (
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1.15fr 0.9fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Booking details</h2>

                <div style={gridStyle}>
                  <InfoRow label="Booking ID" value={booking.id} />
                  <InfoRow
                    label="Status"
                    valueNode={
                      <StatusPill
                        text={booking.status ?? "—"}
                        kind={bookingKind(booking.status)}
                      />
                    }
                  />
                  <InfoRow label="Start date" value={fmtDate(booking.start_date)} />
                  <InfoRow label="End date" value={fmtDate(booking.end_date)} />
                  <InfoRow label="Start time" value={fmtDateTime(booking.start_at)} />
                  <InfoRow label="End time" value={fmtDateTime(booking.end_at)} />
                  <InfoRow label="Location" value={booking.location ?? "—"} />
                  <InfoRow label="PO number" value={booking.po_number ?? "—"} />
                  <InfoRow label="Job reference" value={booking.job_reference ?? "—"} />
                  <InfoRow label="Operator name" value={booking.operator_name ?? "—"} />
                  <InfoRow label="Created" value={fmtDateTime(booking.created_at)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Financials</h2>

                <div style={gridStyle}>
                  <InfoRow label="Hire price" value={fmtMoney(booking.hire_price)} />
                  <InfoRow label="VAT" value={fmtMoney(booking.vat)} />
                  <InfoRow label="Invoice total" value={fmtMoney(booking.total_invoice)} />
                  <InfoRow label="Payment received" value={fmtMoney(booking.payment_received)} />
                  <InfoRow
                    label="Invoice status"
                    valueNode={
                      <StatusPill
                        text={booking.invoice_status ?? "—"}
                        kind={invoiceKind(booking.invoice_status)}
                      />
                    }
                  />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Notes</h2>

                {notesText ? (
                  <>
                    {hasQuoteContext(notesText) ? (
                      <div style={quoteOriginBox}>
                        This booking appears to contain carried-over quote information.
                      </div>
                    ) : null}

                    <div style={notesBox}>{notesText}</div>
                  </>
                ) : (
                  <p style={{ margin: 0 }}>No notes saved.</p>
                )}
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Linked job</h2>

                {linkedJob ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Job number:</strong> {linkedJob.job_number ?? "—"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>Status:</strong>
                      <StatusPill
                        text={linkedJob.status ?? "—"}
                        kind={bookingKind(linkedJob.status)}
                      />
                    </div>
                    <a href={`/jobs/${linkedJob.id}`} style={linkBtnStyle}>
                      Open job record
                    </a>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <p style={{ margin: 0 }}>No job linked yet.</p>
                    <form
                      action={`/api/bookings/${params.id}/convert-to-job`}
                      method="post"
                      style={{ margin: 0 }}
                    >
                      <button type="submit" style={primaryBtnStyle}>
                        Convert this booking to a job
                      </button>
                    </form>
                  </div>
                )}
              </section>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Customer</h2>

                {client ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Company:</strong> {client.company_name ?? "—"}
                    </div>
                    <div>
                      <strong>Contact:</strong> {client.contact_name ?? "—"}
                    </div>
                    <div>
                      <strong>Phone:</strong> {client.phone ?? "—"}
                    </div>
                    <div>
                      <strong>Email:</strong> {client.email ?? "—"}
                    </div>

                    <a href={`/customers/${client.id}`} style={linkBtnStyle}>
                      Open customer record
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>No customer linked.</p>
                )}
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Equipment</h2>

                {equipment ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Name:</strong> {equipment.name ?? "—"}
                    </div>
                    <div>
                      <strong>Asset #:</strong> {equipment.asset_number ?? "—"}
                    </div>
                    <div>
                      <strong>Capacity:</strong> {equipment.capacity ?? "—"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>Status:</strong>
                      <StatusPill
                        text={equipment.status ?? "—"}
                        kind={equipmentKind(equipment.status)}
                      />
                    </div>

                    <a href={`/equipment/${equipment.id}`} style={linkBtnStyle}>
                      Open equipment
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>No equipment linked.</p>
                )}
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Quick actions</h2>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a
                    href={`/api/bookings/${params.id}/invoice`}
                    target="_blank"
                    rel="noreferrer"
                    style={linkBtnStyle}
                  >
                    Open invoice
                  </a>

                  <a href={`/bookings/${params.id}/edit`} style={linkBtnStyle}>
                    Edit booking
                  </a>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function InfoRow({
  label,
  value,
  valueNode,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div style={infoRow}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{valueNode ?? value ?? "—"}</div>
    </div>
  );
}

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

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  textDecoration: "none",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
  marginTop: 6,
};

const errorBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const infoRow: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
};

const infoLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 800,
};

const infoValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 800,
};

const notesBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const quoteOriginBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 700,
};
