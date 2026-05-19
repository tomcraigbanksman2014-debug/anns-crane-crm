import { EQUIPMENT_PROFILES, type EquipmentProfile } from "./equipmentProfiles";
import { buildSpecSheetEquipmentProfile } from "./specSheetProfiles";

function toText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function flatten(value: unknown): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstObject(value: unknown) {
  return flatten(value)[0] ?? null;
}

function joinBits(bits: unknown[]) {
  return bits
    .flatMap((bit) => flatten(bit))
    .map((bit) => {
      if (!bit) return "";
      if (typeof bit === "object") {
        return Object.values(bit as Record<string, unknown>)
          .map((v) => String(v ?? ""))
          .join(" ");
      }
      return String(bit);
    })
    .join(" ")
    .toLowerCase();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCapacityKg(...values: unknown[]) {
  const text = values.map((value) => String(value ?? "")).join(" ").toLowerCase();
  if (!text.trim()) return null;

  const tonneMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:t|ton|tons|tonne|tonnes)\b/);
  if (tonneMatch) {
    const tonnes = Number(tonneMatch[1]);
    if (Number.isFinite(tonnes) && tonnes > 0) return tonnes * 1000;
  }

  const kgMatch = text.match(/(\d{3,}(?:\.\d+)?)\s*(?:kg|kgs|kilogram|kilograms)\b/);
  if (kgMatch) {
    const kg = Number(kgMatch[1].replace(/,/g, ""));
    if (Number.isFinite(kg) && kg > 0) return kg;
  }

  return null;
}

function textValue(obj: any, key: string) {
  return cleanText(obj?.[key]);
}

export function getLiftPlanPackSections(source: any): Record<string, any> {
  const direct = source?.pack_sections;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, any>;

  const nested = source?.lift_plan?.pack_sections ?? source?.liftPlan?.pack_sections;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested as Record<string, any>;

  return {};
}

function customCraneNameFromSections(sections: Record<string, any>) {
  return (
    textValue(sections, "custom_crane_name") ||
    textValue(sections, "external_crane_name") ||
    textValue(sections, "selected_crane_override") ||
    textValue(sections, "cover_cranes")
  );
}

function selectedAllocationId(job: any) {
  return cleanText(job?.selected_job_equipment_id);
}

function selectedCraneId(job: any) {
  return cleanText(job?.selected_crane_id);
}

function isCraneAllocation(item: any) {
  const type = toText(item?.asset_type || item?.source_type || "");
  const source = toText(item?.source_type || "");
  const itemName = toText(item?.item_name || item?.name || "");
  const hasLinkedCrane = Boolean(item?.crane_id || firstObject(item?.cranes));

  if (hasLinkedCrane) return true;
  if (type === "crane") return true;

  if ((source.includes("cross") || source.includes("sub") || source.includes("hire")) && itemName.includes("crane")) {
    return true;
  }

  if (source.includes("cross") || source.includes("sub") || source.includes("hire")) {
    if (/\b(ak|gmk|ltm|ac|atf|hk|spx|mtk|demag|liebherr|grove|tadano|terex|kato|marchetti|bocker|böcker)\b/i.test(itemName)) {
      return true;
    }
  }

  return false;
}

function listMatchingCraneAllocations(job: any) {
  return flatten(job?.job_equipment).filter(isCraneAllocation);
}

function scoreAllocation(item: any, job: any) {
  let score = 0;
  const itemId = cleanText(item?.id);
  const selAllocationId = selectedAllocationId(job);
  const selCraneId = selectedCraneId(job);
  const crane = firstObject(item?.cranes);
  const source = toText(item?.source_type || "");
  const type = toText(item?.asset_type || "");

  if (selAllocationId && itemId === selAllocationId) score += 1000;
  if (selCraneId && (cleanText(item?.crane_id) === selCraneId || cleanText(crane?.id) === selCraneId)) score += 800;
  if (type === "crane") score += 150;
  if (item?.crane_id || crane) score += 120;
  if (source.includes("cross") || source.includes("sub") || source.includes("hire")) score += 80;
  if (cleanText(item?.item_name)) score += 30;
  if (item?.operator_id || firstObject(item?.operators)) score -= 20;

  return score;
}

function firstMatchingCraneAllocation(job: any) {
  const allocations = listMatchingCraneAllocations(job);
  if (allocations.length === 0) return null;

  allocations.sort((a, b) => {
    const scoreDiff = scoreAllocation(b, job) - scoreAllocation(a, job);
    if (scoreDiff !== 0) return scoreDiff;
    const aStart = String(a?.start_date ?? a?.created_at ?? "");
    const bStart = String(b?.start_date ?? b?.created_at ?? "");
    return aStart.localeCompare(bStart) || String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
  });

  return allocations[0] ?? null;
}

function findSelectedCraneAllocation(job: any) {
  const allocations = listMatchingCraneAllocations(job);
  if (!allocations.length) return null;

  const selAllocationId = selectedAllocationId(job);
  if (selAllocationId) {
    const exact = allocations.find((item) => cleanText(item?.id) === selAllocationId);
    if (exact) return exact;
  }

  const selCraneId = selectedCraneId(job);
  if (selCraneId) {
    const byCrane = allocations.find((item) => {
      const crane = firstObject(item?.cranes);
      return cleanText(item?.crane_id) === selCraneId || cleanText(crane?.id) === selCraneId;
    });
    if (byCrane) return byCrane;
  }

  return null;
}

function supplierNameFromAllocation(allocation: any) {
  const supplier = firstObject(allocation?.suppliers);
  return cleanText(supplier?.company_name) || cleanText(allocation?.supplier_display_name);
}

function syntheticCraneFromAllocation(allocation: any, sections: Record<string, any>) {
  if (!allocation) return null;

  const linked = firstObject(allocation?.cranes);
  if (linked) return linked;

  const customName = customCraneNameFromSections(sections);
  const itemName = cleanText(allocation?.item_name);
  const name = customName || itemName;
  if (!name) return null;

  const make = textValue(sections, "custom_crane_make") || textValue(sections, "external_crane_make") || null;
  const model = textValue(sections, "custom_crane_model") || textValue(sections, "external_crane_model") || null;
  const capacity =
    textValue(sections, "custom_crane_capacity") ||
    textValue(sections, "external_crane_capacity") ||
    cleanText(allocation?.capacity) ||
    (parseCapacityKg(itemName, allocation?.notes) ? `${Number(parseCapacityKg(itemName, allocation?.notes)) / 1000} t` : null);

  return {
    id: null,
    name,
    make,
    model,
    capacity,
    reg_number: null,
    external: true,
    source_type: allocation?.source_type ?? null,
    supplier_name: supplierNameFromAllocation(allocation) || null,
    notes: allocation?.notes ?? null,
  };
}

function syntheticCraneFromSections(sections: Record<string, any>) {
  const name = customCraneNameFromSections(sections);
  if (!name) return null;

  return {
    id: null,
    name,
    make: textValue(sections, "custom_crane_make") || textValue(sections, "external_crane_make") || null,
    model: textValue(sections, "custom_crane_model") || textValue(sections, "external_crane_model") || null,
    capacity: textValue(sections, "custom_crane_capacity") || textValue(sections, "external_crane_capacity") || null,
    reg_number: null,
    external: true,
    source_type: "manual_override",
  };
}

function matchByAliases(text: string) {
  let winner: EquipmentProfile | null = null;
  let winnerScore = 0;

  for (const profile of EQUIPMENT_PROFILES) {
    let score = 0;
    for (const alias of profile.aliases) {
      const key = alias.toLowerCase();
      if (!key) continue;
      if (text.includes(key)) {
        score = Math.max(score, key.length);
      }
    }
    if (score > winnerScore) {
      winner = profile;
      winnerScore = score;
    }
  }

  return winner;
}

function buildExternalProfile(job: any, crane: any, allocation: any): EquipmentProfile | null {
  const sections = getLiftPlanPackSections(job);
  const title =
    customCraneNameFromSections(sections) ||
    cleanText(crane?.name) ||
    cleanText(allocation?.item_name) ||
    cleanText(crane?.model) ||
    cleanText(crane?.make);

  if (!title) return null;

  const capacityKg =
    numberOrNull(sections.custom_crane_capacity_kg) ??
    numberOrNull(sections.external_crane_capacity_kg) ??
    parseCapacityKg(sections.custom_crane_capacity, sections.external_crane_capacity, crane?.capacity, allocation?.capacity, allocation?.notes, title);
  const capacityTonnes = capacityKg ? Number((capacityKg / 1000).toFixed(2)) : null;
  const boomLength = numberOrNull(sections.custom_crane_boom_length_m) ?? numberOrNull(sections.external_crane_boom_length_m);
  const maxRadius = numberOrNull(sections.custom_crane_max_radius_m) ?? numberOrNull(sections.external_crane_max_radius_m);
  const make = textValue(sections, "custom_crane_make") || textValue(sections, "external_crane_make") || cleanText(crane?.make) || undefined;
  const model = textValue(sections, "custom_crane_model") || textValue(sections, "external_crane_model") || cleanText(crane?.model) || undefined;
  const supplier = cleanText(crane?.supplier_name) || supplierNameFromAllocation(allocation);
  const summary =
    textValue(sections, "custom_crane_summary") ||
    textValue(sections, "external_crane_summary") ||
    [title, supplier ? `supplied by ${supplier}` : "external / sub-hired crane", capacityTonnes ? `max capacity ${capacityTonnes} t` : null, boomLength ? `boom ${boomLength} m` : null]
      .filter(Boolean)
      .join(", ");

  return {
    id: `external-${title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`,
    title,
    machineType: "crane",
    manufacturer: make,
    model,
    aliases: [title, make, model, cleanText(allocation?.item_name)].filter(Boolean),
    summary,
    maxCapacityKg: capacityKg,
    maxCapacityTonnes: capacityTonnes,
    maxBoomLengthM: boomLength,
    maxTipHeightM: null,
    maxHydraulicOutreachM: boomLength,
    maxJibOutreachM: null,
    maxRadiusM: maxRadius,
    outriggersNote:
      textValue(sections, "custom_crane_outrigger_note") ||
      textValue(sections, "external_crane_outrigger_note") ||
      "Outrigger / stabiliser arrangement to be confirmed from the supplier's current chart and set up on suitable mats / pads for the actual ground conditions.",
    configurationNote:
      textValue(sections, "custom_crane_configuration_note") ||
      textValue(sections, "external_crane_configuration_note") ||
      "Selected sub-hired crane to be used only in the checked boom length, radius, counterweight / ballast and outrigger duty shown on the supplier/manufacturer chart.",
    weatherNote:
      textValue(sections, "custom_crane_weather_note") ||
      textValue(sections, "external_crane_weather_note") ||
      "Weather and wind limits must be confirmed against the current manufacturer chart and supplier guidance for the exact crane configuration.",
    capabilities: [
      "Sub-hired / external crane recorded against this job",
      "Manual crane specification details can be entered on the lift plan page",
      "Final lift to be checked against supplier/manufacturer chart",
    ],
    warnings: [
      "This crane is not linked to a verified uploaded specification unless one has been attached to the selected crane asset; verify all supplier/manufacturer information before approving the lift.",
      "Final capacity must be checked against the exact current load chart, radius, boom length, counterweight / ballast, outrigger setup and accessories.",
      "Hook block, slings and lifting accessories must be deducted from available chart capacity.",
    ],
    sourceLabel: textValue(sections, "custom_crane_chart_note") || textValue(sections, "external_crane_chart_note") || "External / sub-hired crane details",
  };
}

export function getPrimaryCraneContext(job: any) {
  const sections = getLiftPlanPackSections(job);
  const allocation = findSelectedCraneAllocation(job) ?? firstMatchingCraneAllocation(job);

  const selCraneId = selectedCraneId(job);
  const craneFromAllocation = firstObject(allocation?.cranes);
  const jobCraneList = flatten(job?.cranes);
  const craneFromSelection = selCraneId
    ? jobCraneList.find((item) => cleanText(item?.id) === selCraneId) ?? null
    : null;
  const manualCrane = syntheticCraneFromSections(sections);
  const externalCrane = syntheticCraneFromAllocation(allocation, sections);

  const crane = manualCrane ?? craneFromAllocation ?? externalCrane ?? craneFromSelection ?? jobCraneList[0] ?? job?.crane ?? null;

  const operator =
    firstObject(allocation?.operators) ??
    firstObject(job?.main_operator) ??
    firstObject(job?.operators) ??
    null;

  return {
    allocation,
    crane,
    operator,
  };
}

export function matchCraneJobEquipmentProfile(job: any): EquipmentProfile | null {
  const primary = getPrimaryCraneContext(job);
  const sections = getLiftPlanPackSections(job);

  const specSheetProfile = buildSpecSheetEquipmentProfile(primary.crane);
  if (specSheetProfile) return specSheetProfile;

  const text = joinBits([
    sections,
    primary.allocation,
    primary.crane,
    primary.crane?.name,
    primary.crane?.make,
    primary.crane?.model,
    primary.crane?.capacity,
    job?.hire_type,
    job?.lift_type,
    job?.notes,
    job?.site_name,
  ]);

  const matched = matchByAliases(text);
  if (matched) return matched;

  return buildExternalProfile(job, primary.crane, primary.allocation);
}

export function matchTransportJobEquipmentProfile(job: any, linkedJob?: any): EquipmentProfile | null {
  const vehicle = firstObject(job?.vehicles) ?? job?.vehicle ?? null;
  const text = joinBits([
    vehicle,
    vehicle?.name,
    vehicle?.reg_number,
    vehicle?.vehicle_type,
    vehicle?.trailer_type,
    vehicle?.capacity,
    job?.job_type,
    job?.load_description,
    job?.notes,
    linkedJob,
  ]);

  const matched = matchByAliases(text);
  if (matched) return matched;

  const hiabHints = [
    toText(vehicle?.name),
    toText(vehicle?.vehicle_type),
    toText(vehicle?.trailer_type),
    toText(job?.job_type),
    toText(job?.load_description),
    toText(job?.notes),
  ].join(" ");

  if (hiabHints.includes("rigid hiab") || hiabHints.includes("rigid")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "hiab-x-hipro-858") ?? null;
  }

  if (hiabHints.includes("artic hiab") || hiabHints.includes("artic")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "palfinger-pk65002-sh") ?? null;
  }

  if (hiabHints.includes("hiab") || hiabHints.includes("loader crane")) {
    return EQUIPMENT_PROFILES.find((profile) => profile.id === "hiab-x-hipro-858") ?? null;
  }

  return null;
}
