import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function clean(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function shortText(value: string | null | undefined, max = 120) {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type SearchPageProps = {
  searchParams?: {
    q?: string | string[];
    type?: string | string[];
  };
};

export default async function GlobalSearchPage({
  searchParams,
}: SearchPageProps) {
  const supabase = createSupabaseServerClient();

  const q = clean(searchParams?.q);
  const type = clean(searchParams?.type).toLowerCase() || "all";

  let customers: any[] = [];
  let jobs: any[] = [];
  let transportJobs: any[] = [];
  let quotes: any[] = [];

  if (q) {
    const customerQuery = supabase
      .from("clients")
      .select("id, company_name, contact_name, phone, email, archived, created_at")
      .eq("archived", false)
      .or(
        `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
      )
      .order("company_name", { ascending: true })
      .limit(20);

    const jobQuery = supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        site_name,
        site_address,
        job_date,
        status,
        archived,
        clients:client_id (
          company_name
        )
      `)
      .eq("archived", false)
      .or(
        `site_name.ilike.%${q}%,site_address.ilike.%${q}%,status.ilike.%${q}%`
      )
      .order("job_date", { ascending: false })
      .limit(20);

    const transportQuery = supabase
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        transport_date,
        collection_address,
        delivery_address,
        load_description,
        status,
        archived,
        clients:client_id (
          company_name
        )
      `)
      .eq("archived", false)
      .or(
        `transport_number.ilike.%${q}%,collection_address.ilike.%${q}%,delivery_address.ilike.%${q}%,load_description.ilike.%${q}%,status.ilike.%${q}%`
      )
      .order("transport_date", { ascending: false })
      .limit(20);

    const quoteQuery = supabase
      .from("quotes")
      .select(`
        id,
        subject,
        amount,
        status,
        quote_date,
        valid_until,
        archived,
        clients:client_id (
          company_name
        )
      `)
      .eq("archived", false)
      .or(`subject.ilike.%${q}%,status.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    const [
      { data: customersRes },
      { data: jobsRes },
      { data: transportRes },
      { data: quotesRes },
    ] = await Promise.all([
      type === "all" || type === "customers"
        ? customerQuery
        : Promise.resolve({ data: [] as any[] }),
      type === "all" || type === "jobs"
        ? jobQuery
        : Promise.resolve({ data: [] as any[] }),
      type === "all" || type === "transport"
        ? transportQuery
        : Promise.resolve({ data: [] as any[] }),
      type === "all" || type === "quotes"
        ? quoteQuery
        : Promise.resolve({ data: [] as any[] }),
    ]);

    customers = customersRes ?? [];
    jobs = jobsRes ?? [];
    transportJobs = transportRes ?? [];
    quotes = quotesRes ?? [];
  }

  const totalResults =
    customers.length + jobs.length + transportJobs.length + quotes.length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Global Search</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Search customers, jobs, transport jobs and quotes from one place.
              </p>
            </div>
          </div>

          <form method="get" action="/search" style={searchBarWrap}>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search customer, job, transport ref, address, quote subject..."
              style={searchInput}
            />

            <select name="type" defaultValue={type} style={selectStyle}>
              <option value="all">All</option>
              <option value="customers">Customers</option>
              <option value="jobs">Jobs</option>
              <option value="transport">Transport</option>
              <option value="quotes">Quotes</option>
            </select>

            <button type="submit" style={primaryBtn}>
              Search
            </button>
          </form>

          {!q ? (
            <div style={infoBox}>Enter a search term to begin.</div>
          ) : (
            <>
              <div style={summaryRow}>
                <div style={summaryBox}>
                  <div style={summaryLabel}>Query</div>
                  <div style={summaryValue}>{q}</div>
                </div>
                <div style={summaryBox}>
                  <div style={summaryLabel}>Filter</div>
                  <div style={summaryValue}>{type}</div>
                </div>
                <div style={summaryBox}>
                  <div style={summaryLabel}>Results</div>
                  <div style={summaryValue}>{String(totalResults)}</div>
                </div>
              </div>

              {totalResults === 0 ? (
                <div style={infoBox}>No results found.</div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {(type === "all" || type === "customers") && customers.length > 0 ? (
                    <section style={sectionCard}>
                      <h2 style={sectionTitle}>Customers</h2>
                      <div style={resultGrid}>
                        {customers.map((item) => (
                          <a
                            key={item.id}
                            href={`/customers/${item.id}`}
                            style={resultCardLink}
                          >
                            <div style={resultTitle}>
                              {item.company_name ?? "Customer"}
                            </div>
                            <div style={resultMeta}>
                              Contact: {item.contact_name ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Phone: {item.phone ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Email: {item.email ?? "—"}
                            </div>
                            <div style={resultSubtle}>
                              Created: {fmtDate(item.created_at)}
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(type === "all" || type === "jobs") && jobs.length > 0 ? (
                    <section style={sectionCard}>
                      <h2 style={sectionTitle}>Jobs</h2>
                      <div style={resultGrid}>
                        {jobs.map((item) => (
                          <a key={item.id} href={`/jobs/${item.id}`} style={resultCardLink}>
                            <div style={resultTitle}>
                              Job #{item.job_number ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Customer: {item.clients?.company_name ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Site: {item.site_name ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Address: {shortText(item.site_address)}
                            </div>
                            <div style={resultSubtle}>
                              {fmtDate(item.job_date)} • {item.status ?? "—"}
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(type === "all" || type === "transport") && transportJobs.length > 0 ? (
                    <section style={sectionCard}>
                      <h2 style={sectionTitle}>Transport Jobs</h2>
                      <div style={resultGrid}>
                        {transportJobs.map((item) => (
                          <a
                            key={item.id}
                            href={`/transport-jobs/${item.id}`}
                            style={resultCardLink}
                          >
                            <div style={resultTitle}>
                              {item.transport_number ?? "Transport Job"}
                            </div>
                            <div style={resultMeta}>
                              Customer: {item.clients?.company_name ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Pickup: {shortText(item.collection_address)}
                            </div>
                            <div style={resultMeta}>
                              Delivery: {shortText(item.delivery_address)}
                            </div>
                            <div style={resultSubtle}>
                              {fmtDate(item.transport_date)} • {item.status ?? "—"}
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {(type === "all" || type === "quotes") && quotes.length > 0 ? (
                    <section style={sectionCard}>
                      <h2 style={sectionTitle}>Quotes</h2>
                      <div style={resultGrid}>
                        {quotes.map((item) => (
                          <a key={item.id} href={`/quotes/${item.id}`} style={resultCardLink}>
                            <div style={resultTitle}>{item.subject ?? "Quote"}</div>
                            <div style={resultMeta}>
                              Customer: {item.clients?.company_name ?? "—"}
                            </div>
                            <div style={resultMeta}>
                              Amount: {fmtMoney(item.amount)}
                            </div>
                            <div style={resultMeta}>
                              Valid until: {fmtDate(item.valid_until)}
                            </div>
                            <div style={resultSubtle}>
                              {fmtDate(item.quote_date)} • {item.status ?? "—"}
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const searchBarWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 1fr) 180px 140px",
  gap: 10,
  marginTop: 16,
  marginBottom: 16,
};

const searchInput: React.CSSProperties = {
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
  width: "100%",
};

const primaryBtn: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const infoBox: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  lineHeight: 1.5,
};

const summaryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const summaryBox: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.38)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const summaryLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.72,
  fontWeight: 800,
};

const summaryValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 1000,
};

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.24)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const resultGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const resultCardLink: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "#111",
  padding: 14,
  borderRadius: 12,
  background: "rgba(255,255,255,0.55)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const resultTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 16,
};

const resultMeta: React.CSSProperties = {
  marginTop: 6,
  fontSize: 13,
};

const resultSubtle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  opacity: 0.72,
};
