import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function matchesQuery(supplier: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    supplier.company_name,
    supplier.contact_name,
    supplier.phone,
    supplier.email,
    supplier.status,
    supplier.address,
    supplier.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams?: { q?: string; success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const query = String(searchParams?.q ?? "").trim();

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .order("company_name", { ascending: true });

  const list = (suppliers ?? []).filter((supplier: any) => matchesQuery(supplier, query));
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Suppliers</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Search, open and manage cross-hire suppliers.
              </p>
            </div>

            <a href="/suppliers/new" style={primaryBtn}>
              + Create supplier
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form method="get" action="/suppliers" style={searchRow}>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search company, contact, phone, email, notes..."
                style={searchInput}
              />
              <button type="submit" style={secondaryBtn}>
                Search
              </button>
              {query ? (
                <a href="/suppliers" style={secondaryBtn}>
                  Clear
                </a>
              ) : null}
            </form>
          </section>

          <section style={{ ...sectionCard, marginTop: 16 }}>
            <h2 style={sectionTitle}>Existing suppliers</h2>

            {error ? (
              <div style={errorBox}>{error.message}</div>
            ) : list.length === 0 ? (
              <p style={{ margin: 0 }}>No suppliers found.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {list.map((supplier: any) => (
                  <div key={supplier.id} style={supplierCard}>
                    <div style={supplierHeader}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 1000 }}>
                          {supplier.company_name ?? "Supplier"}
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.72 }}>
                          {supplier.contact_name ?? "—"} • {supplier.phone ?? "—"} • {supplier.email ?? "—"}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={`/suppliers/${supplier.id}`} style={secondaryBtn}>
                          Open
                        </a>
                      </div>
                    </div>

                    <div style={metaGrid}>
                      <Meta label="Status" value={supplier.status ?? "—"} />
                      <Meta label="Address" value={supplier.address ?? "—"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ClientShell>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={metaBox}>
      <div style={metaLabel}>{label}</div>
      <div style={metaValue}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
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

const sectionCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.32)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 14,
  fontSize: 22,
};

const searchRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 280,
  height: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  boxSizing: "border-box",
};

const supplierCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const supplierHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const metaBox: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.06)",
};

const metaLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
};

const metaValue: React.CSSProperties = {
  marginTop: 4,
  fontWeight: 900,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "#111",
  color: "#fff",
  fontWeight: 900,
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  textDecoration: "none",
  background: "rgba(255,255,255,0.78)",
  color: "#111",
  fontWeight: 800,
  border: "1px solid rgba(0,0,0,0.10)",
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,180,120,0.12)",
  border: "1px solid rgba(0,180,120,0.24)",
  color: "#0b7a4b",
  fontWeight: 800,
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.25)",
};
