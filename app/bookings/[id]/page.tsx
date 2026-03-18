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

function bookingKind(
  status: string | null | undefined
): "good" | "warn" | "bad" | "neutral" | "info" {
  const s = String(status ?? "").toLowerCase();
  if (["confirmed", "booked", "live", "in progress", "in_progress"].includes(s)) return "good";
  if (["inquiry", "enquiry", "pending", "draft"].includes(s)) return "warn";
  if (["cancelled", "canceled"].includes(s)) return "bad";
  if (["completed", "done"].includes(s)) return "info";
  return "neutral";
}

function invoiceKind(
  status: string | null | undefined
): "good" | "warn" | "bad" | "neutral" | "info" {
  const s = String(status ?? "").toLowerCase();
  if (["paid"].includes(s)) return "good";
  if (["sent", "part paid", "part_paid"].includes(s)) return "warn";
  if (["overdue"].includes(s)) return "bad";
  return "neutral";
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { success?: string; error?: string };
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
            updated_at,
            start_date,
            end_date,
            start_at,
            end_at,
            status,
            location,
            site_address,
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
            crane_id,
            clients:client_id (
              id,
              company_name,
              contact_name,
              phone,
              email
            ),
            cranes:crane_id (
              id,
              name,
              reg_number,
              fleet_number,
              capacity,
              status
            )
          `)
          .eq("id", params.id)
          .single(),

        supabase
          .from("jobs")
          .select("id, job_number, status, booking_id")
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

  const successMessage = searchParams?.success
    ? decodeURIComponent(searchParams.success)
    : "";
  const errorMessage = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : "";

  const client = first(booking?.clients);
  const crane = first(booking?.cranes);

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
              Crane booking details.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/bookings" style={btnStyle}>← Back to bookings</a>
            <a href={`/bookings/${params.id}/edit`} style={btnStyle}>Edit booking</a>

            {linkedJob?.id ? (
              <a href={`/jobs/${linkedJob.id}`} style={primaryBtnStyle}>
                Open job
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
          </div>
        </div>

        {successMessage ? <div style={successBox}>{successMessage}</div> : null}
        {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}
        {loadError ? (
          <div style={errorBox}>{loadError}</div>
        ) : !booking ? (
          <div style={errorBox}>Booking not found.</div>
        ) : (
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 18,
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Booking details</h2>

                <div style={gridStyle}>
                  <InfoRow
                    label="Status"
                    valueNode={
                      <StatusPill
                        text={booking.status ?? "—"}
                        kind={bookingKind(booking.status)}
                      />
                    }
                  />
                  <InfoRow
                    label="Invoice status"
                    valueNode={
                      <StatusPill
                        text={booking.invoice_status ?? "—"}
                        kind={invoiceKind(booking.invoice_status)}
                      />
                    }
                  />
                  <InfoRow label="Start date" value={fmtDate(booking.start_date)} />
                  <InfoRow label="End date" value={fmtDate(booking.end_date)} />
                  <InfoRow label="Start time" value={fmtDateTime(booking.start_at)} />
                  <InfoRow label="End time" value={fmtDateTime(booking.end_at)} />
                  <InfoRow label="Location" value={booking.location ?? "—"} />
                  <InfoRow label="Site address" value={booking.site_address ?? "—"} />
                  <InfoRow label="PO number" value={booking.po_number ?? "—"} />
                  <InfoRow label="Job reference" value={booking.job_reference ?? "—"} />
                  <InfoRow label="Operator name" value={booking.operator_name ?? "—"} />
                  <InfoRow label="Created" value={fmtDateTime(booking.created_at)} />
                  <InfoRow label="Updated" value={fmtDateTime(booking.updated_at)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Financials</h2>
                <div style={gridStyle}>
                  <InfoRow label="Hire price" value={fmtMoney(booking.hire_price)} />
                  <InfoRow label="VAT" value={fmtMoney(booking.vat)} />
                  <InfoRow label="Total invoice" value={fmtMoney(booking.total_invoice)} />
                  <InfoRow label="Payment received" value={fmtMoney(booking.payment_received)} />
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Convert to job</h2>

                {linkedJob?.id ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 14 }}>
                      This booking is already linked to a job.
                    </div>
                    <a href={`/jobs/${linkedJob.id}`} style={primaryLinkStyle}>
                      Open linked job
                    </a>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 14 }}>
                      Create a live job from this booking.
                    </div>
                    <form
                      action={`/api/bookings/${params.id}/convert-to-job`}
                      method="post"
                      style={{ margin: 0 }}
                    >
                      <button type="submit" style={primaryBtnStyle}>
                        Convert booking to job
                      </button>
                    </form>
                  </div>
                )}
              </section>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Customer</h2>
                <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                  <div><strong>Company:</strong> {client?.company_name ?? "—"}</div>
                  <div><strong>Contact:</strong> {client?.contact_name ?? "—"}</div>
                  <div><strong>Phone:</strong> {client?.phone ?? "—"}</div>
                  <div><strong>Email:</strong> {client?.email ?? "—"}</div>
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Crane</h2>
                <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                  <div><strong>Name:</strong> {crane?.name ?? "—"}</div>
                  <div><strong>Reg:</strong> {crane?.reg_number ?? "—"}</div>
                  <div><strong>Fleet:</strong> {crane?.fleet_number ?? "—"}</div>
                  <div><strong>Capacity:</strong> {crane?.capacity ?? "—"}</div>
                  <div><strong>Status:</strong> {crane?.status ?? "—"}</div>
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Notes</h2>
                <div style={notesBox}>{booking.notes ?? booking.driver_notes ?? "—"}</div>
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
  fontWeight: 900,
  cursor: "pointer",
};

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  textDecoration: "none",
  color: "#fff",
  fontWeight: 900,
  width: "fit-content",
};

const successBox: React.CSSProperties = {
  marginTop: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
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
