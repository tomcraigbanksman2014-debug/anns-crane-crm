import ClientShell from "../../ClientShell";
import CustomerForm from "../new/CustomerForm";
import CustomerQuickActions from "./CustomerQuickActions";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type TimelineItem = {
  id: string;
  kind: "job" | "transport" | "correspondence" | "quote";
  sortDate: string;
  title: string;
  subtitle: string;
  body?: string | null;
  href?: string | null;
  badge: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function formatMoney(value: number) {
  return `£${value.toFixed(2)}`;
}

function safeNum(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function buildTimeline(
  jobs: any[] = [],
  transportJobs: any[] = [],
  correspondence: any[] = [],
  quotes: any[] = []
): TimelineItem[] {
  const jobItems: TimelineItem[] = jobs.map((job: any) => {
    const total = safeNum(job.total_invoice ?? job.invoice_total ?? job.invoice_amount);
    const paid = safeNum(job.amount_paid);
    const outstanding = Math.max(total - paid, 0);

    return {
      id: `job-${job.id}`,
      kind: "job",
      sortDate: String(job.job_date || job.created_at || ""),
      title: `Job #${job.job_number ?? "—"}${job.site_name ? ` — ${job.site_name}` : ""}`,
      subtitle: [
        job.job_date ? formatDateOnly(job.job_date) : "-",
        job.status ? `Status: ${job.status}` : null,
        `Invoice: ${formatMoney(total)}`,
        `Outstanding: ${formatMoney(outstanding)}`,
      ]
        .filter(Boolean)
        .join(" • "),
      body: job.notes ?? null,
      href: `/jobs/${job.id}`,
      badge: "JOB",
    };
  });

  const transportItems: TimelineItem[] = transportJobs.map((t: any) => {
    const total = safeNum(t.total_invoice ?? t.agreed_sell_rate ?? t.price);
    const paid = safeNum(t.amount_paid);
    const outstanding = Math.max(total - paid, 0);

    return {
      id: `transport-${t.id}`,
      kind: "transport",
      sortDate: String(t.transport_date || t.created_at || ""),
      title: t.transport_number
        ? `${t.transport_number}${t.load_description ? ` — ${t.load_description}` : ""}`
        : "Transport Job",
      subtitle: [
        t.transport_date ? formatDateOnly(t.transport_date) : "-",
        t.delivery_date && t.delivery_date !== t.transport_date
          ? `to ${formatDateOnly(t.delivery_date)}`
          : null,
        t.status ? `Status: ${t.status}` : null,
        `Invoice: ${formatMoney(total)}`,
        `Outstanding: ${formatMoney(outstanding)}`,
      ]
        .filter(Boolean)
        .join(" • "),
      body:
        [t.collection_address, t.delivery_address]
          .filter(Boolean)
          .join(" → ") || null,
      href: `/transport-jobs/${t.id}`,
      badge: "TRANSPORT",
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
      subtitle: [
        formatDateTime(entry.created_at),
        entry.created_by_username ? `By: ${entry.created_by_username}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      body: entry.message ?? "",
      href: null,
      badge: label,
    };
  });

  const quoteItems: TimelineItem[] = quotes.map((q: any) => {
    const amount =
      q.amount != null && Number.isFinite(Number(q.amount))
        ? `£${Number(q.amount).toFixed(2)}`
        : "-";

    return {
      id: `quote-${q.id}`,
      kind: "quote",
      sortDate: String(q.created_at || q.quote_date || ""),
      title: q.subject || "Quote",
      subtitle: [
        q.quote_date ? formatDateOnly(q.quote_date) : "-",
        q.status ? `Status: ${q.status}` : null,
        `Amount: ${amount}`,
      ]
        .filter(Boolean)
        .join(" • "),
      body: q.notes ?? "",
      href: `/quotes/${q.id}`,
      badge: "QUOTE",
    };
  });

  return [
    ...jobItems,
    ...transportItems,
    ...correspondenceItems,
    ...quoteItems,
  ].sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)));
}

function buildCustomerStats(
  jobs: any[] = [],
  transportJobs: any[] = [],
  quotes: any[] = [],
  correspondence: any[] = []
) {
  const totalJobs = jobs.length;
  const totalTransportJobs = transportJobs.length;
  const totalQuotes = quotes.length;
  const totalCorrespondence = correspondence.length;

  const jobInvoiced = jobs.reduce((sum: number, j: any) => {
    return sum + safeNum(j.total_invoice ?? j.invoice_total ?? j.invoice_amount);
  }, 0);

  const transportInvoiced = transportJobs.reduce((sum: number, t: any) => {
    return sum + safeNum(t.total_invoice ?? t.agreed_sell_rate ?? t.price);
  }, 0);

  const jobOutstanding = jobs.reduce((sum: number, j: any) => {
    return (
      sum +
      Math.max(
        safeNum(j.total_invoice ?? j.invoice_total ?? j.invoice_amount) - safeNum(j.amount_paid),
        0
      )
    );
  }, 0);

  const transportOutstanding = transportJobs.reduce((sum: number, t: any) => {
    return (
      sum +
      Math.max(
        safeNum(t.total_invoice ?? t.agreed_sell_rate ?? t.price) - safeNum(t.amount_paid),
        0
      )
    );
  }, 0);

  const allActivityDates = [
    ...jobs.map((x: any) => x.job_date || x.created_at || null),
    ...transportJobs.map((x: any) => x.transport_date || x.created_at || null),
  ]
    .filter(Boolean)
    .map((x) => String(x))
    .sort();

  return {
    totalJobs,
    totalTransportJobs,
    totalQuotes,
    totalCorrespondence,
    totalInvoiced: jobInvoiced + transportInvoiced,
    totalOutstanding: jobOutstanding + transportOutstanding,
    firstActivityDate: allActivityDates[0] ?? null,
    lastActivityDate: allActivityDates[allActivityDates.length - 1] ?? null,
  };
}

export default async function CustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServerClient();

  const [
    { data: customer, error },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportJobsError },
    { data: correspondence, error: correspondenceError },
    { data: quotes, error: quotesError },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, notes, created_at")
      .eq("id", params.id)
      .single(),

    supabase
      .from("jobs")
      .select(
        "id, job_number, job_date, status, site_name, notes, total_invoice, invoice_total, invoice_amount, amount_paid, created_at"
      )
      .eq("client_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("transport_jobs")
      .select(
        "id, transport_number, transport_date, delivery_date, status, collection_address, delivery_address, load_description, total_invoice, agreed_sell_rate, price, amount_paid, created_at"
      )
      .eq("client_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("customer_correspondence")
      .select("id, entry_type, subject, message, created_at, created_by_username")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false }),

    supabase
      .from("quotes")
      .select("id, status, quote_date, amount, subject, notes, created_at")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false }),
  ]);

  const safeJobs = jobs ?? [];
  const safeTransportJobs = transportJobs ?? [];
  const safeCorrespondence = correspondence ?? [];
  const safeQuotes = quotes ?? [];

  const timeline = buildTimeline(
    safeJobs,
    safeTransportJobs,
    safeCorrespondence,
    safeQuotes
  );

  const stats = buildCustomerStats(
    safeJobs,
    safeTransportJobs,
    safeQuotes,
    safeCorrespondence
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
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
              View customer details, jobs, transport, quotes and correspondence.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/customers" style={btnStyle}>
              ← Back
            </a>
            <a href="/quotes/new" style={btnStyle}>
              + New quote
            </a>
          </div>
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

            <section style={{ ...cardStyle, marginTop: 18 }}>
              <h2 style={sectionTitle}>Customer statistics</h2>

              <div style={statsGridStyle}>
                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Jobs</div>
                  <div style={statValueStyle}>{stats.totalJobs}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Transport jobs</div>
                  <div style={statValueStyle}>{stats.totalTransportJobs}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Quotes</div>
                  <div style={statValueStyle}>{stats.totalQuotes}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Correspondence</div>
                  <div style={statValueStyle}>{stats.totalCorrespondence}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Total invoiced</div>
                  <div style={statValueStyle}>{formatMoney(stats.totalInvoiced)}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Outstanding</div>
                  <div style={statValueStyle}>{formatMoney(stats.totalOutstanding)}</div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>First activity</div>
                  <div style={statValueStyleSmall}>
                    {stats.firstActivityDate ? formatDateOnly(stats.firstActivityDate) : "-"}
                  </div>
                </div>

                <div style={statCardStyle}>
                  <div style={statLabelStyle}>Last activity</div>
                  <div style={statValueStyleSmall}>
                    {stats.lastActivityDate ? formatDateOnly(stats.lastActivityDate) : "-"}
                  </div>
                </div>
              </div>
            </section>

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

                  {jobsError ? (
                    <div style={errorBox}>{jobsError.message}</div>
                  ) : transportJobsError ? (
                    <div style={errorBox}>{transportJobsError.message}</div>
                  ) : correspondenceError ? (
                    <div style={errorBox}>{correspondenceError.message}</div>
                  ) : quotesError ? (
                    <div style={errorBox}>{quotesError.message}</div>
                  ) : timeline.length === 0 ? (
                    <p style={{ margin: 0 }}>No customer activity yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {timeline.map((item) => (
                        <div key={item.id} style={timelineCardStyle}>
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
                                    item.kind === "job"
                                      ? "rgba(0,180,120,0.12)"
                                      : item.kind === "transport"
                                      ? "rgba(255,170,0,0.14)"
                                      : item.kind === "quote"
                                      ? "rgba(140,0,255,0.10)"
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
                      ))}
                    </div>
                  )}
                </section>

                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Recent live jobs</h2>

                  {safeJobs.length === 0 ? (
                    <p style={{ margin: 0 }}>No jobs recorded yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {safeJobs.slice(0, 8).map((job: any) => {
                        const total = safeNum(job.total_invoice ?? job.invoice_total ?? job.invoice_amount);
                        const outstanding = Math.max(total - safeNum(job.amount_paid), 0);

                        return (
                          <a key={job.id} href={`/jobs/${job.id}`} style={linkedRowStyle}>
                            <div>
                              <div style={{ fontWeight: 900 }}>
                                Job #{job.job_number ?? "—"}
                                {job.site_name ? ` • ${job.site_name}` : ""}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                {job.job_date ? formatDateOnly(job.job_date) : "-"} • {job.status ?? "-"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{formatMoney(total)}</div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                Outstanding {formatMoney(outstanding)}
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Recent transport jobs</h2>

                  {safeTransportJobs.length === 0 ? (
                    <p style={{ margin: 0 }}>No transport jobs recorded yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {safeTransportJobs.slice(0, 8).map((job: any) => {
                        const total = safeNum(job.total_invoice ?? job.agreed_sell_rate ?? job.price);
                        const outstanding = Math.max(total - safeNum(job.amount_paid), 0);

                        return (
                          <a key={job.id} href={`/transport-jobs/${job.id}`} style={linkedRowStyle}>
                            <div>
                              <div style={{ fontWeight: 900 }}>
                                {job.transport_number || "Transport Job"}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                {job.transport_date ? formatDateOnly(job.transport_date) : "-"}
                                {job.delivery_date && job.delivery_date !== job.transport_date
                                  ? ` → ${formatDateOnly(job.delivery_date)}`
                                  : ""}
                                {" • "}
                                {job.status ?? "-"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 900 }}>{formatMoney(total)}</div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                                Outstanding {formatMoney(outstanding)}
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section style={cardStyle}>
                  <h2 style={sectionTitle}>Recent quotes</h2>

                  {safeQuotes.length === 0 ? (
                    <p style={{ margin: 0 }}>No quotes recorded yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {safeQuotes.slice(0, 8).map((quote: any) => (
                        <a key={quote.id} href={`/quotes/${quote.id}`} style={linkedRowStyle}>
                          <div>
                            <div style={{ fontWeight: 900 }}>{quote.subject || "Quote"}</div>
                            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.78 }}>
                              {quote.quote_date ? formatDateOnly(quote.quote_date) : "-"} • {quote.status ?? "-"}
                            </div>
                          </div>
                          <div style={{ fontWeight: 900 }}>
                            {quote.amount != null && Number.isFinite(Number(quote.amount))
                              ? formatMoney(Number(quote.amount))
                              : "-"}
                          </div>
                        </a>
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
                      {customer.created_at ? formatDateTime(customer.created_at) : "-"}
                    </div>
                    <div>
                      <strong>Notes:</strong> {customer.notes ?? "-"}
                    </div>
                  </div>
                </section>

                <CustomerQuickActions
                  customerId={params.id}
                  phone={customer.phone}
                  email={customer.email}
                />
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

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statCardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  marginBottom: 8,
  fontWeight: 700,
};

const statValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
};

const statValueStyleSmall: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
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

const linkedRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.42)",
  border: "1px solid rgba(0,0,0,0.08)",
  color: "#111",
  textDecoration: "none",
};
