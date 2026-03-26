import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { runGlobalSearch, type SearchItem, type SearchScope } from "../lib/global-search";

function clean(value: string | string[] | undefined) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  return String(value ?? "").trim();
}

type SearchPageProps = {
  searchParams?: {
    q?: string | string[];
    type?: string | string[];
  };
};

function sectionTitle(scope: SearchScope) {
  if (scope === "customers") return "Customers";
  if (scope === "jobs") return "Jobs";
  if (scope === "transport") return "Transport Jobs";
  if (scope === "quotes") return "Quotes";
  if (scope === "bookings") return "Bookings";
  if (scope === "equipment") return "Equipment";
  if (scope === "audit") return "Audit Log";
  return "Results";
}

function typeStyle(type: SearchItem["type"]): React.CSSProperties {
  const map: Record<SearchItem["type"], React.CSSProperties> = {
    customer: {
      background: "rgba(0,120,255,0.10)",
      border: "1px solid rgba(0,120,255,0.20)",
    },
    job: {
      background: "rgba(170,0,255,0.10)",
      border: "1px solid rgba(170,0,255,0.18)",
    },
    transport: {
      background: "rgba(0,180,120,0.10)",
      border: "1px solid rgba(0,180,120,0.20)",
    },
    quote: {
      background: "rgba(255,170,0,0.14)",
      border: "1px solid rgba(255,170,0,0.22)",
    },
    booking: {
      background: "rgba(255,140,0,0.14)",
      border: "1px solid rgba(255,140,0,0.22)",
    },
    equipment: {
      background: "rgba(120,120,120,0.10)",
      border: "1px solid rgba(120,120,120,0.18)",
    },
    audit: {
      background: "rgba(255,0,0,0.10)",
      border: "1px solid rgba(255,0,0,0.20)",
    },
  };
  return map[type];
}

function ResultSection({
  title,
  items,
}: {
  title: string;
  items: SearchItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section style={sectionCard}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={resultGrid}>
        {items.map((item) => (
          <a key={`${item.type}:${item.id}`} href={item.href} style={resultCardLink}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  ...typeChipStyle,
                  ...typeStyle(item.type),
                }}
              >
                {item.type.toUpperCase()}
              </span>
              <div style={resultTitle}>{item.title}</div>
            </div>

            <div style={resultMeta}>{item.subtitle}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default async function GlobalSearchPage({
  searchParams,
}: SearchPageProps) {
  const supabase = createSupabaseServerClient();

  const q = clean(searchParams?.q);
  const type = (clean(searchParams?.type).toLowerCase() || "all") as SearchScope;

  const { grouped, flat } = q
    ? await runGlobalSearch(supabase, q, type, 20)
    : {
        grouped: {
          customers: [],
          jobs: [],
          transport: [],
          quotes: [],
          bookings: [],
          equipment: [],
          audit: [],
        },
        flat: [],
      };

  const totalResults = flat.length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 100%)", maxWidth: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Global Search</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Search customers, jobs, transport jobs, quotes, bookings, equipment and audit log from one place.
              </p>
            </div>
          </div>

          <form method="get" action="/search" style={searchBarWrap}>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search customer, job, transport ref, address, quote, booking, PO, equipment..."
              style={searchInput}
            />

            <select name="type" defaultValue={type} style={selectStyle}>
              <option value="all">All</option>
              <option value="customers">Customers</option>
              <option value="jobs">Jobs</option>
              <option value="transport">Transport</option>
              <option value="quotes">Quotes</option>
              <option value="bookings">Bookings</option>
              <option value="equipment">Equipment</option>
              <option value="audit">Audit</option>
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
                  <div style={summaryValue}>{sectionTitle(type)}</div>
                </div>
                <div style={summaryBox}>
                  <div style={summaryLabel}>Results</div>
                  <div style={summaryValue}>{String(totalResults)}</div>
                </div>
              </div>

              {totalResults === 0 ? (
                <div style={infoBox}>No results found.</div>
              ) : type === "all" ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <ResultSection title="Customers" items={grouped.customers} />
                  <ResultSection title="Jobs" items={grouped.jobs} />
                  <ResultSection title="Transport Jobs" items={grouped.transport} />
                  <ResultSection title="Quotes" items={grouped.quotes} />
                  <ResultSection title="Bookings" items={grouped.bookings} />
                  <ResultSection title="Equipment" items={grouped.equipment} />
                  <ResultSection title="Audit Log" items={grouped.audit} />
                </div>
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  <ResultSection
                    title={sectionTitle(type)}
                    items={
                      type === "customers"
                        ? grouped.customers
                        : type === "jobs"
                          ? grouped.jobs
                          : type === "transport"
                            ? grouped.transport
                            : type === "quotes"
                              ? grouped.quotes
                              : type === "bookings"
                                ? grouped.bookings
                                : type === "equipment"
                                  ? grouped.equipment
                                  : grouped.audit
                    }
                  />
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
  maxWidth: "100%",
  overflowX: "hidden",
  boxSizing: "border-box",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginTop: 16,
  marginBottom: 16,
  width: "100%",
  maxWidth: "100%",
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

const sectionTitleStyle: React.CSSProperties = {
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

const typeChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
};

const resultTitle: React.CSSProperties = {
  fontWeight: 1000,
  fontSize: 16,
};

const resultMeta: React.CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 1.45,
};
