import ClientShell from "../../ClientShell";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { getAccessContext } from "../../lib/access";
import { isMasterAdminEmail } from "../../lib/admin";
import { redirect } from "next/navigation";
import AssetLocationManager from "./AssetLocationManager";

function optionLabel(parts: Array<string | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(" • ");
}

function buildJobLabel(job: any) {
  return optionLabel([
    job?.job_number ? `Job #${job.job_number}` : "Job",
    job?.site_name,
    job?.clients?.company_name,
  ]) || String(job?.id ?? "Job");
}

function buildTransportJobLabel(job: any) {
  return optionLabel([
    job?.transport_number ? `Transport #${job.transport_number}` : "Transport job",
    job?.collection_address,
    job?.delivery_address,
    job?.clients?.company_name,
  ]) || String(job?.id ?? "Transport job");
}

function errorMessage(error: any) {
  return error?.message ? String(error.message) : "";
}

export default async function AssetLocationsPage() {
  const access = await getAccessContext();
  const email = String(access.user?.email ?? "").trim().toLowerCase();

  if (!access.user) redirect("/login?next=/equipment/locations");
  if (!isMasterAdminEmail(email)) redirect("/");

  const admin = createSupabaseAdminClient();

  const [
    eventsResult,
    equipmentResult,
    vehiclesResult,
    cranesResult,
    jobsResult,
    transportJobsResult,
    operatorsResult,
  ] = await Promise.all([
    admin
      .from("asset_location_events")
      .select("*")
      .order("event_time", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(800),
    admin
      .from("equipment")
      .select("id, name, asset_number, type, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    admin
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    admin
      .from("cranes")
      .select("id, name, reg_number, fleet_number, capacity, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    admin
      .from("jobs")
      .select("id, job_number, site_name, clients:client_id(company_name)")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(180),
    admin
      .from("transport_jobs")
      .select("id, transport_number, collection_address, delivery_address, clients:client_id(company_name)")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(180),
    admin
      .from("operators")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const setupError = errorMessage(eventsResult.error);

  const equipmentOptions = (equipmentResult.data ?? []).map((item: any) => ({
    value: String(item.id),
    label: optionLabel([item.name, item.asset_number, item.type]) || "Equipment",
  }));

  const vehicleOptions = (vehiclesResult.data ?? []).map((item: any) => ({
    value: String(item.id),
    label: optionLabel([item.name, item.reg_number, item.vehicle_type]) || "Vehicle",
  }));

  const craneOptions = (cranesResult.data ?? []).map((item: any) => ({
    value: String(item.id),
    label: optionLabel([item.name, item.reg_number, item.fleet_number, item.capacity]) || "Crane",
  }));

  const jobOptions = (jobsResult.data ?? []).map((job: any) => ({
    value: String(job.id),
    label: buildJobLabel(job),
  }));

  const transportJobOptions = (transportJobsResult.data ?? []).map((job: any) => ({
    value: String(job.id),
    label: buildTransportJobLabel(job),
  }));

  const operatorOptions = (operatorsResult.data ?? []).map((operator: any) => ({
    value: String(operator.id),
    label: String(operator.full_name ?? "Operator"),
  }));

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 96vw)", margin: "0 auto" }}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Asset Locations</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Masteradmin-only testing page for tracking where trailers, mats, cranes, vehicles and hired-in assets were last left.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/equipment" style={secondaryBtnStyle}>Equipment</a>
            <a href="/vehicles" style={secondaryBtnStyle}>Vehicles</a>
            <a href="/cranes" style={secondaryBtnStyle}>Cranes</a>
          </div>
        </div>

        <div style={noticeBoxStyle}>
          This page is isolated from planners and live job logic for safety. It records last-known asset locations only — not live GPS tracking.
        </div>

        {setupError ? (
          <div style={errorBoxStyle}>
            {setupError}. Run <strong>sql/asset_location_events.sql</strong> in Supabase before using this page.
          </div>
        ) : null}

        <AssetLocationManager
          initialEvents={eventsResult.data ?? []}
          equipmentOptions={equipmentOptions}
          vehicleOptions={vehicleOptions}
          craneOptions={craneOptions}
          jobOptions={jobOptions}
          transportJobOptions={transportJobOptions}
          operatorOptions={operatorOptions}
        />
      </div>
    </ClientShell>
  );
}

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 12,
};

const noticeBoxStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(0,120,255,0.10)",
  border: "1px solid rgba(0,120,255,0.18)",
  fontWeight: 800,
};

const errorBoxStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,0,0,0.10)",
  border: "1px solid rgba(255,0,0,0.20)",
  fontWeight: 800,
};

const secondaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.65)",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
  border: "1px solid rgba(0,0,0,0.12)",
};
