export type CraneLiftPlanDraft = {
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  crane_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  sling_type?: string | null;
  lifting_accessories?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  exclusion_zone_details?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  lift_supervisor?: string | null;
  appointed_person?: string | null;
  crane_operator?: string | null;
  rams_complete?: boolean;
  lift_plan_complete?: boolean;
};

export type TransportLiftPlanDraft = {
  job_summary?: string | null;
  load_description?: string | null;
  load_weight?: number | null;
  lift_radius?: number | null;
  lift_height?: number | null;
  vehicle_configuration?: string | null;
  hiab_configuration?: string | null;
  outrigger_setup?: string | null;
  ground_conditions?: string | null;
  pickup_method?: string | null;
  delivery_method?: string | null;
  route_notes?: string | null;
  access_notes?: string | null;
  exclusion_zone_details?: string | null;
  traffic_management?: string | null;
  load_securing_method?: string | null;
  lifting_accessories?: string | null;
  site_hazards?: string | null;
  control_measures?: string | null;
  ppe_required?: string | null;
  weather_limitations?: string | null;
  emergency_procedures?: string | null;
  method_statement?: string | null;
  risk_assessment?: string | null;
  appointed_person?: string | null;
  lift_supervisor?: string | null;
  operator_name?: string | null;
  rams_complete?: boolean;
  lift_plan_complete?: boolean;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function joinParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => clean(part)).filter(Boolean).join(" ").trim();
}

function extractResponseText(payload: any): string {
  if (!payload) return "";

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const piece of content) {
      const text = piece?.text ?? piece?.output_text ?? "";
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

async function callOpenAI(input: string, maxOutputTokens: number) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_output_tokens: maxOutputTokens,
      input,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || "OpenAI request failed.");
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI returned no text.");
  }

  return text;
}

function parseCraneDraft(text: string): CraneLiftPlanDraft {
  const parsed = JSON.parse(extractJsonObject(text)) as CraneLiftPlanDraft;

  return {
    load_description: clean(parsed.load_description) || null,
    load_weight: numberOrNull(parsed.load_weight),
    lift_radius: numberOrNull(parsed.lift_radius),
    lift_height: numberOrNull(parsed.lift_height),
    crane_configuration: clean(parsed.crane_configuration) || null,
    outrigger_setup: clean(parsed.outrigger_setup) || null,
    ground_conditions: clean(parsed.ground_conditions) || null,
    sling_type: clean(parsed.sling_type) || null,
    lifting_accessories: clean(parsed.lifting_accessories) || null,
    method_statement: clean(parsed.method_statement) || null,
    risk_assessment: clean(parsed.risk_assessment) || null,
    site_hazards: clean(parsed.site_hazards) || null,
    control_measures: clean(parsed.control_measures) || null,
    ppe_required: clean(parsed.ppe_required) || null,
    exclusion_zone_details: clean(parsed.exclusion_zone_details) || null,
    weather_limitations: clean(parsed.weather_limitations) || null,
    emergency_procedures: clean(parsed.emergency_procedures) || null,
    lift_supervisor: clean(parsed.lift_supervisor) || null,
    appointed_person: clean(parsed.appointed_person) || null,
    crane_operator: clean(parsed.crane_operator) || null,
    rams_complete: parsed.rams_complete === true,
    lift_plan_complete: parsed.lift_plan_complete === true,
  };
}

function parseTransportDraft(text: string): TransportLiftPlanDraft {
  const parsed = JSON.parse(extractJsonObject(text)) as TransportLiftPlanDraft;

  return {
    job_summary: clean(parsed.job_summary) || null,
    load_description: clean(parsed.load_description) || null,
    load_weight: numberOrNull(parsed.load_weight),
    lift_radius: numberOrNull(parsed.lift_radius),
    lift_height: numberOrNull(parsed.lift_height),
    vehicle_configuration: clean(parsed.vehicle_configuration) || null,
    hiab_configuration: clean(parsed.hiab_configuration) || null,
    outrigger_setup: clean(parsed.outrigger_setup) || null,
    ground_conditions: clean(parsed.ground_conditions) || null,
    pickup_method: clean(parsed.pickup_method) || null,
    delivery_method: clean(parsed.delivery_method) || null,
    route_notes: clean(parsed.route_notes) || null,
    access_notes: clean(parsed.access_notes) || null,
    exclusion_zone_details: clean(parsed.exclusion_zone_details) || null,
    traffic_management: clean(parsed.traffic_management) || null,
    load_securing_method: clean(parsed.load_securing_method) || null,
    lifting_accessories: clean(parsed.lifting_accessories) || null,
    site_hazards: clean(parsed.site_hazards) || null,
    control_measures: clean(parsed.control_measures) || null,
    ppe_required: clean(parsed.ppe_required) || null,
    weather_limitations: clean(parsed.weather_limitations) || null,
    emergency_procedures: clean(parsed.emergency_procedures) || null,
    method_statement: clean(parsed.method_statement) || null,
    risk_assessment: clean(parsed.risk_assessment) || null,
    appointed_person: clean(parsed.appointed_person) || null,
    lift_supervisor: clean(parsed.lift_supervisor) || null,
    operator_name: clean(parsed.operator_name) || null,
    rams_complete: parsed.rams_complete === true,
    lift_plan_complete: parsed.lift_plan_complete === true,
  };
}

function fallbackCraneDraft(job: any): CraneLiftPlanDraft {
  const clientName = clean(job?.clients?.company_name) || "the client";
  const craneName = joinParts([
    job?.cranes?.name,
    job?.cranes?.make,
    job?.cranes?.model,
    job?.cranes?.capacity ? `(${job.cranes.capacity})` : "",
  ]) || "the allocated crane";
  const operatorName = clean(job?.main_operator?.full_name) || clean(job?.operators?.full_name) || "Allocated operator";
  const liftType = clean(job?.lift_type) || "planned lift";
  const hireType = clean(job?.hire_type) || "crane hire";
  const siteName = clean(job?.site_name) || "site";
  const siteAddress = clean(job?.site_address) || "site address to be confirmed";
  const loadDescription = clean(job?.notes) || `${hireType} for ${clientName}`;

  return {
    load_description: loadDescription,
    load_weight: null,
    lift_radius: null,
    lift_height: null,
    crane_configuration: `${craneName} to be configured in line with manufacturer guidance, site constraints and the agreed lift plan for ${siteName}. Final boom configuration, counterweight and operating radius to be confirmed on site before lifting starts.`,
    outrigger_setup: `Outriggers to be fully deployed where possible on suitable mats or spreader support. Setup area to be checked for underground services, voids, chambers, kerbs and edge risks before load is taken.`,
    ground_conditions: `Ground conditions at ${siteName} / ${siteAddress} to be visually inspected before setup. Crane not to be operated until the appointed person / supervisor is satisfied that the ground is suitable for the planned configuration.`,
    sling_type: `Correct certified slings and lifting accessories to be selected to suit the load, centre of gravity and lifting points.`,
    lifting_accessories: `Certified chains / slings / shackles / lifting beam as required by the load and lift arrangement. Pre-use checks to be completed before lifting.`,
    method_statement: `Attend site, sign in and brief all involved personnel. Confirm load details, lift route, landing area, exclusion zone and communication method. Position ${craneName}, deploy outriggers on suitable support, complete pre-lift checks and test lift if required. Carry out the lift under the direction of the lift supervisor using agreed signals. Land the load safely, release accessories and leave the work area in a safe condition.`,
    risk_assessment: `Main risks include overturning, inadequate ground support, striking overhead services, trapping / crushing, load instability, poor communication, public interface and weather changes. Works must stop if conditions become unsafe or the actual lift differs from the agreed plan.`,
    site_hazards: `Overhead obstructions, underground services, restricted access, moving site traffic, pedestrians, uneven ground, changing weather and pinch points around the load / landing area.`,
    control_measures: `Brief all personnel, use trained staff only, establish an exclusion zone, keep non-essential persons clear, confirm the load weight and lifting points, use suitable accessories, check the setup area, maintain clear communication and stop work if anything changes.`,
    ppe_required: `Minimum PPE: hard hat, hi-vis, safety boots and gloves. Additional PPE to suit site rules and the specific lift.`,
    exclusion_zone_details: `A suitable exclusion zone to be maintained around the crane, suspended load and landing area. Only essential personnel directly involved in the lift to enter the zone.`,
    weather_limitations: `Lifting operations to stop during excessive wind, lightning, poor visibility or any weather condition outside the crane chart / site safe limits.`,
    emergency_procedures: `Stop operations immediately, make the area safe, lower / secure the load if possible, contact emergency services if needed and report the incident to the office / appointed person.`,
    lift_supervisor: clean(job?.main_operator?.full_name) || clean(job?.operators?.full_name) || null,
    appointed_person: "Office / Appointed Person to confirm",
    crane_operator: operatorName,
    rams_complete: false,
    lift_plan_complete: false,
  };
}

function fallbackTransportDraft(job: any, linkedJob?: any): TransportLiftPlanDraft {
  const clientName = clean(job?.clients?.company_name) || "the client";
  const vehicleName = joinParts([
    job?.vehicles?.name,
    job?.vehicles?.vehicle_type,
    job?.vehicles?.reg_number,
  ]) || "allocated HIAB vehicle";
  const operatorName = clean(job?.operators?.full_name) || "Allocated operator";
  const collectionAddress = clean(job?.collection_address) || "collection address to be confirmed";
  const deliveryAddress = clean(job?.delivery_address) || "delivery address to be confirmed";
  const loadDescription = clean(job?.load_description) || clean(linkedJob?.site_name) || `${clean(job?.job_type) || "HIAB"} load for ${clientName}`;

  return {
    job_summary: `HIAB transport / lifting operation for ${clientName} from ${collectionAddress} to ${deliveryAddress}.`,
    load_description: loadDescription,
    load_weight: null,
    lift_radius: null,
    lift_height: null,
    vehicle_configuration: `${vehicleName} to attend with stabilisers / outriggers deployed in line with manufacturer guidance and site constraints. Vehicle position to allow safe loading or unloading without overreaching where reasonably possible.`,
    hiab_configuration: `HIAB to be operated within rated capacity for the working radius and boom configuration. Final setup to be confirmed on arrival after checking access, ground and load details.`,
    outrigger_setup: `Outriggers / stabilisers to be deployed on suitable spreader pads or mats where required. Area to be checked for services, covers, weak ground, edge risks and obstructions before lift starts.`,
    ground_conditions: `Ground at collection and delivery points to be assessed before setup. Work must not proceed until the operator is satisfied the vehicle can be positioned and supported safely.`,
    pickup_method: `Arrive, assess the collection point, establish a safe work area, check the load, confirm lifting points / securing arrangement and load onto the vehicle using the HIAB or agreed loading method.`,
    delivery_method: `Assess the delivery point, establish a safe exclusion zone, position the vehicle safely, deploy stabilisers and unload / place the load using the HIAB in line with the agreed method and site conditions.`,
    route_notes: `Route to be suitable for the vehicle and load dimensions / weight. Any abnormal restrictions, timed access, bridge limits or site booking requirements to be confirmed before departure.`,
    access_notes: `Collection and delivery access to be checked for width, height, ground bearing, slope, overhead obstructions, parked vehicles, pedestrians and public interface risks.`,
    exclusion_zone_details: `A suitable exclusion zone to be maintained around the HIAB, suspended load, slewing area and landing area. Keep members of the public and non-essential site staff clear.`,
    traffic_management: `Use a banksman where visibility or public interface requires it. Cones / barriers / temporary traffic control to be used if the unloading area affects live traffic or pedestrian routes.`,
    load_securing_method: `Load to be secured using suitable rated straps, chains or other securing equipment appropriate to the load. Security of the load to be checked before departure and after any significant journey interruption.`,
    lifting_accessories: `Use suitable certified lifting accessories appropriate to the load and lifting points. All accessories to be visually checked before use.`,
    site_hazards: `Restricted access, overhead services, unstable / sloping ground, vehicle movements, public interface, pinch points, shifting loads, poor landing areas and changing weather conditions.`,
    control_measures: `Use trained competent personnel only, check the route and site access, confirm the load details, position the vehicle safely, deploy outriggers correctly, maintain exclusion zones, use a banksman where needed and stop work if the safe system cannot be followed.`,
    ppe_required: `Minimum PPE: hard hat, hi-vis, safety boots and gloves. Additional PPE to match site rules and the load being handled.`,
    weather_limitations: `Stop HIAB lifting during excessive wind, lightning, poor visibility or any condition that makes the vehicle setup or load control unsafe.`,
    emergency_procedures: `Stop work, make the area safe, lower / secure the load if possible, contact emergency services if required and report the incident to the office immediately.`,
    method_statement: `Attend collection point, complete arrival checks and brief any assisting personnel. Inspect the load, confirm weight / lifting points where available and establish a safe loading area. Load and secure the item, travel to delivery, assess the delivery point, deploy stabilisers, create an exclusion zone and unload / position the load safely. Complete any final checks and leave the area safe.`,
    risk_assessment: `Main risks include overturning, inadequate ground support, striking overhead obstructions, trapping / crushing, load swing, unstable loads, traffic interaction, poor access and public interface. Work must stop if actual conditions differ from the agreed plan.`,
    appointed_person: "Office / Appointed Person to confirm",
    lift_supervisor: operatorName,
    operator_name: operatorName,
    rams_complete: false,
    lift_plan_complete: false,
  };
}

export async function generateCraneLiftPlanDraft(job: any) {
  const fallback = fallbackCraneDraft(job);

  try {
    const prompt = [
      "You are preparing a draft UK crane lift plan and RAMS for AnnS Crane Hire Ltd.",
      "Return only valid JSON. No markdown. No commentary.",
      "Write like an experienced appointed person producing a professional first draft for office review.",
      "Do not invent exact weights, radii or heights unless they are explicitly supplied. Use null for unknown numeric values.",
      'Return JSON with exactly these keys: {"load_description":string|null,"load_weight":number|null,"lift_radius":number|null,"lift_height":number|null,"crane_configuration":string|null,"outrigger_setup":string|null,"ground_conditions":string|null,"sling_type":string|null,"lifting_accessories":string|null,"method_statement":string|null,"risk_assessment":string|null,"site_hazards":string|null,"control_measures":string|null,"ppe_required":string|null,"exclusion_zone_details":string|null,"weather_limitations":string|null,"emergency_procedures":string|null,"lift_supervisor":string|null,"appointed_person":string|null,"crane_operator":string|null,"rams_complete":boolean,"lift_plan_complete":boolean}',
      "Keep the text practical, job-specific where possible, and suitable for editing and approval by office staff.",
      "",
      `Job number: ${clean(job?.job_number) || "Unknown"}`,
      `Client: ${clean(job?.clients?.company_name) || "Unknown"}`,
      `Site name: ${clean(job?.site_name) || "Unknown"}`,
      `Site address: ${clean(job?.site_address) || "Unknown"}`,
      `Contact: ${clean(job?.contact_name) || clean(job?.clients?.contact_name) || "Unknown"}`,
      `Dates: ${clean(job?.start_date) || clean(job?.job_date) || "Unknown"} to ${clean(job?.end_date) || clean(job?.job_date) || "Unknown"}`,
      `Times: ${clean(job?.start_time) || "Unknown"} to ${clean(job?.end_time) || "Unknown"}`,
      `Hire type: ${clean(job?.hire_type) || "Unknown"}`,
      `Lift type: ${clean(job?.lift_type) || "Unknown"}`,
      `Crane: ${joinParts([job?.cranes?.name, job?.cranes?.make, job?.cranes?.model, job?.cranes?.capacity]) || "Unknown"}`,
      `Main operator: ${clean(job?.main_operator?.full_name) || clean(job?.operators?.full_name) || "Unknown"}`,
      `Job notes: ${clean(job?.notes) || "None"}`,
      `Fallback context: ${JSON.stringify(fallback)}`,
    ].join("\n");

    const text = await callOpenAI(prompt, 2200);
    return {
      provider: "openai" as const,
      draft: parseCraneDraft(text),
    };
  } catch {
    return {
      provider: "fallback" as const,
      draft: fallback,
    };
  }
}

export async function generateTransportLiftPlanDraft(job: any, linkedJob?: any) {
  const fallback = fallbackTransportDraft(job, linkedJob);

  try {
    const prompt = [
      "You are preparing a draft UK HIAB transport lift plan and RAMS for AnnS Crane Hire Ltd.",
      "This is for transport jobs where a HIAB / lorry loader may be used for collection, delivery or on-site lifting.",
      "Return only valid JSON. No markdown. No commentary.",
      "Write like an experienced planner producing a strong first draft for office review.",
      "Do not invent exact weights, radii or heights unless they are explicitly supplied. Use null for unknown numeric values.",
      'Return JSON with exactly these keys: {"job_summary":string|null,"load_description":string|null,"load_weight":number|null,"lift_radius":number|null,"lift_height":number|null,"vehicle_configuration":string|null,"hiab_configuration":string|null,"outrigger_setup":string|null,"ground_conditions":string|null,"pickup_method":string|null,"delivery_method":string|null,"route_notes":string|null,"access_notes":string|null,"exclusion_zone_details":string|null,"traffic_management":string|null,"load_securing_method":string|null,"lifting_accessories":string|null,"site_hazards":string|null,"control_measures":string|null,"ppe_required":string|null,"weather_limitations":string|null,"emergency_procedures":string|null,"method_statement":string|null,"risk_assessment":string|null,"appointed_person":string|null,"lift_supervisor":string|null,"operator_name":string|null,"rams_complete":boolean,"lift_plan_complete":boolean}',
      "Keep the text practical, safe and suitable for a HIAB transport operation in the UK.",
      "",
      `Transport number: ${clean(job?.transport_number) || "Unknown"}`,
      `Client: ${clean(job?.clients?.company_name) || "Unknown"}`,
      `Job type: ${clean(job?.job_type) || "Unknown"}`,
      `Collection address: ${clean(job?.collection_address) || "Unknown"}`,
      `Delivery address: ${clean(job?.delivery_address) || "Unknown"}`,
      `Transport date: ${clean(job?.transport_date) || "Unknown"}`,
      `Delivery date: ${clean(job?.delivery_date) || "Unknown"}`,
      `Collection time: ${clean(job?.collection_time) || "Unknown"}`,
      `Delivery time: ${clean(job?.delivery_time) || "Unknown"}`,
      `Load description: ${clean(job?.load_description) || "Unknown"}`,
      `Vehicle: ${joinParts([job?.vehicles?.name, job?.vehicles?.vehicle_type, job?.vehicles?.reg_number]) || "Unknown"}`,
      `Operator: ${clean(job?.operators?.full_name) || "Unknown"}`,
      `Linked crane job context: ${linkedJob ? JSON.stringify(linkedJob) : "None"}`,
      `Transport notes: ${clean(job?.notes) || "None"}`,
      `Fallback context: ${JSON.stringify(fallback)}`,
    ].join("\n");

    const text = await callOpenAI(prompt, 2600);
    return {
      provider: "openai" as const,
      draft: parseTransportDraft(text),
    };
  } catch {
    return {
      provider: "fallback" as const,
      draft: fallback,
    };
  }
}
