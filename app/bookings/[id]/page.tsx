import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function fmtMoney(value: any) {
  const n = Number(value ?? null);
  if (!Number.isFinite(n)) return "-";
  return `£${n.toFixed(2)}`;
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function BookingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: booking, error }, { data: linkedJob }] = await Promise.all([
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
        total_invoice,
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

  const client = first((booking as any)?.clients);
  const equipment = first((booking as any)?.equipment);

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
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
              View booking details and linked records.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/bookings" style={btnStyle}>
              ← Back to bookings
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

            {(booking as any)?.client_id ? (
              <a href={`/customers/${(booking as any).client_id}`} style={btnStyle}>
                Open customer
              </a>
            ) : null}
          </div>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !booking ? (
          <div style={errorBox}>Booking not found.</div>
        ) : (
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1.2fr 0.9fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 18 }}>
              <section style={cardStyle}>
                <h2 style={sectionTitle}>Booking details</h2>

                <div style={gridStyle}>
                  <div>
                    <strong>Booking ID:</strong>
                    <div>{(booking as any).id}</div>
                  </div>

                  <div>
                    <strong>Status:</strong>
                    <div>{(booking as any).status ?? "-"}</div>
                  </div>

                  <div>
                    <strong>Start date:</strong>
                    <div>{fmtDate((booking as any).start_date)}</div>
                  </div>

                  <div>
                    <strong>End date:</strong>
                    <div>{fmtDate((booking as any).end_date)}</div>
                  </div>

                  <div>
                    <strong>Start time:</strong>
                    <div>{fmtDateTime((booking as any).start_at)}</div>
                  </div>

                  <div>
                    <strong>End time:</strong>
                    <div>{fmtDateTime((booking as any).end_at)}</div>
                  </div>

                  <div>
                    <strong>Location:</strong>
                    <div>{(booking as any).location ?? "-"}</div>
                  </div>

                  <div>
                    <strong>Created:</strong>
                    <div>{fmtDateTime((booking as any).created_at)}</div>
                  </div>

                  <div>
                    <strong>Invoice total:</strong>
                    <div>{fmtMoney((booking as any).total_invoice)}</div>
                  </div>

                  <div>
                    <strong>Invoice status:</strong>
                    <div>{(booking as any).invoice_status ?? "-"}</div>
                  </div>
                </div>
              </section>

              <section style={cardStyle}>
                <h2 style={sectionTitle}>Linked job</h2>

                {linkedJob ? (
                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Job number:</strong> {linkedJob.job_number ?? "-"}
                    </div>
                    <div>
                      <strong>Status:</strong> {linkedJob.status ?? "-"}
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
                      <strong>Company:</strong> {client.company_name ?? "-"}
                    </div>
                    <div>
                      <strong>Contact:</strong> {client.contact_name ?? "-"}
                    </div>
                    <div>
                      <strong>Phone:</strong> {client.phone ?? "-"}
                    </div>
                    <div>
                      <strong>Email:</strong> {client.email ?? "-"}
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
                      <strong>Name:</strong> {equipment.name ?? "-"}
                    </div>
                    <div>
                      <strong>Status:</strong> {equipment.status ?? "-"}
                    </div>
                    <div>
                      <strong>Equipment ID:</strong> {equipment.id ?? "-"}
                    </div>

                    <a href={`/equipment/${equipment.id}`} style={linkBtnStyle}>
                      Open equipment
                    </a>
                  </div>
                ) : (
                  <p style={{ margin: 0 }}>No equipment linked.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </ClientShell>
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
  fontSize: 14,
};
