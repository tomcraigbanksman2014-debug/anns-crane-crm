import type { EquipmentProfile } from "./ai/equipmentProfiles";

export type TransportLiftPlanContext = {
  transportNumber: string;
  clientName: string;
  clientContact: string;
  collectionAddress: string;
  deliveryAddress: string;
  transportDate: string;
  collectionTime: string;
  deliveryTime: string;
  loadDescription: string;
  transportNotes: string;
  vehicleLabel: string;
  vehicleName: string;
  vehicleRegistration: string;
  vehicleType: string;
  trailerType: string;
  operatorName: string;
  linkedJobNumber: string;
  loadLengthM: number | null;
  loadWidthM: number | null;
  loadHeightM: number | null;
  loadWeightKg: number | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function metres(value: string, unit: string) {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return null;
  if (unit === "mm") return number / 1000;
  if (unit === "cm") return number / 100;
  return number;
}

export function extractLoadMeasurements(description: unknown) {
  const source = text(description).toLowerCase();
  const dimensions: number[] = [];
  const dimensionPattern = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/g;
  for (const match of source.matchAll(dimensionPattern)) {
    const value = metres(match[1], match[2]);
    if (value && dimensions.length < 3) dimensions.push(value);
  }

  const tonnes = source.match(/(\d+(?:[.,]\d+)?)\s*(?:tonnes?|tons?|t)\b/);
  const kilograms = source.match(/(\d+(?:[.,]\d+)?)\s*(?:kilograms?|kgs?|kg)\b/);
  const weightKg = kilograms
    ? Number(kilograms[1].replace(",", "."))
    : tonnes
      ? Number(tonnes[1].replace(",", ".")) * 1000
      : null;

  return {
    loadLengthM: dimensions.length === 3 ? Math.max(...dimensions) : null,
    loadWidthM: dimensions.length === 3
      ? [...dimensions].sort((a, b) => b - a)[1]
      : null,
    loadHeightM: dimensions.length === 3 ? Math.min(...dimensions) : null,
    loadWeightKg: Number.isFinite(weightKg) && Number(weightKg) > 0 ? Number(weightKg) : null,
  };
}

export function buildTransportLiftPlanContext({
  job,
  client,
  vehicle,
  operator,
  linkedJob,
}: {
  job: any;
  client?: any;
  vehicle?: any;
  operator?: any;
  linkedJob?: any;
}): TransportLiftPlanContext {
  const extracted = extractLoadMeasurements(job?.load_description);
  const measurements = {
    ...extracted,
    loadLengthM: Number(job?.load_length_m) || extracted.loadLengthM,
    loadWidthM: Number(job?.load_width_m) || extracted.loadWidthM,
    loadHeightM: Number(job?.load_height_m) || extracted.loadHeightM,
    loadWeightKg: (Number(job?.load_weight_t) || 0) > 0
      ? Number(job.load_weight_t) * 1000
      : extracted.loadWeightKg,
  };
  const vehicleLabel = [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.reg_number,
  ].map(text).filter(Boolean).filter((item, index, values) =>
    values.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index
  ).join(" ");

  return {
    transportNumber: text(job?.transport_number),
    clientName: text(client?.company_name),
    clientContact: text(client?.contact_name),
    collectionAddress: text(job?.collection_address),
    deliveryAddress: text(job?.delivery_address),
    transportDate: text(job?.transport_date),
    collectionTime: text(job?.collection_time),
    deliveryTime: text(job?.delivery_time),
    loadDescription: text(job?.load_description),
    transportNotes: text(job?.notes),
    vehicleLabel,
    vehicleName: text(vehicle?.name),
    vehicleRegistration: text(vehicle?.reg_number),
    vehicleType: text(vehicle?.vehicle_type),
    trailerType: text(vehicle?.trailer_type),
    operatorName: text(operator?.full_name),
    linkedJobNumber: text(linkedJob?.job_number),
    ...measurements,
  };
}

export function defaultTransportLiftPlanValues(
  context: TransportLiftPlanContext,
  profile?: EquipmentProfile | null,
) {
  const collection = context.collectionAddress || "the agreed collection point";
  const delivery = context.deliveryAddress || "the agreed delivery point";
  const setup = profile?.setupOptions?.[0] ?? null;
  const vehicleConfiguration = [
    context.vehicleLabel,
    context.trailerType ? `Trailer: ${context.trailerType}` : null,
  ].filter(Boolean).join(". ");
  const load = context.loadDescription || "the load described on the transport job";

  return {
    job_summary: [
      context.transportNumber ? `Transport ${context.transportNumber}` : "HIAB transport operation",
      context.clientName ? `for ${context.clientName}` : null,
      `from ${collection} to ${delivery}`,
    ].filter(Boolean).join(" "),
    load_description: context.loadDescription,
    load_weight: context.loadWeightKg,
    vehicle_configuration: vehicleConfiguration,
    hiab_configuration: setup?.configurationNote || profile?.configurationNote || profile?.title || "",
    outrigger_setup: setup?.outriggerNote || profile?.outriggersNote || "",
    pickup_method: `Position the HIAB vehicle at ${collection}, establish the controlled lifting area, deploy the supports in the selected verified position and lift ${load} from the agreed pick point.`,
    delivery_method: `Position the HIAB vehicle at ${delivery}, re-establish the controlled lifting area, deploy the supports in the selected verified position and place ${load} at the agreed landing point.`,
    route_notes: [
      `${collection} to ${delivery}.`,
      context.transportNotes,
    ].filter(Boolean).join(" "),
    access_notes: "Confirm vehicle access, positioning space, overhead clearance, support deployment area and the landing area before the operation starts.",
    exclusion_zone_details: "Establish and maintain a controlled exclusion zone around the vehicle, supports, slewing area, suspended load, travel path and landing point.",
    traffic_management: "Segregate the lifting area from vehicles and pedestrians. Use barriers, cones and a designated banksman where the operation interfaces with site or public traffic.",
    load_securing_method: "Use suitable rated restraints for the load and vehicle. Check the securing arrangement before departure and after any repositioning.",
    ppe_required: "Safety helmet, high-visibility clothing, safety footwear and task-appropriate gloves. Add any site-specific PPE identified at the briefing.",
    weather_limitations: profile?.weatherNote || "Do not lift in unsafe wind, lightning, heavy rain or poor visibility. Apply the manufacturer and site limits for the selected configuration.",
    emergency_procedures: "Stop the operation, make the load safe where possible, maintain the exclusion zone and follow the site emergency arrangements. Do not resume until the appointed person or lift supervisor confirms it is safe.",
    appointed_person: "Shaun Robinson",
    operator_name: context.operatorName,
  };
}
