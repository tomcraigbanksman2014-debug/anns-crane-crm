import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function statusMeta(status: string | null | undefined) {
  const value = String(status ?? "New").trim();

  if (value === "Won") return { bg: "rgba(0,160,80,0.14)", color: "#0b6b34" };
  if (value === "Lost") return { bg: "rgba(180,0,0,0.12)", color: "#8a1f1f" };
  if (value === "Quoted") return { bg: "rgba(0,120,255,0.12)", color: "#0d5ea8" };
  if (value === "Follow Up") return { bg: "rgba(255,180,0,0.16)", color: "#8a6200" };
  if (value === "Dormant") return { bg: "rgba(120,0,120,0.12)", color: "#6a1b75" };
  return { bg: "rgba(0,0,0,0.08)", color: "#111" };
}

type LeadsPageProps = {
  searchParams?: {
    q?: string;
    status?: string;
    view?: string;
    page?: string;
  };
};

const PAGE_SIZE = 100;

function applyLeadFilters<T extends any>(query: T, args: { q: string; status: string; view: string }) {
  let nextQuery = query;

  if (args.view === "archived") {
    nextQuery = nextQuery.eq("archived", true);
  } else if (args.view === "all") {
    // no archive filter
  } else {
    nextQuery = nextQuery.eq("archived", false);
  }

  if (args.status) {
    nextQuery = nextQuery.eq("status", args.status);
  }

  if (args.q) {
    const escaped = args.q.replace(/,/g, " ");
    nextQuery = nextQuery.or(
      `company_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%,area.ilike.%${escaped}%,industry.ilike.%${escaped}%`
    );
  }

  return nextQuery;
}

function buildLeadsHref(args: { view: string; q: string; status: string; page: number }) {
  const params = new URLSearchParams();

  if (args.view) params.set("view", args.view);
  if (args.q) params.set("q", args.q);
  if (args.status) params.set("status", args.status);
  if (args.page > 1) params.set("page", String(args.page));

  const query = params.toString();
  return `/sales-hub/leads${query ? `?${query}` : ""}`;
}

export default async function SalesLeadsPage({ searchParams }: LeadsPageProps) {
  const supabase = createSupabaseServerClient();

  const q = String(searchParams?.q ?? "").trim();
  const status = String(searchParams?.status ?? "").trim();
  const view = String(searchParams?.view ?? "active").trim().toLowerCase();

  const rawPage = Number(searchParams?.page ?? "1");
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const statuses = [
    "New",
    "To Contact",
    "Contacted",
    "Quoted",
    "Follow Up",
    "Won",
    "Lost",
    "Dormant",
  ];

  const countQuery = applyLeadFilters(
    supabase.from("sales_leads").select("id", { count: "exact", head: true }),
    { q, status, view }
  );

  const leadsQuery = applyLeadFilters(
    supabase
      .from("sales_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to),
    { q, status, view }
  );

  const [{ count, error: countError }, { data: leads, error }] = await Promise.all([
    countQuery,
    leadsQuery,
  ]);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const showingFrom = totalCount === 0 ? 0 : from + 1;
  const showingTo = totalCount === 0 ? 0 : Math.min(from + PAGE_SIZE, totalCount);

  const prevHref = buildLeadsHref({
    view,
    q,
    status,
    page: Math.max(1, safePage - 1),
  });

  const nextHref = buildLeadsHref({
    view,
    q,
    status,
    page: Math.min(totalPages, safePage + 1),
  });

  return (
    <ClientShell>
      <div style={{ width: "min(1250px, 95vw)", margin: "0 auto" }}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Leads</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Load potential customers, track progress and keep follow-ups organised.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/sales-hub" style={secondaryBtnStyle}>
              ← Sales Hub
            </a>
            <a href="/sales-hub/leads/new" style={primaryBtnStyle}>
              + Add lead
            </a>
          </div>
        </div>

        <div style={tabsRow}>
          <a
            href={buildLeadsHref({ view: "active", q, status, page: 1 })}
            style={view === "active" ? activeTabBtn : tabBtn}
          >
            Active
          </a>
          <a
            href={buildLeadsHref({ view: "archived", q, status, page: 1 })}
            style={view === "archived" ? activeTabBtn : tabBtn}
          >
            Archived
          </a>
          <a
            href={buildLeadsHref({ view: "all", q, status, page: 1 })}
            style={view === "all" ? activeTabBtn : tabBtn}
          >
            All
          </a>
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/leads" style={filtersGrid}>
            <input type="hidden" name="view" value={view} />

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search company, contact, phone, email, area or industry"
              style={inputStyle}
            />

            <select name="status" defaultValue={status} style={inputStyle}>
              <option value="">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <button type="submit" style={primaryBtnStyle}>Search</button>
            <a href={buildLeadsHref({ view, q: "", status: "", page: 1 })} style={secondaryBtnStyle}>
              Clear
            </a>
          </form>
        </section>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          {error ? <div style={errorBox}>{error.message}</div> : null}
          {countError ? <div style={errorBox}>{countError.message}</div> : null}

          <div style={resultsHeader}>
            <div style={{ fontWeight: 800 }}>
              {totalCount === 0
                ? "No leads to show"
                : `Showing ${showingFrom}-${showingTo} of ${totalCount} leads`}
            </div>

            {totalCount > PAGE_SIZE ? (
              <div style={pagerWrap}>
                <a
                  href={safePage > 1 ? prevHref : "#"}
                  style={safePage > 1 ? secondaryBtnStyle : disabledBtnStyle}
                  aria-disabled={safePage <= 1}
                >
                  ← Previous
                </a>
                <span style={pageMeta}>
                  Page {safePage} of {totalPages}
                </span>
                <a
                  href={safePage < totalPages ? nextHref : "#"}
                  style={safePage < totalPages ? secondaryBtnStyle : disabledBtnStyle}
                  aria-disabled={safePage >= totalPages}
                >
                  Next →
                </a>
              </div>
            ) : null}
          </div>

          {!leads || leads.length === 0 ? (
            <p style={{ margin: 0 }}>{q || status ? "No leads matched your filters." : "No leads yet."}</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th align="left" style={thStyle}>Company</th>
                      <th align="left" style={thStyle}>Contact</th>
                      <th align="left" style={thStyle}>Phone</th>
                      <th align="left" style={thStyle}>Email</th>
                      <th align="left" style={thStyle}>Area</th>
                      <th align="left" style={thStyle}>Industry</th>
                      <th align="left" style={thStyle}>Status</th>
                      <th align="left" style={thStyle}>Next follow-up</th>
                      <th align="left" style={thStyle}>Score</th>
                      <th align="left" style={thStyle}>DNC</th>
                      <th align="left" style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead: any) => {
                      const meta = statusMeta(lead.status);
                      return (
                        <tr key={lead.id}>
                          <td style={tdStyle}>{lead.company_name ?? "-"}</td>
                          <td style={tdStyle}>{lead.contact_name ?? "-"}</td>
                          <td style={tdStyle}>{lead.phone ?? "-"}</td>
                          <td style={tdStyle}>{lead.email ?? "-"}</td>
                          <td style={tdStyle}>{lead.area ?? "-"}</td>
                          <td style={tdStyle}>{lead.industry ?? "-"}</td>
                          <td style={tdStyle}>
                            <span style={{ ...pillStyle, background: meta.bg, color: meta.color }}>
                              {lead.status ?? "New"}
                            </span>
                          </td>
                          <td style={tdStyle}>{fmtDate(lead.next_follow_up_on)}</td>
                          <td style={tdStyle}>{Number(lead.lead_score ?? 0)}</td>
                          <td style={tdStyle}>{lead.do_not_contact ? "Yes" : "No"}</td>
                          <td style={tdStyle}>
                            <a href={`/sales-hub/leads/${lead.id}`} style={miniBtn}>
                              Open
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalCount > PAGE_SIZE ? (
                <div style={bottomPager}>
                  <a
                    href={safePage > 1 ? prevHref : "#"}
                    style={safePage > 1 ? secondaryBtnStyle : disabledBtnStyle}
                    aria-disabled={safePage <= 1}
                  >
                    ← Previous
                  </a>
                  <span style={pageMeta}>
                    Page {safePage} of {totalPages}
                  </span>
                  <a
                    href={safePage < totalPages ? nextHref : "#"}
                    style={safePage < totalPages ? secondaryBtnStyle : disabledBtnStyle}
                    aria-disabled={safePage >= totalPages}
                  >
                    Next →
                  </a>
                </div>
              ) : null}
            </>
          )}
        </section>
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

const filtersGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(260px, 1fr) minmax(180px, 220px) auto auto",
  gap: 10,
  alignItems: "center",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const resultsHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const pagerWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const bottomPager: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 16,
};

const pageMeta: React.CSSProperties = {
  fontWeight: 800,
  opacity: 0.8,
};

const tabBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 999,
  textDecoration: "none",
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.08)",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const disabledBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  opacity: 0.45,
  pointerEvents: "none",
};

const miniBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 8,
  textDecoration: "none",
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.16)",
};

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  fontSize: 12,
  opacity: 0.75,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  verticalAlign: "top",
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};
