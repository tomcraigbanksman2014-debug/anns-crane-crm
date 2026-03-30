import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtDateRange(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return "—";
  const s = fmtDate(start);
  const e = fmtDate(end);
  if (!start || s === e) return s;
  return `${s} → ${e}`;
}

function validCraneJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "draft" && status !== "cancelled" && status !== "late_cancelled";
}

function validTransportJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "cancelled";
}

function craneStart(row: any) {
  return row?.start_date || row?.job_date || row?.end_date || null;
}

function craneEnd(row: any) {
  return row?.end_date || row?.start_date || row?.job_date || null;
}

function transportStart(row: any) {
  return row?.transport_date || row?.delivery_date || null;
}

function transportEnd(row: any) {
  return row?.delivery_date || row?.transport_date || null;
}

function overlapsWindow(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  windowStart: string,
  windowEnd: string
) {
  const start = dateOnly(startValue);
  const end = dateOnly(endValue || startValue);

  if (!start) return false;

  return start <= windowEnd && (end || start) >= windowStart;
}

function craneEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function vehicleEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function serviceMatch(assetType: "crane" | "transport", services: string[] | null | undefined) {
  const joined = (services ?? []).join(" ").toLowerCase();

  if (!joined.trim()) return 1;

  if (assetType === "crane") {
    if (
      joined.includes("crane") ||
      joined.includes("contract lift") ||
      joined.includes("spider") ||
      joined.includes("lifting")
    ) {
      return 3;
    }
    return 0;
  }

  if (
    joined.includes("transport") ||
    joined.includes("hiab") ||
    joined.includes("haulage") ||
    joined.includes("container") ||
    joined.includes("machinery")
  ) {
    return 3;
  }

  return 0;
}

function statusWeight(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (s === "follow up") return 20;
  if (s === "to contact") return 18;
  if (s === "contacted") return 14;
  if (s === "dormant") return 16;
  if (s === "quoted") return 10;
  if (s === "new") return 12;
  if (s === "won" || s === "lost") return -100;
  return 0;
}

function leadRank(
  assetType: "crane" | "transport",
  lead: any
) {
  const serviceScore = serviceMatch(assetType, lead.services);
  if (serviceScore === 0) return -999;

  let score = 0;
  score += Number(lead.lead_score ?? 0);
  score += serviceScore * 15;
  score += statusWeight(lead.status);

  if (lead.phone) score += 8;
  if (lead.email) score += 6;
  if (lead.next_follow_up_on) score += 4;

  return score;
}

function assetPitch(assetType: "crane" | "transport", asset: any, days: number) {
  if (assetType === "crane") {
    return `${asset.name || "Crane"} is currently free over the next ${days} day${days === 1 ? "" : "s"}. Good angle: short-notice crane availability, contract lifts, restricted access or support on upcoming jobs.`;
  }

  return `${asset.name || "Vehicle"} is currently free over the next ${days} day${days === 1 ? "" : "s"}. Good angle: HIAB transport, container work, machinery moves and short-notice transport support.`;
}

type AvailabilityPageProps = {
  searchParams?: {
    days?: string;
    type?: string;
  };
};

export default async function AvailabilityDrivenSellingPage({
  searchParams,
}: AvailabilityPageProps) {
  const supabase = createSupabaseServerClient();

  const days = Math.max(1, Math.min(14, Number(searchParams?.days || 7) || 7));
  const typeFilter = String(searchParams?.type ?? "all").toLowerCase();

  const now = new Date();
  const tomorrow = addDays(now, 1);
  const endDate = addDays(tomorrow, days - 1);
  const windowStart = tomorrow.toISOString().slice(0, 10);
  const windowEnd = endDate.toISOString().slice(0, 10);

  const [
    { data: cranes, error: cranesError },
    { data: vehicles, error: vehiclesError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
    { data: leads, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),

    supabase
      .from("jobs")
      .select("id, crane_id, client_id, site_name, job_date, start_date, end_date, status")
      .not("crane_id", "is", null),

    supabase
      .from("transport_jobs")
      .select("id, vehicle_id, client_id, transport_date, delivery_date, collection_address, delivery_address, status")
      .not("vehicle_id", "is", null),

    supabase
      .from("sales_leads")
      .select("id, company_name, contact_name, phone, email, status, services, lead_score, do_not_contact, archived, next_follow_up_on")
      .eq("archived", false)
      .eq("do_not_contact", false)
      .order("lead_score", { ascending: false }),
  ]);

  const activeCraneJobs = (jobs ?? []).filter(
    (row: any) =>
      validCraneJob(row) &&
      row.crane_id &&
      overlapsWindow(craneStart(row), craneEnd(row), windowStart, windowEnd)
  );

  const activeTransportJobs = (transportJobs ?? []).filter(
    (row: any) =>
      validTransportJob(row) &&
      row.vehicle_id &&
      overlapsWindow(transportStart(row), transportEnd(row), windowStart, windowEnd)
  );

  const bookedCraneIds = new Set(activeCraneJobs.map((row: any) => String(row.crane_id)));
  const bookedVehicleIds = new Set(activeTransportJobs.map((row: any) => String(row.vehicle_id)));

  const freeCranes = (cranes ?? [])
    .filter((crane: any) => craneEligibleStatus(crane.status))
    .filter((crane: any) => !bookedCraneIds.has(String(crane.id)))
    .map((crane: any) => {
      const suggestions = [...(leads ?? [])]
        .map((lead: any) => ({
          lead,
          score: leadRank("crane", lead),
        }))
        .filter((row) => row.score > -999)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return {
        asset: crane,
        assetType: "crane" as const,
        pitch: assetPitch("crane", crane, days),
        suggestions,
      };
    });

  const freeVehicles = (vehicles ?? [])
    .filter((vehicle: any) => vehicleEligibleStatus(vehicle.status))
    .filter((vehicle: any) => !bookedVehicleIds.has(String(vehicle.id)))
    .map((vehicle: any) => {
      const suggestions = [...(leads ?? [])]
        .map((lead: any) => ({
          lead,
          score: leadRank("transport", lead),
        }))
        .filter((row) => row.score > -999)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return {
        asset: vehicle,
        assetType: "transport" as const,
        pitch: assetPitch("transport", vehicle, days),
        suggestions,
      };
    });

  const assetCards = [
    ...(typeFilter === "all" || typeFilter === "cranes" ? freeCranes : []),
    ...(typeFilter === "all" || typeFilter === "transport" ? freeVehicles : []),
  ];

  const noSuggestionsCount = assetCards.filter((item) => item.suggestions.length === 0).length;

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Availability-Driven Selling</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Use upcoming free capacity to drive outbound sales activity.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        {cranesError ? <div style={errorCard}>{cranesError.message}</div> : null}
        {vehiclesError ? <div style={errorCard}>{vehiclesError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}
        {leadsError ? <div style={errorCard}>{leadsError.message}</div> : null}

        <div style={statsGrid}>
          <StatCard label="Window" value={`${fmtDate(windowStart)} → ${fmtDate(windowEnd)}`} />
          <StatCard label="Free cranes" value={String(freeCranes.length)} />
          <StatCard label="Free vehicles" value={String(freeVehicles.length)} />
          <StatCard label="Assets with no matches" value={String(noSuggestionsCount)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/availability-driven-selling" style={filterGrid}>
            <div>
              <label style={labelStyle}>Look ahead</label>
              <select name="days" defaultValue={String(days)} style={inputStyle}>
                <option value="1">Tomorrow only</option>
                <option value="3">Next 3 days</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Asset type</label>
              <select name="type" defaultValue={typeFilter} style={inputStyle}>
                <option value="all">All</option>
                <option value="cranes">Cranes only</option>
                <option value="transport">Transport only</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" style={primaryBtn}>
                Apply
              </button>
              <a href="/sales-hub/availability-driven-selling" style={secondaryBtn}>
                Clear
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          {!assetCards.length ? (
            <p style={{ margin: 0, opacity: 0.78 }}>
              No free assets matched the current filters.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {assetCards.map((row) => (
                <div key={`${row.assetType}-${row.asset.id}`} style={assetCard}>
                  <div style={assetTopRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>
                        {row.asset.name || (row.assetType === "crane" ? "Crane" : "Vehicle")}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.76 }}>
                        {row.assetType === "crane" ? "Crane" : "Transport"}
                        {row.asset.reg_number ? ` • ${row.asset.reg_number}` : ""}
                        {row.asset.fleet_number ? ` • ${row.asset.fleet_number}` : ""}
                        {row.asset.vehicle_type ? ` • ${row.asset.vehicle_type}` : ""}
                        {row.asset.capacity ? ` • ${row.asset.capacity}` : ""}
                        {row.asset.status ? ` • ${row.asset.status}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Badge label={`${row.suggestions.length} suggested leads`} />
                      <Badge label={`${days} day view`} />
                    </div>
                  </div>

                  <div style={pitchBox}>{row.pitch}</div>

                  {row.suggestions.length === 0 ? (
                    <div style={{ marginTop: 12, opacity: 0.78 }}>
                      No matching leads yet. Best next move is to add leads for this service area or use dormant recovery to create them.
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                      {row.suggestions.map((item) => (
                        <div key={item.lead.id} style={leadCard}>
                          <div style={leadTopRow}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900 }}>{item.lead.company_name}</div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                                {item.lead.contact_name || "No contact name"}
                                {item.lead.status ? ` • ${item.lead.status}` : ""}
                                {item.lead.phone ? ` • ${item.lead.phone}` : ""}
                                {item.lead.email ? ` • ${item.lead.email}` : ""}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                                Services: {Array.isArray(item.lead.services) && item.lead.services.length
                                  ? item.lead.services.join(", ")
                                  : "Not specified"}
                              </div>
                              <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                                Follow-up: {fmtDate(item.lead.next_follow_up_on)}
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <Badge label={`Rank ${item.score}`} />
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                            <a href={`/sales-hub/leads/${item.lead.id}`} style={secondaryBtn}>
                              Open lead
                            </a>
                            <a href={`/sales-hub/leads/${item.lead.id}/outreach`} style={primaryBtn}>
                              Outreach
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>How to use this page</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={tipRow}>1. Look for free cranes or vehicles over the next few days.</div>
            <div style={tipRow}>2. Open the top suggested leads for that spare capacity.</div>
            <div style={tipRow}>3. Use Outreach Generator to push short-notice availability.</div>
            <div style={tipRow}>4. If there are no good leads, use Dormant Customer Recovery to create them.</div>
          </div>
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return <div style={badgeStyle}>{label}</div>;
}

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 220px) minmax(180px, 220px) auto",
  gap: 12,
  alignItems: "end",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
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

const assetCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const assetTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const pitchBox: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,0,0,0.05)",
  border: "1px solid rgba(0,0,0,0.06)",
  fontWeight: 600,
};

const leadCard: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const leadTopRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const badgeStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(0,0,0,0.06)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 800,
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const tipRow: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 600,
};
