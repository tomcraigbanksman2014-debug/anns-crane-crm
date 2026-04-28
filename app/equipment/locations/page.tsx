import ClientShell from "../../ClientShell";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { getAccessContext } from "../../lib/access";
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

function jobPlannerItem(job: any) {
  const startDate = String(job?.start_date ?? job?.job_date ?? "").trim();
  const endDate = String(job?.end_date ?? job?.start_date ?? job?.job_date ?? "").trim();
  const clientName = String(job?.clients?.company_name ?? "").trim();
  const siteName = String(job?.site_name ?? "").trim();
  const siteAddress = String(job?.site_address ?? "").trim();
  const craneName = optionLabel([job?.cranes?.name, job?.cranes?.reg_number]);
  const operatorName = String(job?.operators?.full_name ?? "").trim();

  return {
    id: String(job?.id ?? ""),
    kind: "crane" as const,
    number: String(job?.job_number ?? "Job"),
    title: buildJobLabel(job),
    clientName,
    siteName,
    address: siteAddress,
    startDate,
    endDate,
    startTime: String(job?.start_time ?? "").trim(),
    endTime: String(job?.end_time ?? "").trim(),
    status: String(job?.status ?? "").trim(),
    primaryAsset: craneName,
    operatorName,
  };
}

function transportPlannerItem(job: any) {
  const collectionDate = String(job?.transport_date ?? "").trim();
  const deliveryDate = String(job?.delivery_date ?? job?.transport_date ?? "").trim();
  const clientName = String(job?.clients?.company_name ?? "").trim();
  const vehicleName = optionLabel([job?.vehicles?.name, job?.vehicles?.reg_number]);
  const operatorName = String(job?.operators?.full_name ?? "").trim();

  return {
    id: String(job?.id ?? ""),
    kind: "transport" as const,
    number: String(job?.transport_number ?? "Transport"),
    title: buildTransportJobLabel(job),
    clientName,
    siteName: "",
    address: optionLabel([job?.collection_address, job?.delivery_address]),
    collectionAddress: String(job?.collection_address ?? "").trim(),
    deliveryAddress: String(job?.delivery_address ?? "").trim(),
    startDate: collectionDate,
    endDate: deliveryDate,
    startTime: String(job?.collection_time ?? "").trim(),
    endTime: String(job?.delivery_time ?? "").trim(),
    status: String(job?.status ?? "").trim(),
    primaryAsset: vehicleName,
    operatorName,
  };
}

export default async function AssetLocationsPage() {
  const access = await getAccessContext();

  if (!access.user) redirect("/login?next=/equipment/locations");

  if (access.role !== "admin" && access.role !== "staff") {
    redirect(access.role === "operator" ? "/operator/jobs" : "/");
  }

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
      .select(`
        id,
        job_number,
        site_name,
        site_address,
        start_date,
        end_date,
        job_date,
        start_time,
        end_time,
        status,
        archived,
        clients:client_id(company_name),
        cranes:crane_id(id, name, reg_number),
        operators:operator_id(id, full_name)
      `)
      .eq("archived", false)
      .order("start_date", { ascending: true })
      .order("job_date", { ascending: true })
      .limit(260),
    admin
      .from("transport_jobs")
      .select(`
        id,
        transport_number,
        transport_date,
        collection_time,
        delivery_date,
        delivery_time,
        collection_address,
        delivery_address,
        status,
        archived,
        clients:client_id(company_name),
        vehicles:vehicle_id(id, name, reg_number),
        operators:operator_id(id, full_name)
      `)
      .eq("archived", false)
      .order("transport_date", { ascending: true })
      .order("collection_time", { ascending: true })
      .limit(260),
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

  const plannerJobs = (jobsResult.data ?? [])
    .map(jobPlannerItem)
    .filter((row) => row.id);

  const plannerTransportJobs = (transportJobsResult.data ?? [])
    .map(transportPlannerItem)
    .filter((row) => row.id);

  return (
    <ClientShell>
      <div style={{ width: "min(1500px, 96vw)", margin: "0 auto" }}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Asset Locations</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Office asset register for tracking where trailers, mats, cranes, vehicles and hired-in assets were last left.
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
          plannerJobs={plannerJobs}
          plannerTransportJobs={plannerTransportJobs}
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
