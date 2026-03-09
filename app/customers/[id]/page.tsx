import ClientShell from "../../ClientShell";
import CustomerForm from "../new/CustomerForm";
import AddCorrespondenceForm from "./AddCorrespondenceForm";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type TimelineItem =
  | {
      id: string;
      kind: "booking";
      sortDate: string;
      title: string;
      subtitle: string;
      body?: string | null;
      href?: string | null;
      badge: string;
    }
  | {
      id: string;
      kind: "correspondence";
      sortDate: string;
      title: string;
      subtitle: string;
      body?: string | null;
      href?: string | null;
      badge: string;
    };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function buildTimeline(
  bookings: any[] = [],
  correspondence: any[] = []
): TimelineItem[] {
  const bookingItems: TimelineItem[] = bookings.map((b: any) => {
    const when = b.start_at || b.start_date || b.created_at || "";
    const money =
      b.total_invoice != null ? `£${Number(b.total_invoice).toFixed(2)}` : "-";

    return {
      id: `booking-${b.id}`,
      kind: "booking",
      sortDate: String(when),
      title: `Booking${b.location ? ` — ${b.location}` : ""}`,
      subtitle: [
        b.start_at
          ? formatDateTime(b.start_at)
          : b.start_date
          ? formatDateOnly(b.start_date)
          : "-",
        b.status ? `Status: ${b.status}` : null,
        `Invoice: ${money}`,
      ]
        .filter(Boolean)
        .join(" • "),
      body: null,
      href: `/bookings/${b.id}`,
      badge: "BOOKING",
    };
  });

  const correspondenceItems: TimelineItem[] = correspondence.map((entry: any) => {
    const type = String(entry.entry_type ?? "note").toLowerCase();
    const label =
      type === "call" ? "CALL" : type === "email" ? "EMAIL" : "NOTE";

    return {
      id: `correspondence-${entry.id}`,
      kind: "correspondence",
      sortDate: String(entry.created_at ?? ""),
      title: entry.subject || `Customer ${type}`,
      subtitle: formatDateTime(entry.created_at),
      body: entry.message ?? "",
      href: null,
      badge: label,
    };
  });

  return [...bookingItems, ...correspondenceItems].sort((a, b) =>
    String(b.sortDate).localeCompare(String(a.sortDate))
  );
}

export default async function CustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: customer, error } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, email, notes, created_at")
    .eq("id", params.id)
    .single();

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(
      "id, start_date, end_date, start_at, end_at, status, location, total_invoice, created_at"
    )
    .eq("client_id", params.id)
    .order("start_date", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: correspondence, error: correspondenceError } = await supabase
    .from("customer_correspondence")
    .select("id, entry_type, subject, message, created_at")
    .eq("client_id", params.id)
    .order("created_at", { ascending: false });

  const timeline = buildTimeline(bookings ?? [], correspondence ?? []);

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
            <h1 style={{ margin: 0, fontSize: 32 }}>
              {customer?.company_name ?? "Customer"}
            </h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View customer details, activity timeline and correspondence.
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
                gridTemplateColumns: "1.35fr 0.9fr",
                gap: 18,
                alignItems: "start",
              }}
            >
              <div style={{ display: "grid", gap: 18 }}>
                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Customer timeline</h2>

                  {bookingsError ? (
                    <div style={errorBox}>{bookingsError.message}</div>
                  ) : correspondenceError ? (
                    <div style={errorBox}>{correspondenceError.message}</div>
                  ) : timeline.length === 0 ? (
                    <p style={{ margin: 0 }}>No customer activity yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {timeline.map((item) => (
                        <div key={item.id} style={timelineCardStyle}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  marginBottom: 8,
                                }}
                              >
                                <span
                                  style={{
                                    ...badgeStyle,
                                    background:
                                      item.kind === "booking"
                                        ? "rgba(0,120,255,0.10)"
                                        : "rgba(0,0,0,0.08)",
                                  }}
                                >
                                  {item.badge}
                                </span>

                                {item.href ? (
                                  <a
                                    href={item.href}
                                    style={{
                                      color: "#111",
                                      fontWeight: 800,
                                      textDecoration: "none",
                                    }}
                                  >
                                    {item.title}
                                  </a>
                                ) : (
                                  <strong>{item.title}</strong>
                                )}
                              </div>

                              <div
                                style={{
                                  fontSize: 13,
                                  opacity: 0.78,
                                  marginBottom: item.body ? 10 : 0,
                                }}
                              >
                                {item.subtitle}
                              </div>

                              {item.body ? (
                                <div
                                  style={{
                                    whiteSpace: "pre-wrap",
                                    fontSize: 14,
                                    lineHeight: 1.55,
                                  }}
                                >
                                  {item.body}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div style={{ display: "grid", gap: 18 }}>
                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Customer summary</h2>

                  <div style={{ display: "grid", gap: 10, fontSize: 14 }}>
                    <div>
                      <strong>Company:</strong> {customer.company_name ?? "-"}
                    </div>
                    <div>
                      <strong>Contact:</strong> {customer.contact_name ?? "-"}
                    </div>
                    <div>
                      <strong>Phone:</strong> {customer.phone ?? "-"}
                    </div>
                    <div>
                      <strong>Email:</strong> {customer.email ?? "-"}
                    </div>
                    <div>
                      <strong>Created:</strong>{" "}
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleString()
                        : "-"}
                    </div>
                    <div>
                      <strong>Notes:</strong> {customer.notes ?? "-"}
                    </div>
                  </div>
                </section>

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

const timelineCardStyle: React.CSSProperties = {
  padding: 14,
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
};
