import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import CustomerArchiveButton from "./CustomerArchiveButton";
import { getCustomerActivityRollups } from "../lib/customerActivity";

function daysBetween(from: string | null | undefined, to = new Date()) {
  if (!from) return null;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  const diff = to.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
}

function getActivityInfo(lastActivityDate: string | null | undefined) {
  const days = daysBetween(lastActivityDate);

  if (days == null) {
    return {
      key: "no_activity",
      label: "No activity",
      bg: "rgba(0,0,0,0.08)",
      color: "#111",
    };
  }

  if (days <= 30) {
    return {
      key: "active",
      label: "Active",
      bg: "rgba(0,160,80,0.14)",
      color: "#0b6b34",
    };
  }

  if (days <= 90) {
    return {
      key: "recent",
      label: "Recent",
      bg: "rgba(255,180,0,0.16)",
      color: "#8a6200",
    };
  }

  return {
    key: "dormant",
    label: "Dormant",
    bg: "rgba(180,0,0,0.12)",
    color: "#8a1f1f",
  };
}

type SortKey =
  | "company"
  | "contact"
  | "phone"
  | "email"
  | "last_activity"
  | "activity"
  | "imported"
  | "archived"
  | "created";

type SortDir = "asc" | "desc";

const SORT_KEYS: SortKey[] = [
  "company",
  "contact",
  "phone",
  "email",
  "last_activity",
  "activity",
  "imported",
  "archived",
  "created",
];

const ACTIVITY_ORDER: Record<string, number> = {
  active: 1,
  recent: 2,
  dormant: 3,
  no_activity: 4,
};

function normalise(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function includesFilter(value: unknown, filter: string) {
  if (!filter) return true;
  return normalise(value).includes(normalise(filter));
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function valueAsDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dateMatchesRange(
  value: string | null | undefined,
  from: string,
  to: string
) {
  const date = valueAsDate(value);
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);

  if (!fromDate && !toDate) return true;
  if (!date) return false;

  if (fromDate && date < fromDate) return false;
  if (toDate) {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);
    if (date > endOfDay) return false;
  }

  return true;
}

function compareNullable(a: unknown, b: unknown, dir: SortDir) {
  const aBlank = a == null || String(a).trim() === "";
  const bBlank = b == null || String(b).trim() === "";

  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  const aValue = typeof a === "number" ? a : String(a).toLowerCase();
  const bValue = typeof b === "number" ? b : String(b).toLowerCase();

  if (aValue < bValue) return dir === "asc" ? -1 : 1;
  if (aValue > bValue) return dir === "asc" ? 1 : -1;
  return 0;
}

function dateSortValue(value: string | null | undefined) {
  const d = valueAsDate(value);
  return d ? d.getTime() : null;
}

type CustomersPageProps = {
  searchParams?: {
    q?: string;
    view?: string;
    activity?: string;
    imported?: string;
    company?: string;
    contact?: string;
    phone?: string;
    email?: string;
    last_from?: string;
    last_to?: string;
    created_from?: string;
    created_to?: string;
    sort?: string;
    dir?: string;
  };
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const supabase = createSupabaseServerClient();

  const q = String(searchParams?.q ?? "").trim();
  const view = String(searchParams?.view ?? "active").trim().toLowerCase();
  const activityFilter = String(searchParams?.activity ?? "all").trim().toLowerCase();
  const importedFilter = String(searchParams?.imported ?? "all").trim().toLowerCase();
  const companyFilter = String(searchParams?.company ?? "").trim();
  const contactFilter = String(searchParams?.contact ?? "").trim();
  const phoneFilter = String(searchParams?.phone ?? "").trim();
  const emailFilter = String(searchParams?.email ?? "").trim();
  const lastFrom = String(searchParams?.last_from ?? "").trim();
  const lastTo = String(searchParams?.last_to ?? "").trim();
  const createdFrom = String(searchParams?.created_from ?? "").trim();
  const createdTo = String(searchParams?.created_to ?? "").trim();
  const requestedSort = String(searchParams?.sort ?? "created").trim().toLowerCase();
  const sort: SortKey = SORT_KEYS.includes(requestedSort as SortKey)
    ? (requestedSort as SortKey)
    : "created";
  const dir: SortDir = searchParams?.dir === "asc" ? "asc" : "desc";

  const filtersAreActive = Boolean(
    q ||
      companyFilter ||
      contactFilter ||
      phoneFilter ||
      emailFilter ||
      lastFrom ||
      lastTo ||
      createdFrom ||
      createdTo ||
      activityFilter !== "all" ||
      importedFilter !== "all"
  );

  let query = supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (view === "archived") {
    query = query.eq("archived", true);
  } else if (view === "all") {
    // no archive filter
  } else {
    query = query.eq("archived", false);
  }

  if (q) {
    const escaped = q.replace(/,/g, " ");
    query = query.or(
      `company_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`
    );
  }

  const { data: customers, error } = await query;

  const clientIds = (customers ?? []).map((c: any) => c.id).filter(Boolean);
  const rollupByClientId: Record<string, any> = {};
  const customerRollups = await getCustomerActivityRollups(supabase, clientIds);

  customerRollups.forEach((row, clientId) => {
    rollupByClientId[clientId] = row;
  });

  const filteredCustomers = (customers ?? [])
    .filter((customer: any) => {
      const rollup = rollupByClientId[customer.id] ?? null;
      const lastActivity = rollup?.last_activity_date ?? null;
      const activity = getActivityInfo(lastActivity);
      const importedHistoryCount = Number(rollup?.imported_history_count ?? 0);

      const activityOk =
        activityFilter === "all" ? true : activity.key === activityFilter;

      const importedOk =
        importedFilter === "all"
          ? true
          : importedFilter === "with_imported"
          ? importedHistoryCount > 0
          : importedFilter === "without_imported"
          ? importedHistoryCount === 0
          : true;

      return (
        activityOk &&
        importedOk &&
        includesFilter(customer.company_name, companyFilter) &&
        includesFilter(customer.contact_name, contactFilter) &&
        includesFilter(customer.phone, phoneFilter) &&
        includesFilter(customer.email, emailFilter) &&
        dateMatchesRange(lastActivity, lastFrom, lastTo) &&
        dateMatchesRange(customer.created_at, createdFrom, createdTo)
      );
    })
    .sort((a: any, b: any) => {
      const aRollup = rollupByClientId[a.id] ?? null;
      const bRollup = rollupByClientId[b.id] ?? null;
      const aActivity = getActivityInfo(aRollup?.last_activity_date ?? null);
      const bActivity = getActivityInfo(bRollup?.last_activity_date ?? null);

      if (sort === "company") return compareNullable(a.company_name, b.company_name, dir);
      if (sort === "contact") return compareNullable(a.contact_name, b.contact_name, dir);
      if (sort === "phone") return compareNullable(a.phone, b.phone, dir);
      if (sort === "email") return compareNullable(a.email, b.email, dir);
      if (sort === "last_activity") {
        return compareNullable(
          dateSortValue(aRollup?.last_activity_date ?? null),
          dateSortValue(bRollup?.last_activity_date ?? null),
          dir
        );
      }
      if (sort === "activity") {
        return compareNullable(
          ACTIVITY_ORDER[aActivity.key] ?? 99,
          ACTIVITY_ORDER[bActivity.key] ?? 99,
          dir
        );
      }
      if (sort === "imported") {
        return compareNullable(
          Number(aRollup?.imported_history_count ?? 0),
          Number(bRollup?.imported_history_count ?? 0),
          dir
        );
      }
      if (sort === "archived") {
        return compareNullable(a.archived ? 1 : 0, b.archived ? 1 : 0, dir);
      }

      return compareNullable(
        dateSortValue(a.created_at),
        dateSortValue(b.created_at),
        dir
      );
    });

  const buildUrl = (overrides: Record<string, string | undefined | null>) => {
    const params = new URLSearchParams();
    const next = {
      view,
      q,
      company: companyFilter,
      contact: contactFilter,
      phone: phoneFilter,
      email: emailFilter,
      last_from: lastFrom,
      last_to: lastTo,
      activity: activityFilter,
      imported: importedFilter,
      created_from: createdFrom,
      created_to: createdTo,
      sort,
      dir,
      ...overrides,
    };

    Object.entries(next).forEach(([key, value]) => {
      if (value == null) return;
      const stringValue = String(value).trim();
      if (!stringValue) return;
      if (key === "activity" && stringValue === "all") return;
      if (key === "imported" && stringValue === "all") return;
      if (key === "sort" && stringValue === "created") return;
      if (key === "dir" && stringValue === "desc") return;
      params.set(key, stringValue);
    });

    const queryString = params.toString();
    return queryString ? `/customers?${queryString}` : "/customers";
  };

  const sortHref = (key: SortKey) => {
    const nextDir: SortDir = sort === key && dir === "asc" ? "desc" : "asc";
    return buildUrl({ sort: key, dir: nextDir });
  };

  const sortArrow = (key: SortKey) => {
    if (sort !== key) return "↕";
    return dir === "asc" ? "↑" : "↓";
  };

  const sortableHeader = (key: SortKey, label: string) => (
    <th align="left" style={thStyle}>
      <a href={sortHref(key)} style={sortLinkStyle} title={`Sort by ${label}`}>
        {label} <span style={{ opacity: 0.65 }}>{sortArrow(key)}</span>
      </a>
    </th>
  );

  return (
    <ClientShell>
      <div style={{ width: "min(1180px, 95vw)", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap" as const,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Customers</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View, search, sort and manage customer records.
            </p>
          </div>

          <a href="/customers/new" style={primaryBtnStyle}>
            + Add customer
          </a>
        </div>

        <div style={tabsRow}>
          <a
            href={buildUrl({ view: "active" })}
            style={view === "active" ? activeTabBtn : tabBtn}
          >
            Active
          </a>
          <a
            href={buildUrl({ view: "archived" })}
            style={view === "archived" ? activeTabBtn : tabBtn}
          >
            Archived
          </a>
          <a
            href={buildUrl({ view: "all" })}
            style={view === "all" ? activeTabBtn : tabBtn}
          >
            All
          </a>
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <form method="get" action="/customers" style={filtersGridStyle}>
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />

            <label style={fieldLabelStyle}>
              Quick search
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Company, contact, phone or email"
                style={inputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Company
              <input
                type="text"
                name="company"
                defaultValue={companyFilter}
                placeholder="Filter company"
                style={inputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Contact
              <input
                type="text"
                name="contact"
                defaultValue={contactFilter}
                placeholder="Filter contact"
                style={inputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Phone
              <input
                type="text"
                name="phone"
                defaultValue={phoneFilter}
                placeholder="Filter phone"
                style={inputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Email
              <input
                type="text"
                name="email"
                defaultValue={emailFilter}
                placeholder="Filter email"
                style={inputStyle}
              />
            </label>

            <label style={fieldLabelStyle}>
              Last activity from
              <input type="date" name="last_from" defaultValue={lastFrom} style={inputStyle} />
            </label>

            <label style={fieldLabelStyle}>
              Last activity to
              <input type="date" name="last_to" defaultValue={lastTo} style={inputStyle} />
            </label>

            <label style={fieldLabelStyle}>
              Activity
              <select name="activity" defaultValue={activityFilter} style={inputStyle}>
                <option value="all">All activity</option>
                <option value="active">Active</option>
                <option value="recent">Recent</option>
                <option value="dormant">Dormant</option>
                <option value="no_activity">No activity</option>
              </select>
            </label>

            <label style={fieldLabelStyle}>
              Historic diary
              <select name="imported" defaultValue={importedFilter} style={inputStyle}>
                <option value="all">All diary history</option>
                <option value="with_imported">With imported history</option>
                <option value="without_imported">Without imported history</option>
              </select>
            </label>

            <label style={fieldLabelStyle}>
              Created from
              <input type="date" name="created_from" defaultValue={createdFrom} style={inputStyle} />
            </label>

            <label style={fieldLabelStyle}>
              Created to
              <input type="date" name="created_to" defaultValue={createdTo} style={inputStyle} />
            </label>

            <div style={buttonGroupStyle}>
              <button type="submit" style={primaryBtnStyle}>
                Filter
              </button>

              <a href={`/customers?view=${view}`} style={secondaryBtnStyle}>
                Clear
              </a>
            </div>
          </form>

          {filtersAreActive ? (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Showing filtered results. Click any column heading to sort.
            </p>
          ) : (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Showing {view === "active" ? "active" : view === "archived" ? "archived" : "all"} customers. Click any column heading to sort.
            </p>
          )}
        </section>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!filteredCustomers || filteredCustomers.length === 0 ? (
            <p style={{ margin: 0 }}>
              {filtersAreActive ? "No customers matched your filters." : "No customers yet."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {sortableHeader("company", "Company")}
                    {sortableHeader("contact", "Contact")}
                    {sortableHeader("phone", "Phone")}
                    {sortableHeader("email", "Email")}
                    {sortableHeader("last_activity", "Last activity")}
                    {sortableHeader("activity", "Activity")}
                    {sortableHeader("imported", "Historic diary")}
                    {sortableHeader("archived", "Archived")}
                    {sortableHeader("created", "Created")}
                    <th align="left" style={thStyle}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c: any) => {
                    const rollup = rollupByClientId[c.id] ?? null;
                    const lastActivity = rollup?.last_activity_date ?? null;
                    const activity = getActivityInfo(lastActivity);
                    const importedHistoryCount = Number(
                      rollup?.imported_history_count ?? 0
                    );

                    return (
                      <tr key={c.id}>
                        <td style={tdStyle}>{c.company_name ?? "-"}</td>
                        <td style={tdStyle}>{c.contact_name ?? "-"}</td>
                        <td style={tdStyle}>{c.phone ?? "-"}</td>
                        <td style={tdStyle}>{c.email ?? "-"}</td>
                        <td style={tdStyle}>{formatDate(lastActivity)}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 800,
                              background: activity.bg,
                              color: activity.color,
                            }}
                          >
                            {activity.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {importedHistoryCount > 0 ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 8px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 800,
                                background: "rgba(80,120,255,0.12)",
                                color: "#27408b",
                              }}
                            >
                              {importedHistoryCount} imported
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={tdStyle}>{c.archived ? "Yes" : "No"}</td>
                        <td style={tdStyle}>{formatDateTime(c.created_at)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                            <a href={`/customers/${c.id}`} style={linkBtnStyle}>
                              Open
                            </a>
                            <CustomerArchiveButton id={c.id} archived={!!c.archived} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <a
            href="/dashboard"
            style={{ textDecoration: "none", fontWeight: 800, color: "#111" }}
          >
            ← Back to dashboard
          </a>
        </div>
      </div>
    </ClientShell>
  );
}

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

const tabBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.12)",
};

const activeTabBtn: React.CSSProperties = {
  ...tabBtn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

const filtersGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  alignItems: "end",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 12,
  fontWeight: 800,
  color: "#111",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const buttonGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "#111",
  textDecoration: "none",
  color: "#fff",
  fontWeight: 800,
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const linkBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.45)",
  textDecoration: "none",
  color: "#111",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.10)",
  fontSize: 12,
  opacity: 0.95,
  whiteSpace: "nowrap",
};

const sortLinkStyle: React.CSSProperties = {
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};
