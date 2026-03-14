import ClientShell from "../ClientShell";
import { createSupabaseServerClient } from "../lib/supabase/server";

function matchesQuery(vehicle: any, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    vehicle.name,
    vehicle.reg_number,
    vehicle.vehicle_type,
    vehicle.capacity,
    vehicle.trailer_type,
    vehicle.status,
    vehicle.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams?: { q?: string; success?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const query = String(searchParams?.q ?? "").trim();

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("*")
    .order("name", { ascending: true });

  const list = (vehicles ?? []).filter((vehicle: any) => matchesQuery(vehicle, query));
  const successMessage = searchParams?.success ? decodeURIComponent(searchParams.success) : "";
  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <ClientShell>
      <div style={{ width: "min(1200px, 96vw)", margin: "0 auto" }}>
        <div style={cardStyle}>
          <div style={headerRow}>
            <div>
              <h1 style={{ marginTop: 0, fontSize: 32 }}>Vehicles</h1>
              <p style={{ opacity: 0.8, marginTop: 6 }}>
                Manage trucks, wagons, low loaders and transport vehicles.
              </p>
            </div>

            <a href="/vehicles/new" style={primaryBtn}>
              + Create vehicle
            </a>
          </div>

          {successMessage ? <div style={successBox}>{successMessage}</div> : null}
          {errorMessage ? <div style={errorBox}>{errorMessage}</div> : null}

          <section style={sectionCard}>
            <form method="get" action="/vehicles" style={searchRow}>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Search vehicle name, reg, type, trailer..."
                style={searchInput}
              />
              <button type="submit" style={secondaryBtn}>
                Search
              </button>
              {query ? (
                <a href="/vehicles" style={secondaryBtn}>
                  Clear
                </a>
              ) : null}
            </form>
          </section>

          <section style={{ ...sectionCard, marginTop: 16 }}>
            <h2 style={sectionTitle}>Existing vehicles</h2>

            {error ? (
              <div style={errorBox}>{error.message}</div>
            ) : list.length === 0 ? (
              <p style={{ margin: 0 }}>No vehicles found.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {list.map((vehicle: any) => (
                  <div key={vehicle.id} style={itemCard}>
                    <div style={itemHeader}>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 1000 }}>
                          {vehicle.name ?? "Vehicle"}
                        </div>
                        <div style={{ marginTop: 6, opacity: 0.72 }}>
                          {vehicle.reg_number ?? "—"} • {vehicle.vehicle_type ?? "—"} • {vehicle.trailer_type ?? "—"}
                        </div>
                      </div>

                      <a href={`/vehicles/${vehicle.id}`} style={secondaryBtn}>
                        Open
                      </a>
                    </div>

                    <div style={metaGrid}>
                      <Meta label="Status" value={vehicle.status ?? "—"} />
                      <Meta label="Capacity" value={vehicle.capacity ?? "—"} />
                      <Meta label="MOT Due" value={vehicle.mot_due_date ?? "—"} />
                      <Meta label="Service Due" value={vehicle.service_due_date ?? "—"} />
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

function Meta({ label, value }: { label: string; value: string }) {
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

const itemCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.45)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 12,
  padding: 14,
};

const itemHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
