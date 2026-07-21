import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";
import CustomerArchiveButton from "./CustomerArchiveButton";

function daysBetween(from: string | null | undefined, to = new Date()) {
  if (!from) return null;
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return null;
  const diff = to.getTime() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function activityMeta(lastBookingDate: string | null | undefined) {
  const days = daysBetween(lastBookingDate);

  if (days == null) {
    return {
      label: "No bookings",
      bg: "rgba(0,0,0,0.08)",
      color: "#111",
    };
  }

  if (days <= 30) {
    return {
      label: "Active",
      bg: "rgba(0,160,80,0.14)",
      color: "#0b6b34",
    };
  }

  if (days <= 90) {
    return {
      label: "Recent",
      bg: "rgba(255,180,0,0.16)",
      color: "#8a6200",
    };
  }

  return {
    label: "Dormant",
    bg: "rgba(180,0,0,0.12)",
    color: "#8a1f1f",
  };
}

function formatLastBooking(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

type CustomersPageProps = {
  searchParams?: {
    q?: string;
    view?: string;
  };
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const supabase = createSupabaseServerClient();

  const q = String(searchParams?.q ?? "").trim();
  const view = String(searchParams?.view ?? "active").trim().toLowerCase();

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

  let lastBookingByClientId: Record<string, string | null> = {};

  if (clientIds.length > 0) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("client_id, start_date, start_at, created_at")
      .in("client_id", clientIds)
      .order("start_at", { ascending: false })
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false });

    for (const b of bookings ?? []) {
      const clientId = String((b as any).client_id ?? "");
      if (!clientId) continue;

      const when =
        (b as any).start_at ||
        (b as any).start_date ||
        (b as any).created_at ||
        null;

      if (!lastBookingByClientId[clientId] && when) {
        lastBookingByClientId[clientId] = String(when);
      }
    }
  }

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
            <h1 style={{ margin: 0, fontSize: 32 }}>Customers</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              View, search and manage customer records.
            </p>
          </div>

          <a href="/customers/new" style={primaryBtnStyle}>
            + Add customer
          </a>
        </div>

        <div style={tabsRow}>
          <a
            href={`/customers?view=active${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            style={view === "active" ? activeTabBtn : tabBtn}
          >
            Active
          </a>
          <a
            href={`/customers?view=archived${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            style={view === "archived" ? activeTabBtn : tabBtn}
          >
            Archived
          </a>
          <a
            href={`/customers?view=all${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            style={view === "all" ? activeTabBtn : tabBtn}
          >
            All
          </a>
        </div>

        <section style={{ ...cardStyle, marginTop: 16 }}>
          <form
            method="get"
            action="/customers"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input type="hidden" name="view" value={view} />

            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by company, contact, phone or email"
              style={inputStyle}
            />

            <button type="submit" style={primaryBtnStyle}>
              Search
            </button>

            <a href={`/customers?view=${view}`} style={secondaryBtnStyle}>
              Clear
            </a>
          </form>

          {q ? (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Search results for: <strong>{q}</strong>
            </p>
          ) : (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 14, opacity: 0.8 }}>
              Showing {view === "active" ? "active" : view === "archived" ? "archived" : "all"} customers.
            </p>
          )}
        </section>

        <div style={{ ...cardStyle, marginTop: 16 }}>
          {error && <div style={errorBox}>{error.message}</div>}

          {!customers || customers.length === 0 ? (
            <p style={{ margin: 0 }}>
              {q ? "No customers matched your search." : "No customers yet."}
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left" style={thStyle}>
                      Company
                    </th>
                    <th align="left" style={thStyle}>
                      Contact
                    </th>
                    <th align="left" style={thStyle}>
                      Phone
                    </th>
                    <th align="left" style={thStyle}>
                      Email
                    </th>
                    <th align="left" style={thStyle}>
                      Last booking
                    </th>
                    <th align="left" style={thStyle}>
                      Activity
                    </th>
                    <th align="left" style={thStyle}>
                      Archived
                    </th>
                    <th align="left" style={thStyle}>
                      Created
                    </th>
                    <th align="left" style={thStyle}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c: any) => {
                    const lastBooking = lastBookingByClientId[c.id] ?? null;
                    const activity = activityMeta(lastBooking);

                    return (
                      <tr key={c.id}>
                        <td style={tdStyle}>{c.company_name ?? "-"}</td>
                        <td style={tdStyle}>{c.contact_name ?? "-"}</td>
                        <td style={tdStyle}>{c.phone ?? "-"}</td>
                        <td style={tdStyle}>{c.email ?? "-"}</td>
                        <td style={tdStyle}>{formatLastBooking(lastBooking)}</td>
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
                        <td style={tdStyle}>{c.archived ? "Yes" : "No"}</td>
                        <td style={tdStyle}>
                          {c.created_at ? new Date(c.created_at).toLocaleString() : "-"}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
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
  opacity: 0.8,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 10px",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  fontSize: 14,
  verticalAlign: "top",
};
