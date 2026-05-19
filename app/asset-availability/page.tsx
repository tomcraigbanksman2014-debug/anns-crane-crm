import ClientShell from "../ClientShell";
import AssetAvailabilityBoard from "./AssetAvailabilityBoard";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { normaliseAssetAvailabilityRow, type AssetType } from "../lib/assetAvailability";

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function assetOption(asset: any, type: AssetType) {
  const subtitle = [
    clean(asset?.reg_number),
    clean(asset?.fleet_number),
    clean(asset?.vehicle_type),
    clean(asset?.make),
    clean(asset?.model),
  ]
    .filter(Boolean)
    .join(" • ");

  return {
    id: String(asset?.id ?? ""),
    type,
    name: clean(asset?.name) ?? clean(asset?.reg_number) ?? "Unnamed asset",
    subtitle: subtitle || null,
    status: clean(asset?.status),
  };
}

function isMissingAssetAvailabilityTable(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("asset_availability") || message.includes("does not exist") || message.includes("schema cache");
}

export default async function AssetAvailabilityPage() {
  const supabase = createSupabaseServerClient();
  const today = todayIso();

  const [{ data: cranes, error: cranesError }, { data: vehicles, error: vehiclesError }] = await Promise.all([
    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, make, model, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, status, archived")
      .or("archived.is.null,archived.eq.false")
      .order("name", { ascending: true }),
  ]);

  const craneOptions = (cranes ?? []).map((row: any) => assetOption(row, "crane"));
  const vehicleOptions = (vehicles ?? []).map((row: any) => assetOption(row, "vehicle"));
  const assetLookup = new Map<string, { name: string; subtitle?: string | null }>();
  [...craneOptions, ...vehicleOptions].forEach((asset) => {
    assetLookup.set(`${asset.type}:${asset.id}`, { name: asset.name, subtitle: asset.subtitle });
  });

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("asset_availability")
    .select("id, asset_type, asset_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
    .or(`end_date.gte.${today},end_date.is.null,start_date.gte.${today}`)
    .order("start_date", { ascending: true })
    .limit(500);

  const entries = availabilityError && isMissingAssetAvailabilityTable(availabilityError)
    ? []
    : (availabilityRows ?? []).map((row: any) => {
        const entry = normaliseAssetAvailabilityRow(row);
        const asset = assetLookup.get(`${entry.asset_type}:${entry.asset_id}`);
        return {
          ...entry,
          asset_name: asset?.name ?? null,
          asset_subtitle: asset?.subtitle ?? null,
        };
      });

  const errors = [
    cranesError?.message,
    vehiclesError?.message,
    availabilityError && !isMissingAssetAvailabilityTable(availabilityError) ? availabilityError.message : null,
    availabilityError && isMissingAssetAvailabilityTable(availabilityError) ? "Asset availability table is not available yet. Run the asset availability SQL before using this page." : null,
  ].filter(Boolean);

  return (
    <ClientShell>
      <div style={{ width: "min(1450px, 96vw)", margin: "0 auto" }}>
        <div style={pageCard}>
          <div style={headerRow}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32 }}>Asset Availability</h1>
              <p style={{ marginTop: 6, opacity: 0.8 }}>
                Book and monitor crane and vehicle downtime for maintenance, MOT, service, inspection, repair, breakdowns or other unavailability.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href="/planner" style={secondaryBtn}>Crane planner</a>
              <a href="/transport-planner" style={secondaryBtn}>Transport planner</a>
            </div>
          </div>

          <div style={noticeBox}>
            Planner link: downtime booked here also shows on the crane or transport planner. If <strong>Blocks assignment</strong> is ticked, the planner update route will reject assignments onto that crane/vehicle during the booked dates.
          </div>

          <AssetAvailabilityBoard
            cranes={craneOptions}
            vehicles={vehicleOptions}
            initialEntries={entries}
            loadError={errors.length ? errors.join(" ") : null}
          />
        </div>
      </div>
    </ClientShell>
  );
}

const pageCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.76)",
  color: "#111",
  border: "1px solid rgba(0,0,0,0.12)",
  textDecoration: "none",
  fontWeight: 900,
};

const noticeBox: React.CSSProperties = {
  margin: "14px 0",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.09)",
  border: "1px solid rgba(0,120,255,0.16)",
  lineHeight: 1.45,
};
