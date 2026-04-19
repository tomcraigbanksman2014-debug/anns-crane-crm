import { getPrimaryCraneContext, matchCraneJobEquipmentProfile, matchTransportJobEquipmentProfile } from "./matchEquipmentProfile";
import type { EquipmentProfile } from "./equipmentProfiles";

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

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

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

function equipmentHeadline(profile: EquipmentProfile | null) {
  if (!profile) return "";
  const parts = [profile.title];
  if (profile.maxCapacityKg) parts.push(`max capacity ${profile.maxCapacityKg.toLocaleString()} kg`);
  if (profile.maxBoomLengthM) parts.push(`boom ${profile.maxBoomLengthM} m`);
  else if (profile.maxHydraulicOutreachM) parts.push(`hydraulic outreach ${profile.maxHydraulicOutreachM} m`);
  if (profile.maxJibOutreachM) parts.push(`jib / max outreach ${profile.maxJibOutreachM} m`);
  if (profile.maxRadiusM) parts.push(`radius approx ${profile.maxRadiusM} m`);
  return parts.join(", ");
}

function equipmentWarnings(profile: EquipmentProfile | null) {
  if (!profile) {
    return [
      "Final capacity must be checked against the correct manufacturer chart, actual setup, radius and accessories before the lift is approved.",
    ];
  }
  return profile.warnings;
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

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    if (hasText(value)) return String(value).trim();
  }
  return "";
}

function defaultCraneConfiguration(profile: EquipmentProfile | null) {
  if (!profile) return "Crane configuration to be confirmed from the current manufacturer chart, actual radius, load, accessories and site setup before lifting.";
  return firstNonEmpty(
    profile.configurationNote,
    `${profile.title} to be configured strictly to the manufacturer chart and the planned radius / duty for this lift.`
  );
}

function defaultOutriggerSetup(profile: EquipmentProfile | null) {
  if (!profile) return "Outriggers / stabilisers to be deployed on suitable mats or pads, on firm level ground, and the exact setup confirmed before the load is taken.";
  return firstNonEmpty(
    profile.outriggersNote,
    `${profile.title} outriggers / stabilisers to be set to the checked working position on suitable mats / pads before lifting.`
  );
}

function defaultWeatherLimitations(profile: EquipmentProfile | null) {
  if (!profile) return "Lift not to proceed in unsafe wind, lightning, poor visibility or weather conditions affecting stability, control or ground bearing. Final limits to be checked against the current chart and site risk assessment.";
  return firstNonEmpty(
    profile.weatherNote,
    "Lift not to proceed in unsafe wind, lightning, poor visibility or weather conditions affecting stability, control or ground bearing. Final limits to be checked against the current chart and site risk assessment."
  );
}

function craneNameFromJob(job: any, profile: EquipmentProfile | null) {
  const primary = getPrimaryCraneContext(job);
  const crane = primary.crane;
  return joinParts([
    crane?.name,
    crane?.make,
    crane?.model,
    crane?.capacity,
  ]) || profile?.title || "the allocated crane";
}

function operatorNameFromJob(job: any) {
  const primary = getPrimaryCraneContext(job);
  const mainOperator = one(job?.main_operator);
  return clean(mainOperator?.full_name) || clean(primary.operator?.full_name) || null;
}

function appointedPersonFromJob(job: any) {
  return clean(job?.appointed_person_name) || clean(job?.appointed_person) || null;
}

function siteNameFromJob(job: any) {
  return clean(job?.site_name) || "site";
}

function siteAddressFromJob(job: any) {
  return clean(job?.site_address) || "site address to be confirmed";
}

function liftTypeFromJob(job: any) {
  return clean(job?.lift_type) || "planned lift";
}

function machineSpecificSetupText(profile: EquipmentProfile | null) {
  switch (profile?.id) {
    case "ak46-6000":
      return "Use the AK 46/6000 in the planned boom / jib arrangement only after checking the working range crane-operation chart for the intended radius and load. Do not use basket / MEWP mode for normal crane lifting operations.";
    case "gmk4080-1":
      return "Use the GMK4080-1 only in the checked boom length, counterweight and outrigger duty. Confirm the exact chart, carrier setup and level condition before lifting.";
    case "spx532":
      return "The SPX532 must be used in the correct stability zone and boom / jib chart for the selected outrigger geometry. Reduced or asymmetric outrigger setups can materially reduce capacity or remove lifting capacity in some zones.";
    case "mtk-35":
      return "The MTK35 must be used in the planned boom / jib arrangement only after checking the current duty chart. Published capacities in the supplied sheet are based on fully extended outriggers unless a separately checked reduced-outrigger duty is available.";
    default:
      return defaultCraneConfiguration(profile);
  }
}

function machineSpecificMethodStatement(job: any, profile: EquipmentProfile | null) {
  const craneName = craneNameFromJob(job, profile);
  const siteName = siteNameFromJob(job);
  const siteAddress = siteAddressFromJob(job);
  const liftType = liftTypeFromJob(job);
  const machineSetup = machineSpecificSetupText(profile);
  const warnings = equipmentWarnings(profile).join(" ");

  return [
    `Attend site at ${siteName}${siteAddress ? `, ${siteAddress}` : ""} and complete the pre-lift briefing with all involved personnel before lifting starts.`,
    `Establish the exclusion zone, confirm the load details, lift route, landing area and communication method for the ${liftType}.`,
    `Position ${craneName} in the planned location, deploy outriggers / stabilisers on suitable mats or pads and confirm level, support and final setup before load is taken.`,
    machineSetup,
    `Inspect all lifting accessories, connect the load using the planned certified arrangement, complete a controlled test lift if required and then carry out the lift under the direction of the lift supervisor using the agreed signalling method.`,
    `Land the load safely, remove lifting accessories, de-rig the crane in accordance with the manufacturer instructions and leave the work area safe and tidy.`,
    warnings,
  ].join(" ");
}

function machineSpecificGroundConditions(job: any, profile: EquipmentProfile | null) {
  const siteName = siteNameFromJob(job);
  const siteAddress = siteAddressFromJob(job);
  const profileText = profile?.id === "spx532"
    ? "Ground, support pads and local level must suit the selected outrigger / stability position."
    : "Ground must be firm, level and suitable for the planned outrigger / stabiliser reactions.";

  return `${profileText} The setup area at ${siteName}${siteAddress ? `, ${siteAddress}` : ""} must be checked for soft ground, basements, chambers, edge risks, underground services and any other condition that could affect support.`;
}

function machineSpecificSiteHazards(job: any, profile: EquipmentProfile | null) {
  const base = `Potential hazards include overhead obstructions, underground services, restricted access / egress, proximity to public areas, adverse weather, uneven or soft ground and glass handling risks.`;
  if (profile?.id === "spx532") {
    return `${base} Additional hazard: selecting the wrong stability / outrigger zone for the planned Jekko duty.`;
  }
  if (profile?.id === "gmk4080-1") {
    return `${base} Additional hazard: incorrect counterweight, boom duty or outrigger extension for the GMK4080-1.`;
  }
  return base;
}

function machineSpecificControlMeasures(job: any, profile: EquipmentProfile | null) {
  const craneName = craneNameFromJob(job, profile);
  const profileSpecific = profile?.id === "spx532"
    ? "Confirm the selected stability / outrigger zone and use the matching Jekko chart before the lift proceeds."
    : profile?.id === "gmk4080-1"
    ? "Confirm boom length, counterweight, outrigger extension and the applicable GMK4080-1 chart before lifting."
    : profile?.id === "ak46-6000"
    ? "Use the crane-operation chart only for crane lifting and do not mix basket / platform guidance into the lifting duty."
    : profile?.id === "mtk-35"
    ? "Use fully extended outriggers unless a separately checked reduced-outrigger duty is available and approved."
    : "Check the current manufacturer chart and support arrangement before lifting.";

  return [
    `Establish and maintain a clear exclusion zone around ${craneName}, the slewing area, the suspended load path and the landing zone.`,
    `Use trained personnel only, maintain agreed signalling / radio communication and stop the lift immediately if conditions change or visibility is lost.`,
    `Verify load weight, lifting points, accessories, hook block weight, radius, support arrangement and ground suitability before taking the load.`,
    profileSpecific,
  ].join(" ");
}

function machineSpecificRiskAssessment(job: any, profile: EquipmentProfile | null) {
  const profileSpecific = profile?.id === "spx532"
    ? "incorrect stability-zone selection"
    : profile?.id === "gmk4080-1"
    ? "incorrect counterweight / duty selection"
    : profile?.id === "ak46-6000"
    ? "incorrect crane-operation working range selection"
    : profile?.id === "mtk-35"
    ? "using a reduced-outrigger duty without separate chart confirmation"
    : "incorrect chart or setup selection";

  return `Main risks include load drop due to sling / accessory failure, crane instability due to poor ground or incorrect setup, collision with structures or personnel, ${profileSpecific}, glass breakage, weather impacts and unauthorised access to the exclusion zone. Final capacity and configuration must be checked against the current applicable chart before approval.`;
}

function machineSpecificEmergency(job: any, profile: EquipmentProfile | null) {
  const craneName = craneNameFromJob(job, profile);
  return `Stop work immediately if unsafe conditions develop, an equipment fault occurs or the load cannot be controlled. Make ${craneName} and the load safe where possible, isolate the area, alert site management and emergency services if required, and follow site-specific emergency procedures for injury, instability, contact with services or crane failure.`;
}

function machineSpecificPpe() {
  return "Hard hat, hi-vis clothing, gloves, safety boots and eye protection. Additional PPE such as cut-resistant gloves to be used where glass handling or sharp-edge work requires it.";
}

function machineSpecificExclusionZone(job: any, profile: EquipmentProfile | null) {
  const craneName = craneNameFromJob(job, profile);
  return `Barrier off the lifting area, slewing area and landing zone for ${craneName}. Only authorised personnel are permitted inside the exclusion zone while the crane is being set up, the load is suspended or the lift is being completed.`;
}

function machineSpecificNarrative(job: any, profile: EquipmentProfile | null): CraneLiftPlanDraft {
  const operatorName = operatorNameFromJob(job);
  const appointedPerson = appointedPersonFromJob(job);

  return {
    crane_configuration: defaultCraneConfiguration(profile),
    outrigger_setup: defaultOutriggerSetup(profile),
    ground_conditions: machineSpecificGroundConditions(job, profile),
    method_statement: machineSpecificMethodStatement(job, profile),
    risk_assessment: machineSpecificRiskAssessment(job, profile),
    site_hazards: machineSpecificSiteHazards(job, profile),
    control_measures: machineSpecificControlMeasures(job, profile),
    ppe_required: machineSpecificPpe(),
    exclusion_zone_details: machineSpecificExclusionZone(job, profile),
    weather_limitations: defaultWeatherLimitations(profile),
    emergency_procedures: machineSpecificEmergency(job, profile),
    lift_supervisor: operatorName,
    appointed_person: appointedPerson,
    crane_operator: operatorName,
  };
}

function applyCraneDefaults(draft: CraneLiftPlanDraft, job: any, profile: EquipmentProfile | null): CraneLiftPlanDraft {
  return {
    ...draft,
    ...machineSpecificNarrative(job, profile),
  };
}

function applyTransportDefaults(draft: TransportLiftPlanDraft, profile: EquipmentProfile | null): TransportLiftPlanDraft {
  const config = defaultCraneConfiguration(profile);
  return {
    ...draft,
    vehicle_configuration: hasText(draft.vehicle_configuration) ? String(draft.vehicle_configuration).trim() : config,
    hiab_configuration: hasText(draft.hiab_configuration) ? String(draft.hiab_configuration).trim() : config,
    outrigger_setup: hasText(draft.outrigger_setup) ? String(draft.outrigger_setup).trim() : defaultOutriggerSetup(profile),
    weather_limitations: hasText(draft.weather_limitations) ? String(draft.weather_limitations).trim() : defaultWeatherLimitations(profile),
  };
}

function fallbackCraneDraft(job: any, profile: EquipmentProfile | null): CraneLiftPlanDraft {
  const client = one(job?.clients);
  const primary = getPrimaryCraneContext(job);
  const crane = primary.crane;
  const operator = primary.operator ?? one(job?.operators);
  const mainOperator = one(job?.main_operator);
  const clientName = clean(client?.company_name) || "the client";
  const craneName = joinParts([
    crane?.name,
    crane?.make,
    crane?.model,
    crane?.capacity ? `(${crane.capacity})` : "",
  ]) || profile?.title || "the allocated crane";
  const operatorName = clean(mainOperator?.full_name) || clean(operator?.full_name) || "Allocated operator";
  const hireType = clean(job?.hire_type) || "crane hire";
  const loadDescription = clean(job?.notes) || `${hireType} for ${clientName}`;

  return {
    load_description: loadDescription,
    load_weight: null,
    lift_radius: null,
    lift_height: null,
    sling_type: `Correct certified slings and lifting accessories to be selected to suit the load, centre of gravity and lifting points.`,
    lifting_accessories: `Certified chains / slings / shackles / lifting beam as required by the load and lift arrangement. Pre-use checks to be completed before lifting.`,
    lift_supervisor: operatorName,
    appointed_person: appointedPersonFromJob(job),
    crane_operator: operatorName,
    rams_complete: false,
    lift_plan_complete: false,
  };
}

function fallbackTransportDraft(job: any, linkedJob: any, profile: EquipmentProfile | null): TransportLiftPlanDraft {
  const client = one(job?.clients);
  const vehicle = one(job?.vehicles);
  const operator = one(job?.operators);
  const clientName = clean(client?.company_name) || "the client";
  const operatorName = clean(operator?.full_name) || "Allocated operator";
  const vehicleName = joinParts([vehicle?.name, vehicle?.vehicle_type, vehicle?.reg_number]) || profile?.title || "allocated HIAB vehicle";
  const collection = clean(job?.collection_address) || "collection address to be confirmed";
  const delivery = clean(job?.delivery_address) || "delivery address to be confirmed";
  const loadDescription = clean(job?.load_description) || clean(linkedJob?.notes) || `HIAB / transport work for ${clientName}`;
  const routeDate = clean(job?.transport_date) || "planned date";
  const machineFacts = equipmentHeadline(profile);
  const warningText = equipmentWarnings(profile).join(" ");

  return {
    job_summary: `Transport / HIAB movement for ${clientName} from ${collection} to ${delivery} on ${routeDate}. ${machineFacts}`,
    load_description: loadDescription,
    load_weight: null,
    lift_radius: null,
    lift_height: null,
    vehicle_configuration: `${vehicleName} to be positioned to allow safe pickup / set-down, suitable support area and safe traffic interface. Vehicle / loader crane setup to follow manufacturer guidance and site conditions.`,
    hiab_configuration: `${profile?.title || vehicleName} to be used within the correct chart, extension stage and stabiliser arrangement for the planned lift. Final configuration to be confirmed on site before loading or unloading.`,
    outrigger_setup: `${profile?.outriggersNote || "Deploy stabilisers / outriggers to the required working position on suitable support pads or mats."} Ensure the vehicle is level and support area is suitable before taking the load.`,
    ground_conditions: `Check collection and delivery ground conditions for voids, basements, soft ground, kerbs, service covers, edge risks and slope. HIAB work not to proceed until the setup area is confirmed suitable.`,
    pickup_method: `Arrive at collection point, brief involved personnel, inspect load and lifting points, position ${vehicleName}, deploy outriggers, attach certified lifting gear, complete a controlled pickup and secure the load for transport.`,
    delivery_method: `Assess delivery area, traffic interface and landing zone. Position ${vehicleName} safely, deploy outriggers, release transport restraints in a controlled manner, lift and place the load using agreed signals and make the load safe at final position.`,
    route_notes: `Travel route to be checked for restrictions, access, abnormal dimensions if applicable, bridge / weight issues and safe arrival / departure arrangements.`,
    access_notes: `Confirm access width, turning space, overhead obstructions, service lines, parked vehicles, pedestrians and ground bearing suitability at both collection and delivery locations.`,
    exclusion_zone_details: `Establish a clear exclusion zone around the HIAB setup, slewing area, suspended load path and landing zone. No unauthorised personnel to enter during loading or unloading.`,
    traffic_management: `Use banksman / traffic marshal where required. Manage reversing, public interface and local traffic hazards in line with site conditions.`,
    load_securing_method: `Load to be secured using suitable rated restraints, edge protection and transport securing method appropriate to the item being moved. Re-check restraints before travel and after arrival if required.`,
    lifting_accessories: `Use certified chains / slings / shackles / lifting beam or proprietary attachments as required by the load and lifting points. Complete pre-use checks before the lift.`,
    site_hazards: `Risks include vehicle instability, inadequate outrigger support, load swing, trapping / crushing, overhead obstructions, public interface, traffic movement, unsuitable loading area and incorrect restraint release. ${warningText}`,
    control_measures: `Use trained personnel only, confirm load weight and lifting points, check chart and stabiliser setup, use mats / pads, establish exclusion zone, use agreed communication and stop work if weather, access or setup becomes unsafe.`,
    ppe_required: `Hard hat, hi-vis, gloves, safety boots and any additional site-specific PPE required for collection or delivery points.`,
    weather_limitations: `Do not proceed if wind, lightning, poor visibility or weather conditions make load control, vehicle stability or site access unsafe.`,
    emergency_procedures: `Stop work immediately if unsafe conditions develop. Make the load safe where possible, isolate the area, inform site management and follow emergency arrangements for injury, service strike, instability or equipment failure.`,
    method_statement: `Complete pre-start checks, brief personnel, confirm load details and lifting sequence, position ${vehicleName}, deploy outriggers on suitable support, complete controlled loading, secure the load, travel safely to site, then unload / place using agreed signals and an exclusion zone. ${warningText}`,
    risk_assessment: `Main risks include overturning due to poor support or overreach, suspended load movement, trapping / crushing, overhead service contact, poor communication, unsecured load, road risks between sites and unsafe unloading area. ${warningText}`,
    appointed_person: null,
    lift_supervisor: operatorName,
    operator_name: operatorName,
    rams_complete: false,
    lift_plan_complete: false,
  };
}

function buildCranePrompt(job: any, profile: EquipmentProfile | null) {
  const client = one(job?.clients);
  const primary = getPrimaryCraneContext(job);
  const crane = primary.crane;
  const operator = primary.operator ?? one(job?.operators);
  const mainOperator = one(job?.main_operator);

  return `You are helping draft a crane lift plan and RAMS document for an internal crane hire CRM.
Return ONLY valid JSON with these keys:
load_description, load_weight, lift_radius, lift_height, crane_configuration, outrigger_setup, ground_conditions, sling_type, lifting_accessories, method_statement, risk_assessment, site_hazards, control_measures, ppe_required, exclusion_zone_details, weather_limitations, emergency_procedures, lift_supervisor, appointed_person, crane_operator, rams_complete, lift_plan_complete.

Rules:
- This is a DRAFT only. Never say the lift is approved or fully checked.
- Do not invent exact load weights, radius or height if not provided. Use null for unknown numbers.
- Reference the selected machine profile if one is provided.
- Make it practical and specific for UK lifting operations.
- Always include a clear warning that final capacity must be checked against the current manufacturer chart, actual setup, accessories and site conditions before approval.
- Keep rams_complete and lift_plan_complete false.
- NEVER refer to a different crane model than the selected crane / machine profile.

Job data:
${JSON.stringify({
  job_number: job?.job_number ?? null,
  client: client?.company_name ?? null,
  site_name: job?.site_name ?? null,
  site_address: job?.site_address ?? null,
  contact_name: job?.contact_name ?? null,
  contact_phone: job?.contact_phone ?? null,
  start_date: job?.start_date ?? job?.job_date ?? null,
  end_date: job?.end_date ?? job?.job_date ?? null,
  start_time: job?.start_time ?? null,
  end_time: job?.end_time ?? null,
  hire_type: job?.hire_type ?? null,
  lift_type: job?.lift_type ?? null,
  notes: job?.notes ?? null,
  crane: crane ?? null,
  operator: mainOperator ?? operator ?? null,
}, null, 2)}

Selected machine profile:
${JSON.stringify(profile, null, 2)}`;
}

function buildTransportPrompt(job: any, linkedJob: any, profile: EquipmentProfile | null) {
  const client = one(job?.clients);
  const vehicle = one(job?.vehicles);
  const operator = one(job?.operators);

  return `You are helping draft a transport / HIAB lift plan and RAMS document for an internal crane hire CRM.
Return ONLY valid JSON with these keys:
job_summary, load_description, load_weight, lift_radius, lift_height, vehicle_configuration, hiab_configuration, outrigger_setup, ground_conditions, pickup_method, delivery_method, route_notes, access_notes, exclusion_zone_details, traffic_management, load_securing_method, lifting_accessories, site_hazards, control_measures, ppe_required, weather_limitations, emergency_procedures, method_statement, risk_assessment, appointed_person, lift_supervisor, operator_name, rams_complete, lift_plan_complete.

Rules:
- This is a DRAFT only. Never say the lift is approved or fully checked.
- Do not invent exact load weights, radius or height if not provided. Use null for unknown numbers.
- Use the selected HIAB / machine profile if available.
- Include loading, travel and unloading risks.
- Always include a clear warning that final capacity must be checked against the current manufacturer chart, actual stabiliser setup, accessories and site conditions before approval.
- Keep rams_complete and lift_plan_complete false.

Transport job data:
${JSON.stringify({
  transport_number: job?.transport_number ?? null,
  client: client?.company_name ?? null,
  job_type: job?.job_type ?? null,
  collection_address: job?.collection_address ?? null,
  delivery_address: job?.delivery_address ?? null,
  transport_date: job?.transport_date ?? null,
  delivery_date: job?.delivery_date ?? null,
  collection_time: job?.collection_time ?? null,
  delivery_time: job?.delivery_time ?? null,
  load_description: job?.load_description ?? null,
  notes: job?.notes ?? null,
  vehicle: vehicle ?? null,
  operator: operator ?? null,
  linked_job: linkedJob ?? null,
}, null, 2)}

Selected machine profile:
${JSON.stringify(profile, null, 2)}`;
}

export async function generateCraneLiftPlanDraft(job: any) {
  const profile = matchCraneJobEquipmentProfile(job);

  try {
    const text = await callOpenAI(buildCranePrompt(job, profile), 2200);
    return {
      provider: "openai" as const,
      draft: applyCraneDefaults(parseCraneDraft(text), job, profile),
      equipmentProfile: profile,
    };
  } catch {
    return {
      provider: "fallback" as const,
      draft: applyCraneDefaults(fallbackCraneDraft(job, profile), job, profile),
      equipmentProfile: profile,
    };
  }
}

export async function generateTransportLiftPlanDraft(job: any, linkedJob: any = null) {
  const profile = matchTransportJobEquipmentProfile(job, linkedJob);

  try {
    const text = await callOpenAI(buildTransportPrompt(job, linkedJob, profile), 2600);
    return {
      provider: "openai" as const,
      draft: applyTransportDefaults(parseTransportDraft(text), profile),
      equipmentProfile: profile,
    };
  } catch {
    return {
      provider: "fallback" as const,
      draft: applyTransportDefaults(fallbackTransportDraft(job, linkedJob, profile), profile),
      equipmentProfile: profile,
    };
  }
}
