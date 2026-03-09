import ClientShell from "../../ClientShell";
import CustomerForm from "../new/CustomerForm";
import AddCorrespondenceForm from "./AddCorrespondenceForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export default async function CustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer, error } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, notes")
    .eq("id", params.id)
    .single();

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("id, created_at, booking_date, status, reference")
    .eq("client_id", params.id)
    .order("booking_date", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: correspondence, error: correspondenceError } = await supabase
    .from("customer_correspondence")
    .select("id, entry_type, subject, message, created_at")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

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
            <h1 style={{ margin: 0, fontSize: 32 }}>
              {customer?.company_name ?? "Customer"}
            </h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View customer details, booking history, and correspondence.
            </p>
          </div>

          <a href="/customers" style={btnStyle}>
            ← Back
          </a>
        </div>

        {error ? (
          <div style={errorBox}>{error.message}</div>
        ) : !customer ? (
          <div style={errorBox}>Customer not found.</div>
        ) : (
          <>
            <div style={{ marginTop: 16 }}>
              <CustomerForm mode="edit" customer={customer} />
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 18 }}>
                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Booking history</h2>

                  {bookingsError ? (
                    <div style={errorBox}>{bookingsError.message}</div>
                  ) : !bookings || bookings.length === 0 ? (
                    <p style={{ margin: 0 }}>No bookings found for this customer.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th align="left" style={thStyle}>Reference</th>
                            <th align="left" style={thStyle}>Booking date</th>
                            <th align="left" style={thStyle}>Status</th>
                            <th align="left" style={thStyle}>Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookings.map((b: any) => (
                            <tr key={b.id}>
                              <td style={tdStyle}>{b.reference ?? b.id}</td>
                              <td style={tdStyle}>
                                {b.booking_date
                                  ? new Date(b.booking_date).toLocaleString()
                                  : "-"}
                              </td>
                              <td style={tdStyle}>{b.status ?? "-"}</td>
                              <td style={tdStyle}>
                                {b.created_at
                                  ? new Date(b.created_at).toLocaleString()
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Correspondence log</h2>

                  {correspondenceError ? (
                    <div style={errorBox}>{correspondenceError.message}</div>
                  ) : !correspondence || correspondence.length === 0 ? (
                    <p style={{ margin: 0 }}>No correspondence logged yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {correspondence.map((entry: any) => (
                        <div key={entry.id} style={entryCardStyle}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                              flexWrap: "wrap",
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={badgeStyle}>
                                {String(entry.entry_type ?? "note").toUpperCase()}
                              </span>
                              <strong>{entry.subject || "No subject"}</strong>
                            </div>

                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                              {entry.created_at
                                ? new Date(entry.created_at).toLocaleString()
                                : "-"}
                            </span>
                          </div>

                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {entry.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div>
                <AddCorrespondenceForm customerId={params.id} />
              </div>
            </div>
          </>
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

const entryCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: "rgba(0,0,0,0.08)",
};
