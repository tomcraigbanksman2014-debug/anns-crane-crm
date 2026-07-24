import type { CSSProperties, ReactNode } from "react";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getPrimaryCraneContext,
  matchCraneJobEquipmentProfile,
} from "../../../../lib/ai/matchEquipmentProfile";
import { attachCraneSpecDocumentsToJob } from "../../../../lib/ai/craneSpecDocuments";
import { getCraneAppendixAssetsForPack, getJobSpecAppendixAssetsForPack, type PackAppendixAssetItem } from "../../../../lib/assetDocuments";
import PrintPackButton from "./PrintPackButton";
import { calculateRangeChartBearingLoad, calculateRangeChartCapacity, getRangeChartLimits, getRangeChartSpecOptions } from "../../../../lib/rangeChartSpecs";
import LiftArrangementDrawing from "../../../../components/lift-drawing/LiftArrangementDrawing";
import type { LiftMachineType } from "../../../../components/lift-drawing/types";
import {
  parseLiftDrawingModel,
  technicalDrawingEnabled,
} from "../../../../lib/liftDrawingPersistence";
import { validateLiftDrawing } from "../../../../lib/liftDrawingValidation";

type StringMap = Record<string, string | null>;

function flatten<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}


function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function realLinkedCraneId(job: any, liftPlan: any, primary: any, crane: any) {
  // Use the crane actually being displayed/planned first.  Saved lift-plan drafts can contain
  // an old selected_crane_id after the job crane has been edited, and using that stale value
  // pulls the wrong crane spec/load-chart pages into the pack.
  const fromDisplayedCrane = String(crane?.id ?? "").trim();
  if (fromDisplayedCrane) return fromDisplayedCrane;

  const primaryAllocationCrane = one(primary?.allocation?.cranes) as any;
  const fromPrimaryAllocation = String(primary?.allocation?.crane_id ?? primaryAllocationCrane?.id ?? "").trim();
  if (fromPrimaryAllocation) return fromPrimaryAllocation;

  const firstJobCrane = one((job as any)?.cranes) as any;
  const fromJobCrane = String(firstJobCrane?.id ?? "").trim();
  if (fromJobCrane) return fromJobCrane;

  const allocations = flatten((job as any)?.job_equipment);
  const selectedAllocationId = String(liftPlan?.selected_job_equipment_id ?? "").trim();
  if (selectedAllocationId) {
    const selectedAllocation = allocations.find((row: any) => String(row?.id ?? "").trim() === selectedAllocationId);
    const selectedAllocationCrane = one(selectedAllocation?.cranes) as any;
    const selectedAllocationCraneId = String(selectedAllocation?.crane_id ?? selectedAllocationCrane?.id ?? "").trim();
    if (selectedAllocationCraneId) return selectedAllocationCraneId;
  }

  return String(liftPlan?.selected_crane_id ?? "").trim() || null;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function fmtMonthYear(value: string | Date | null | undefined) {
  const d = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  return safeDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
}

function val(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function yesNo(value: boolean | null | undefined) {
  return value ? "Yes" : "No";
}

function calcDuration(start: string | null | undefined, end: string | null | undefined) {
  if (!start) return "—";
  const a = new Date(start);
  const b = new Date(end || start);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const diff = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  return `${diff} day${diff === 1 ? "" : "s"}`;
}

function craneLabel(crane: any, allocation: any) {
  const name = tidyWhitespace(crane?.name);
  const make = tidyWhitespace(crane?.make);
  const model = tidyWhitespace(crane?.model);
  const capacity = tidyWhitespace(crane?.capacity);
  const base = tidyDisplayLabel([name, make, model].filter(Boolean).join(" ")) || tidyWhitespace(allocation?.item_name);
  const joined = [base, capacity && !base.toLowerCase().includes(capacity.toLowerCase()) ? capacity : ""].filter(Boolean).join(" ").trim();
  return tidyCraneLabel(joined) || "—";
}

function formatCapacity(profile: any, crane: any, craneName?: string) {
  const label = `${craneName ?? ""} ${crane?.name ?? ""} ${crane?.make ?? ""} ${crane?.model ?? ""}`;
  // AK46: 26 t is the gross vehicle weight, not lifting capacity. The uploaded spec gives
  // max payload 3,000 kg, optional 6,000 kg. Use 6,000 kg / 6 t where the spec profile has
  // accidentally extracted the 26 t truck weight as a capacity.
  if (currentCraneIsAk46(label)) return "6,000 kg / 6 t";

  if (profile?.maxCapacityKg) {
    const kg = Number(profile.maxCapacityKg);
    const tonnes =
      profile?.maxCapacityTonnes ??
      (Number.isFinite(kg) ? Number((kg / 1000).toFixed(1)) : null);

    const kgText = Number.isFinite(kg) ? `${kg.toLocaleString("en-GB")} kg` : "";
    const tonneText = tonnes ? `${tonnes} t` : "";

    return [kgText, tonneText].filter(Boolean).join(" / ");
  }
  return crane?.capacity || "—";
}

function percentageUtilisation(loadWeight: any, capacityKg: any) {
  const load = Number(loadWeight || 0);
  const cap = Number(capacityKg || 0);
  if (!load || !cap) return "—";
  return `${Math.round((load / cap) * 100)}%`;
}

function splitLines(value: string | null | undefined) {
  if (!value) return [];
  return String(value)
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function para(value: string | null | undefined, fallback: string) {
  return value && String(value).trim() ? String(value) : fallback;
}

function sentenceCase(value: string | null | undefined, fallback: string) {
  return para(value, fallback).trim();
}

function tidyWhitespace(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function tidyDisplayLabel(value: unknown) {
  const text = tidyWhitespace(String(value ?? ""));
  if (!text) return "";
  const words = text.split(" ").filter(Boolean);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const key = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result.join(" ").trim();
}

function tidyCraneLabel(value: unknown) {
  let text = tidyDisplayLabel(value);
  if (!text) return "";
  text = tidyRepeatedCraneNames(text);
  return text;
}

function tidyRepeatedCraneNames(value: unknown) {
  return String(value ?? "")
    // Fix common duplicated crane names created when make/model are concatenated with an already-complete name.
    .replace(/\b(BOCKER|BÖCKER)\s+AK\s+46\/6000\s+(?:6T\s+)?\1\s+AK\s+46\/6000(?:\s+6T)?\b/gi, "$1 AK 46/6000 6T")
    .replace(/\b(BOCKER|BÖCKER)\s+AK\s+46\/6000\s+\1\s+AK\s+46\/6000\b/gi, "$1 AK 46/6000")
    .replace(/\b(JEKKO)\s+SPX\s*532\s+\1\s+SPX\s*532\b/gi, "$1 SPX532")
    .replace(/\b(GROVE)\s+GMK\s*4080-?1\s+\1\s+GMK\s*4080-?1\b/gi, "$1 GMK4080-1")
    .replace(/\b(MARCHETTI)\s+MTK\s*35\s+\1\s+MTK\s*35\b/gi, "$1 MTK35")
    .replace(/\b(TADANO)\s+FAUN\s+HK\s*40\s+\1\s+FAUN\s+HK\s*40\b/gi, "$1 FAUN HK40")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseCraneForCompare(value: unknown) {
  return tidyDisplayLabel(value)
    .toLowerCase()
    .replace(/böcker/g, "bocker")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:crane|mobile|spider|truck|mounted|gt|cdh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textMentionsDifferentKnownCrane(value: unknown, currentCraneName: unknown) {
  const text = normaliseCraneForCompare(value);
  const current = normaliseCraneForCompare(currentCraneName);
  if (!text || !current) return false;
  const known = [
    { key: "bocker", aliases: ["bocker", "ak46", "ak 46"] },
    { key: "jekko", aliases: ["jekko", "spx532", "spx 532"] },
    { key: "grove", aliases: ["grove", "gmk4080", "gmk 4080"] },
    { key: "mtk35", aliases: ["marchetti", "mtk35", "mtk 35"] },
    { key: "hk40", aliases: ["tadano", "faun", "hk40", "hk 40"] },
  ];
  const currentKeys = new Set(known.filter((item) => item.aliases.some((alias) => current.includes(alias.replace(/\s+/g, " ")))).map((item) => item.key));
  if (!currentKeys.size) return false;
  return known.some((item) => !currentKeys.has(item.key) && item.aliases.some((alias) => text.includes(alias.replace(/\s+/g, " "))));
}

function currentCraneSafeText(value: unknown, currentCraneName: unknown) {
  return textMentionsDifferentKnownCrane(value, currentCraneName) ? "" : String(value ?? "").trim();
}

function currentCraneIsAk46(value: unknown) {
  const current = normaliseCraneForCompare(value);
  return /(?:^| )(?:bocker|ak46|ak 46)(?: |$)/.test(current);
}

function currentCraneIsJekko(value: unknown) {
  const current = normaliseCraneForCompare(value);
  return /(?:^| )(?:jekko|spx532|spx 532)(?: |$)/.test(current);
}

function noJibLabelForCrane(value: unknown) {
  return currentCraneIsAk46(value)
    ? "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension"
    : "No jib / main boom only";
}

function sanitiseCurrentCranePackText(value: unknown, currentCraneName: unknown) {
  let text = tidyRepeatedTextBlock(String(value ?? ""));
  if (!text) return "";

  if (currentCraneIsAk46(currentCraneName)) {
    text = text
      // The AK46 spec lists 18t / 26t as gross vehicle weight. It must not be printed as lifting capacity.
      .replace(/\bmax\s+capacity\s+26\s*t\b/gi, "max lifting capacity 6 t")
      .replace(/\bmax\s+capacity\s+26,?000\s*kg\b/gi, "max lifting capacity 6,000 kg")
      .replace(/\bmaximum\s+capacity\s+26\s*t\b/gi, "maximum lifting capacity 6 t")
      .replace(/\bmaximum\s+capacity\s+26,?000\s*kg\b/gi, "maximum lifting capacity 6,000 kg")
      // On the AK46, the hydraulic extension is included in the total 46m boom-extension figure.
      .replace(/\bMain\s+boom\s*\+\s*jib\s*\/\s*extension\b/gi, "Main boom / total boom-extension")
      .replace(/\bjib\s*\/\s*max\s+outreach\s+39\s*m\b/gi, "crane-operation radius up to 39 m");
  } else {
    // Do not let AK46-only wording leak into packs for Jekko, Grove, HK40, MTK35 or external cranes.
    text = text
      .replace(/No\s+separate\s+additive\s+jib\s+—\s+hydraulic\s+extension\s+is\s+included\s+in\s+the\s+46\s*m\s+total\s+boom-extension/gi, "No jib / main boom only")
      .replace(/AK46\s+total\s+boom-extension\s+up\s+to\s+46\s*m/gi, "Main boom")
      .replace(/Main\s+boom\s*\/\s*total\s+boom-extension/gi, "Main boom");
  }

  return tidyRepeatedTextBlock(text);
}

function ak46SavedSetupShouldBeResetInPack(sections: StringMap, currentCraneName: unknown) {
  if (!currentCraneIsAk46(currentCraneName)) return false;
  const setupText = [
    sections.range_chart_selected_setup_key,
    sections.range_chart_selected_setup_label,
    sections.range_chart_selected_jib_option_key,
    sections.range_chart_selected_jib_option_label,
    sections.selected_crane_setup_key,
    sections.selected_crane_setup_label,
    sections.boom_configuration,
    sections.crane_jib_reference,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /ak46-main-46|optional\s+max\s+extension|max\s+extension\s+up\s+to\s+46|ak46-jib-|hydraulic\s+jib|11\.0\s*m\s+hydraulic\s+jib/.test(setupText);
}

function defaultRangeSetupForCurrentCrane(currentCraneName: unknown) {
  if (currentCraneIsAk46(currentCraneName)) {
    return {
      setupKey: "profile:ak46-crane-operation",
      setupLabel: "AK46 crane-operation range table / total boom-extension up to 46 m",
      jibKey: "none",
      jibLabel: "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension",
      jibLength: "0",
      jibAngle: "0",
    };
  }

  if (currentCraneIsJekko(currentCraneName)) {
    return {
      setupKey: "profile:spx532-main-j7",
      setupLabel: "Main boom — J7/full-stability planning chart",
      jibKey: "none",
      jibLabel: "No jib / main boom only",
      jibLength: "0",
      jibAngle: "0",
    };
  }

  return null;
}

function sanitisePackSectionsForCurrentCrane(rawSections: StringMap, currentCraneName: unknown) {
  const currentCrane = tidyDisplayLabel(currentCraneName);
  const out: StringMap = { ...(rawSections ?? {}) };
  if (!currentCrane) return out;

  const staleProbe = [
    out.range_chart_crane_name,
    out.custom_crane_name,
    out.cover_cranes,
    out.crane_type_value,
    out.range_chart_selected_setup_label,
    out.selected_crane_setup_label,
    out.range_chart_selected_jib_option_label,
    out.boom_configuration,
    out.crane_configuration,
    out.crane_setup_procedure,
    out.lifting_procedure,
    out.emergency_procedure,
    out.risk_assessment_summary,
    out.traffic_pedestrian_management,
  ].filter(Boolean).join("\n");
  const staleCrane = textMentionsDifferentKnownCrane(staleProbe, currentCrane);
  const staleAk46Setup = ak46SavedSetupShouldBeResetInPack(out, currentCrane);

  out.range_chart_crane_name = currentCrane;
  out.cover_cranes = currentCrane;
  out.crane_type_value = currentCrane;

  const keysThatMustNotCarryAnotherCrane = [
    "cover_cranes",
    "crane_type_value",
    "cover_boom_configuration",
    "cover_boom_length",
    "boom_configuration",
    "boom_length",
    "crane_outreach_reference",
    "crane_jib_reference",
    "crane_details",
    "configuration_outrigger_note",
    "load_chart_note",
    "crane_setup_procedure",
    "lifting_procedure",
    "emergency_procedure",
    "risk_assessment_summary",
    "control_measures",
    "traffic_pedestrian_management",
    "exclusion_zone_details",
    "job_planning_snapshot_text",
    "selected_crane_setup_label",
    "selected_crane_setup_key",
    "range_chart_verification_note",
    "range_chart_capacity_source",
    "range_chart_bearing_source",
  ];

  for (const key of keysThatMustNotCarryAnotherCrane) {
    if (textMentionsDifferentKnownCrane(out[key], currentCrane)) out[key] = "";
  }

  if (staleCrane || staleAk46Setup) {
    const defaults = defaultRangeSetupForCurrentCrane(currentCrane);
    if (defaults) {
      out.range_chart_selected_setup_key = defaults.setupKey;
      out.range_chart_selected_setup_label = defaults.setupLabel;
      out.selected_crane_setup_key = defaults.setupKey;
      out.selected_crane_setup_label = defaults.setupLabel;
      out.range_chart_selected_jib_option_key = defaults.jibKey;
      out.range_chart_selected_jib_option_label = defaults.jibLabel;
      out.range_chart_jib_length_m = defaults.jibLength;
      out.range_chart_jib_angle_deg = defaults.jibAngle;
    }

    // Clear stale calculated outputs from a previous crane/setup. They will be recalculated
    // from the current crane rules during this render.
    out.boom_configuration = currentCraneIsAk46(currentCrane) ? "Main boom / total boom-extension" : "Main boom";
    out.boom_length = "";
    out.crane_jib_reference = noJibLabelForCrane(currentCrane);
    out.range_chart_boom_length_m = "";
    out.range_chart_boom_angle_deg = "";
    out.range_chart_jib_length_m = defaults?.jibLength ?? "0";
    out.range_chart_jib_angle_deg = defaults?.jibAngle ?? "0";
    out.range_chart_chart_capacity_kg = "";
    out.range_chart_capacity_source = "";
    out.range_chart_utilisation_percent = "";
    out.range_chart_bearing_source = "";
    out.range_chart_bearing_method = "";
    out.range_chart_bearing_load_kg = "";
    out.range_chart_bearing_pressure_formula = "";
    out.range_chart_limit_warning = "";
  }

  return out;
}

function normaliseDuplicateKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9.%/()'" -]/g, "")
    .trim();
}

function tidyRepeatedTextBlock(value: unknown) {
  const text = tidyRepeatedCraneNames(String(value ?? "").replace(/\r\n/g, "\n")).trim();
  if (!text) return "";
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const seenParagraphs = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    const sentenceParts = paragraph
      .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const seenSentences = new Set<string>();
    const uniqueSentences: string[] = [];
    for (const sentence of sentenceParts.length ? sentenceParts : [paragraph]) {
      const key = normaliseDuplicateKey(sentence);
      if (!key || seenSentences.has(key)) continue;
      seenSentences.add(key);
      uniqueSentences.push(sentence);
    }
    const cleanedParagraph = uniqueSentences.join(" ").trim();
    const paragraphKey = normaliseDuplicateKey(cleanedParagraph);
    if (!paragraphKey || seenParagraphs.has(paragraphKey)) continue;
    seenParagraphs.add(paragraphKey);
    uniqueParagraphs.push(cleanedParagraph);
  }
  return tidyRepeatedCraneNames(uniqueParagraphs.join("\n\n")).trim();
}

function shortBoomConfiguration(
  override: string | null | undefined,
  liftPlanConfiguration: string | null | undefined,
  equipmentProfile: any
) {
  if (override && override.trim()) return override.trim();

  const source = tidyWhitespace(liftPlanConfiguration).toLowerCase();

  if (!source) {
    if (equipmentProfile?.machineType === "truck_crane") return "Main boom";
    if (equipmentProfile?.machineType === "crane") return "Main boom";
    if (equipmentProfile?.machineType === "spider") return "Main boom";
    return "Planned configuration";
  }

  if (source.includes("main boom") && source.includes("jib")) return "Main boom + jib";
  if (source.includes("main boom")) return "Main boom";
  if (source.includes("fly jib")) return "Main boom + fly jib";
  if (source.includes("jib")) return "Boom + jib";
  if (source.includes("platform") || source.includes("basket")) return "Lifting mode only";
  return liftPlanConfiguration?.trim() || "Planned configuration";
}

function shortBoomLength(
  override: string | null | undefined,
  equipmentProfile: any,
  craneName: string
) {
  if (override && override.trim()) return override.trim();

  if (equipmentProfile?.maxBoomLengthM) {
    return `${equipmentProfile.maxBoomLengthM} m max boom`;
  }

  if (equipmentProfile?.maxHydraulicOutreachM) {
    if (String(craneName).toLowerCase().includes("ak 46")) {
      return "44.0 m max extension";
    }
    return `${equipmentProfile.maxHydraulicOutreachM} m hydraulic outreach`;
  }

  return "Planned per selected chart";
}

function fallbackScope(clientName: string, projectName: string, liftPlan: any, loadWeight: string) {
  const loadText = liftPlan?.load_description || "the planned load";
  return `Works comprise the lifting operation for ${clientName} at ${projectName}. The planned load is ${loadText} with a stated load weight of ${loadWeight}. All lifting activities are to be carried out under the control of the appointed lifting team in accordance with the approved lift plan, site controls and current legislation.`;
}


function normaliseScopeWeightText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
}

function scopeWeightLooksStale(
  value: unknown,
  currentCraneName: unknown,
  craneWeightKg: number | null | undefined
) {
  const text = normaliseScopeWeightText(value);
  if (!text || !craneWeightKg || !Number.isFinite(craneWeightKg) || craneWeightKg <= 0) return false;

  if (textMentionsDifferentKnownCrane(text, currentCraneName)) return true;

  const currentKg = Math.round(craneWeightKg);
  const explicitWeights = Array.from(text.matchAll(/(?:crane|machine|gross|planning)[^\n.]{0,80}?(?:weight|mass)[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  return explicitWeights.some((weight) => Math.abs(weight - currentKg) > Math.max(250, currentKg * 0.05));
}

function currentCraneScopeWeightText({
  craneName,
  craneWeightKg,
  totalLiftedWeightKg,
  bearingLoadKg,
}: {
  craneName: string;
  craneWeightKg: number | null | undefined;
  totalLiftedWeightKg: number | null | undefined;
  bearingLoadKg: number | null | undefined;
}) {
  if (!craneWeightKg || !Number.isFinite(craneWeightKg) || craneWeightKg <= 0) return "";
  const craneText = `${craneName || "Selected crane"} planning/gross weight is ${formatRangeKg(craneWeightKg)}`;
  if (!totalLiftedWeightKg || !Number.isFinite(totalLiftedWeightKg) || totalLiftedWeightKg <= 0) {
    return `${craneText}.`;
  }
  const liftedText = `Gross lifted load is ${formatRangeKg(totalLiftedWeightKg)}`;
  if (bearingLoadKg && Number.isFinite(bearingLoadKg) && bearingLoadKg > 0) {
    return `${craneText}. ${liftedText}. Worst-case outrigger load used for the ground-bearing calculation is (${formatRangeKg(craneWeightKg)} + ${formatRangeKg(totalLiftedWeightKg)}) × 0.75 = ${formatRangeKg(bearingLoadKg)}.`;
  }
  return `${craneText}. ${liftedText}.`;
}

function fixScopeOfWorksForCurrentCrane({
  value,
  fallback,
  currentCraneName,
  craneWeightKg,
  totalLiftedWeightKg,
  bearingLoadKg,
}: {
  value: string;
  fallback: string;
  currentCraneName: string;
  craneWeightKg: number | null | undefined;
  totalLiftedWeightKg: number | null | undefined;
  bearingLoadKg: number | null | undefined;
}) {
  const selected = String(value || fallback || "").trim();
  const currentWeightText = currentCraneScopeWeightText({
    craneName: currentCraneName,
    craneWeightKg,
    totalLiftedWeightKg,
    bearingLoadKg,
  });

  if (!selected) return currentWeightText;
  if (!currentWeightText) return selected;

  const stale = scopeWeightLooksStale(selected, currentCraneName, craneWeightKg);
  const hasGeneratedWeightLine = /crane\s*\/\s*machine\s+weight\s+is|total\s+weight\s+used\s+for\s+basic\s+ground\s+bearing\s+calculation|planning\s*\/\s*gross\s+weight\s+is|(?:estimated\s+maximum|worst-case)\s+outrigger\s+load/i.test(selected);

  if (!stale && !hasGeneratedWeightLine) return selected;

  let cleaned = selected
    .replace(/\s*Crane\s*\/\s*machine\s+weight\s+is\s+[^.\n]*(?:\.|\n|$)/gi, " ")
    .replace(/\s*Total\s+weight\s+used\s+for\s+basic\s+ground\s+bearing\s+calculation\s+is\s+[^.\n]*(?:\.|\n|$)/gi, " ")
    .replace(/\s*(?:[A-Z0-9 /-]+\s+)?planning\s*\/\s*gross\s+weight\s+is\s+[^.\n]*(?:\.|\n|$)/gi, " ")
    .replace(/\s*Gross\s+lifted\s+load\s+is\s+[^.\n]*(?:\.|\n|$)/gi, " ")
    .replace(/\s*(?:Estimated\s+maximum\s+outrigger\s+load\s+for\s+the\s+basic\s+ground[- ]bearing\s+check|Worst-case\s+outrigger\s+load\s+used\s+for\s+the\s+ground[- ]bearing\s+calculation)\s+is\s+[^.\n]*(?:\.|\n|$)/gi, " ")
    .replace(/\s*(?:×|x)\s*0\.75\s*=\s*[0-9,]+(?:\s*kg)?\.?/gi, " ")
    .replace(/\s*\b75\s*=\s*[0-9,]+\s*kg\.?/gi, " ")
    .replace(/\s*\b[0-9,]+\s*=\s*[0-9,]+\s*kg\.?/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (textMentionsDifferentKnownCrane(cleaned, currentCraneName)) {
    cleaned = fallback.trim();
  }

  if (!cleaned) return currentWeightText;
  return tidyRepeatedTextBlock(`${cleaned}\n\n${currentWeightText}`);
}

function fallbackCommunication(siteContact: string) {
  return `Communication will be maintained using clear agreed hand signals in accordance with BS 7121, with two-way radio communication used if visibility or site layout requires it. The designated signaller will remain in control of crane movements and liaise with ${siteContact || "the site representative"} where necessary.`;
}

function coverAddress(job: any) {
  return [job?.site_name, job?.site_address].filter(Boolean).join(", ");
}

function formatOutreachReference(profile: any) {
  if (profile?.maxHydraulicOutreachM && profile?.maxRadiusM) {
    return `${profile.maxHydraulicOutreachM} m / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxHydraulicOutreachM) return `${profile.maxHydraulicOutreachM} m`;
  if (profile?.maxBoomLengthM && profile?.maxRadiusM) {
    return `${profile.maxBoomLengthM} m boom / ${profile.maxRadiusM} m radius`;
  }
  if (profile?.maxBoomLengthM) return `${profile.maxBoomLengthM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function formatJibReference(profile: any) {
  if (profile?.maxJibOutreachM) return `${profile.maxJibOutreachM} m`;
  if (profile?.maxRadiusM) return `${profile.maxRadiusM} m radius`;
  return "—";
}

function parseWeightToKg(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (!text || text === "—") return null;

  const match = text.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;

  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw <= 0) return null;

  if (/\bkg\b|kilogram/.test(text)) return raw;
  if (/tonne|ton|\bt\b/.test(text)) return raw * 1000;

  // Crane capacities are commonly entered as 35, 80 or 100 meaning tonnes.
  if (raw <= 250) return raw * 1000;

  return raw;
}

function formatKgAndTonnes(valueKg: number | null | undefined) {
  const kg = Number(valueKg ?? 0);
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  const tonnes = kg / 1000;
  return `${kg.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg / ${tonnes.toLocaleString("en-GB", { maximumFractionDigits: 2 })} t`;
}

function formatKgOnly(valueKg: number | null | undefined) {
  const kg = Number(valueKg ?? 0);
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  return `${kg.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg`;
}

function formatPercentValue(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return "—";
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;
}

function parseDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatAreaM2(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: 3 })} m²`;
}

function formatBearingPressure(loadKg: number | null | undefined, areaM2: number | null | undefined) {
  const load = Number(loadKg ?? 0);
  const area = Number(areaM2 ?? 0);
  if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(area) || area <= 0) return "—";
  const kgPerM2 = load / area;
  const tonnesPerM2 = kgPerM2 / 1000;
  return `${kgPerM2.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg/m² / ${tonnesPerM2.toLocaleString("en-GB", { maximumFractionDigits: 2 })} t/m²`;
}

function hasEnteredMatSpread(lengthM: number | null | undefined, widthM: number | null | undefined) {
  const length = Number(lengthM ?? 0);
  const width = Number(widthM ?? 0);
  return Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0;
}

function matPresetLabel(value: unknown) {
  switch (String(value ?? "").trim()) {
    case "1x3":
      return "1m x 3m mat";
    case "1x2":
      return "1m x 2m mat";
    case "1.2x2.4":
      return "1.2m x 2.4m mat";
    case "1.5x3":
      return "1.5m x 3m mat";
    case "2x3":
      return "2m x 3m mat";
    case "custom":
      return "Custom mat / spreader";
    default:
      return "—";
  }
}

function PageShell({
  children,
  sectionTitle,
  headerTitle,
  headerSubtitle,
  headerMonth,
  footerText,
  breakAfter = true,
}: {
  children: ReactNode;
  sectionTitle: ReactNode;
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  headerMonth?: ReactNode;
  footerText?: ReactNode;
  breakAfter?: boolean;
}) {
  return (
    <section
      className="lift-pack-page"
      style={{
        ...pageStyle,
        pageBreakAfter: breakAfter ? "always" : "auto",
        breakAfter: breakAfter ? "page" : "auto",
      }}
    >
      <PageHeader
        sectionTitle={sectionTitle}
        title={headerTitle}
        subtitle={headerSubtitle}
        month={headerMonth}
      />
      <div style={pageBody}>{children}</div>
      <PageFooter text={footerText} />
    </section>
  );
}

function PageHeader({
  sectionTitle,
  title,
  subtitle,
  month,
}: {
  sectionTitle: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  month?: ReactNode;
}) {
  return (
    <div style={pageHeader}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 auto" }}>
        <img src="/icon.png" alt="AnnS Crane Hire logo" style={logoStyle} />
        <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.5, overflowWrap: "anywhere" }}>{title ?? "ANNS – LIFTING PLAN – V1"}</div>
          <div style={{ fontSize: 11, opacity: 0.72, overflowWrap: "anywhere" }}>{subtitle ?? "Anns Crane Hire Ltd"}</div>
        </div>
      </div>
      <div style={{ textAlign: "right", minWidth: 150, maxWidth: 260, overflowWrap: "anywhere", wordBreak: "normal" }}>
        <div style={{ fontSize: 11, opacity: 0.7, overflowWrap: "anywhere" }}>{month ?? fmtMonthYear(new Date())}</div>
        <div style={{ fontWeight: 800, overflowWrap: "anywhere", lineHeight: 1.18 }}>{sectionTitle}</div>
      </div>
    </div>
  );
}

function PageFooter({ text }: { text?: ReactNode }) {
  return (
    <div style={pageFooter}>
      <div style={pageFooterText}>
        {text ?? "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk"}
      </div>
      <div style={reviewQrWrap}>
        <img src="/google-review-qr.png" alt="Google review QR code" style={reviewQrImage} />
        <div style={reviewQrText}>Review us</div>
      </div>
    </div>
  );
}

function renderInfoValue(value: any) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return val(value);
  }
  return value;
}

function InfoTable({ rows }: { rows: Array<[ReactNode, any]> }) {
  return (
    <div style={infoTable}>
      {rows.map(([label, value], index) => (
        <div key={`${label}-${index}`} style={{ display: "contents" }}>
          <div style={infoLabel}>{label}</div>
          <div style={infoValue}>{renderInfoValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={sectionTitleStyle}>{children}</h2>;
}

function BoxedParagraph({
  title,
  children,
  compact = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ ...boxed, ...(compact ? compactBoxed : null) }}>
      {title ? <div style={boxedTitle}>{title}</div> : null}
      <div style={boxedBody}>{children}</div>
    </div>
  );
}

function TwoColumnBoxes({
  leftTitle,
  leftBody,
  rightTitle,
  rightBody,
}: {
  leftTitle: ReactNode;
  leftBody: ReactNode;
  rightTitle: ReactNode;
  rightBody: ReactNode;
}) {
  return (
    <div style={twoColGrid}>
      <BoxedParagraph title={leftTitle}>{leftBody}</BoxedParagraph>
      <BoxedParagraph title={rightTitle}>{rightBody}</BoxedParagraph>
    </div>
  );
}

function CheckboxTable({
  leftHeader,
  rightHeader,
  left,
  right,
  namePrefix = "checklist",
  sections,
}: {
  leftHeader?: ReactNode;
  rightHeader?: ReactNode;
  left: ReactNode[];
  right: ReactNode[];
  namePrefix?: string;
  sections?: StringMap;
}) {
  const rows = Math.max(left.length, right.length);
  const saved = (key: string) => defaultSectionText(sections ?? {}, key, "");
  return (
    <div className="lift-pack-table-wrap"><table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>{leftHeader ?? "PRE-LIFT CHECK POINTS"}</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
          <th style={thStyle}>{rightHeader ?? "ERECTION / COMPLETION CHECKS"}</th>
          <th style={thStyle}>Y</th>
          <th style={thStyle}>N</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            <td style={tdStyle}>{left[i] ?? ""}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_left_${i + 1}_yes`} defaultValue={saved(`${namePrefix}_left_${i + 1}_yes`)} align="right" emptyPrintValue="" />}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_left_${i + 1}_no`} defaultValue={saved(`${namePrefix}_left_${i + 1}_no`)} align="right" emptyPrintValue="" />}</td>
            <td style={tdStyle}>{right[i] ?? ""}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_right_${i + 1}_yes`} defaultValue={saved(`${namePrefix}_right_${i + 1}_yes`)} align="right" emptyPrintValue="" />}</td>
            <td style={tickCell}>{<EditableInput name={`${namePrefix}_right_${i + 1}_no`} defaultValue={saved(`${namePrefix}_right_${i + 1}_no`)} align="right" emptyPrintValue="" />}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function BlankTable({
  headers,
  rows,
  namePrefix = "blank_table",
  sections,
}: {
  headers: ReactNode[];
  rows: number;
  namePrefix?: string;
  sections?: StringMap;
}) {
  const saved = (key: string) => defaultSectionText(sections ?? {}, key, "");
  return (
    <div className="lift-pack-table-wrap"><table style={tableStyle}>
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={index} style={thStyle}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {headers.map((_, idx) => (
              <td key={idx} style={tdStyle}>
                {<EditableInput name={`${namePrefix}_r${i + 1}_c${idx + 1}`} defaultValue={saved(`${namePrefix}_r${i + 1}_c${idx + 1}`)} emptyPrintValue="" />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function SignatureRow({
  title,
  name,
  nameField,
  dateField,
  sections,
}: {
  title: ReactNode;
  name?: string | null;
  nameField: string;
  dateField: string;
  sections?: StringMap;
}) {
  const savedName = defaultSectionText(sections ?? {}, nameField, name || "");
  const savedDate = defaultSectionText(sections ?? {}, dateField, "");
  return (
    <div style={signatureBox}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 12, borderBottom: "1px solid #333", minHeight: 22 }} />
      <div style={{ marginTop: 6, fontSize: 12, display: "grid", gap: 4 }}>
        <div>Name: {<EditableInput name={nameField} defaultValue={savedName} />}</div>
        <div>Date: {<EditableInput name={dateField} defaultValue={savedDate} emptyPrintValue="" />}</div>
      </div>
    </div>
  );
}

function AppendixPage({
  asset,
  index,
  titleNode,
  captionNode,
  headerMonth,
  headerTitle,
  headerSubtitle,
  footerText,
}: {
  asset: PackAppendixAssetItem;
  index: number;
  titleNode?: ReactNode;
  captionNode?: ReactNode;
  headerMonth?: ReactNode;
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  footerText?: ReactNode;
}) {
  const imageSrc = asset.image_url;

  return (
    <section
      className="lift-pack-page"
      style={{
        ...appendixPageStyle,
        pageBreakBefore: "always",
        breakBefore: "page",
        pageBreakAfter: "always",
        breakAfter: "page",
      }}
    >
      <PageHeader sectionTitle={`Appendix ${index}`} title={headerTitle} subtitle={headerSubtitle} month={headerMonth} />
      <div style={appendixPageBody}>
        <div style={appendixTitle}>{titleNode ?? asset.title}</div>
        {captionNode ? (
          <div style={appendixDescription}>{captionNode}</div>
        ) : asset.description ? (
          <div style={appendixDescription}>{asset.description}</div>
        ) : null}
        <div style={appendixFrame}>
          <img src={imageSrc} alt={typeof asset.title === "string" ? asset.title : `Appendix ${index}`} style={appendixImage} />
        </div>
      </div>
      <PageFooter text={footerText} />
    </section>
  );
}



function rangeChartIsEnabled(sections: StringMap) {
  const enabled = String(sections.range_chart_enabled ?? "").trim().toLowerCase();
  // The pack page must follow the user's Include in pack checkbox exactly.
  // Old saved range-chart dimensions should keep the lift data available,
  // but must not force the sketch page into the pack when the checkbox is unticked.
  return ["1", "true", "yes", "on", "enabled"].includes(enabled);
}

function rangeText(sections: StringMap, key: string, fallback = "—") {
  const value = String(sections[key] ?? "").trim();
  return value || fallback;
}

function rangeNumber(sections: StringMap, key: string, fallback: number) {
  const value = parseDecimal(sections[key]);
  return value !== null && Number.isFinite(value) ? value : fallback;
}

function rangeKg(sections: StringMap, key: string) {
  const value = parseDecimal(sections[key]) ?? parseWeightToKg(sections[key]);
  return value !== null && Number.isFinite(value) ? value : null;
}

function formatRangeNumber(value: number | null | undefined, suffix = "m") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 })}${suffix ? ` ${suffix}` : ""}`;
}

function formatRangeKg(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("en-GB")} kg`;
}

function cleanPackSetupLabel(value: unknown) {
  return tidyRepeatedTextBlock(String(value ?? ""))
    .replace(/\s*—\s*height\s+check\s+required\s*$/i, "")
    .replace(/\bmanual\s+chart\s+check\b/gi, "")
    .replace(/\bmanual\s+reaction\s+check\b/gi, "")
    .replace(/\bwarning\b:?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRecommendedSetupText({
  radiusM,
  totalLiftedWeightKg,
  selectedSetupLabel,
  selectedJibLabel,
  chartCapacityKg,
  utilisationPercent,
}: {
  craneName: string;
  radiusM: number | null | undefined;
  tipHeightM: number | null | undefined;
  totalLiftedWeightKg: number | null | undefined;
  selectedSetupLabel?: string | null;
  selectedJibLabel?: string | null;
  sourceLabel?: string | null;
  chartCapacityKg?: number | null;
  utilisationPercent?: number | null;
}) {
  // The issued pack must use the setup saved and verified by the AP.  It must never run the
  // recommendation engine again during rendering, because doing so can select a different
  // boom/counterweight chart from the one that was saved on the lift plan.
  const selected = cleanPackSetupLabel([selectedSetupLabel, selectedJibLabel].filter(Boolean).join(" / "));
  const setup = selected || "Selected / AP verified crane setup";
  const radius = Number(radiusM ?? 0);
  const lifted = Number(totalLiftedWeightKg ?? 0);
  const capacity = Number(chartCapacityKg ?? 0);

  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(lifted) || lifted <= 0) {
    return setup;
  }

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return `${setup}. Duty to be confirmed against the selected load chart for ${formatKgOnly(lifted)} at ${formatRangeNumber(radius)} radius.`;
  }

  const calculatedUtilisation = Number.isFinite(Number(utilisationPercent))
    ? Number(utilisationPercent)
    : (lifted / capacity) * 100;
  const utilText = Number.isFinite(calculatedUtilisation)
    ? `, ${formatPercentValue(calculatedUtilisation)} utilisation`
    : "";

  return `${setup}. Selected chart duty: ${formatKgAndTonnes(capacity)} at ${formatRangeNumber(radius)} radius for ${formatKgOnly(lifted)} gross lifted load${utilText}.`;
}

function buildPackCapacitySourceText(method: string | null | undefined) {
  return method === "automatic" ? "Structured load chart" : "Selected / AP verified load chart";
}

function formatRangeGap(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 0 ? formatRangeNumber(value) : `${formatRangeNumber(Math.abs(value))} short`;
}

function formatRangeClearance(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value >= 0 ? formatRangeNumber(value) : `${formatRangeNumber(Math.abs(value))} low`;
}

function formatRangeBoomLength(calc: ReturnType<typeof rangeChartCalculated> | null) {
  if (!calc?.boomLengthM) return "—";
  const maxBoom = calc.limits?.maxBoomLengthM ?? null;
  const boom = calc.boomLengthM;
  const boomText = formatRangeNumber(boom);
  if (maxBoom && boom > maxBoom + 0.01) {
    return `${boomText} required (${formatRangeNumber(maxBoom)} max)`;
  }
  return boomText;
}


function inferRangePhysicalJibLengthFromText(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  const patterns = [
    /(\d+(?:\.\d+)?)\s*m\s*(?:jib|fly\s*jib|fly-jib|swingaway|swing-away|extension)/i,
    /(?:jib|fly\s*jib|fly-jib|swingaway|swing-away|extension)\s*(?:-|–|—|:)?\s*(\d+(?:\.\d+)?)\s*m/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseDecimal(match[1]);
      if (parsed && parsed > 0) return parsed;
    }
  }
  return null;
}

function normaliseRangePhysicalJibLength(rawValue: number | null, radiusM: number | null, boomLengthM: number | null, inferredValue: number | null) {
  const raw = rawValue && rawValue > 0 ? rawValue : null;
  const inferred = inferredValue && inferredValue > 0 ? inferredValue : null;
  if (!raw) return inferred ?? 0;

  const tooLargeForBoom = Boolean(boomLengthM && raw > boomLengthM * 1.05);
  const tooLargeForRadius = Boolean(radiusM && raw > radiusM * 1.35);
  if ((tooLargeForBoom || tooLargeForRadius) && inferred && inferred < raw) return inferred;

  return raw;
}

function rangeChartCalculated(sections: StringMap) {
  const radiusM = rangeNumber(sections, "range_chart_radius_m", 12);
  const tipHeightM = rangeNumber(sections, "range_chart_tip_height_m", 10);
  const objectDistanceM = rangeNumber(sections, "range_chart_object_distance_m", Math.max(0, radiusM - 4));
  const objectHeightM = rangeNumber(sections, "range_chart_object_height_m", Math.max(1, tipHeightM - 2));
  const objectWidthM = rangeNumber(sections, "range_chart_object_width_m", 8);
  const savedSelectedSetupLabel = rangeText(sections, "range_chart_selected_setup_label", rangeText(sections, "selected_crane_setup_label", ""));
  const craneName = tidyCraneLabel(rangeText(sections, "range_chart_crane_name", ""));
  const savedSetupKey = rangeText(sections, "range_chart_selected_setup_key", rangeText(sections, "selected_crane_setup_key", ""));
  const savedJibKey = rangeText(sections, "range_chart_selected_jib_option_key", "");
  const specOptions = getRangeChartSpecOptions({ craneName });
  const structuredKey = savedSetupKey.startsWith("profile:") ? savedSetupKey.slice("profile:".length) : savedSetupKey;
  const activeStructuredProfile = specOptions.profileOptions.find((profile) => profile.key === structuredKey) ?? null;
  const activeStructuredJib = specOptions.jibOptions.find((jib) => jib.key === savedJibKey) ?? null;
  const selectedSetupLabel = activeStructuredProfile?.label || savedSelectedSetupLabel;
  const selectedJibLabel = activeStructuredJib?.label || rangeText(sections, "range_chart_selected_jib_option_label", "");
  const sourceLabel = [
    sections.range_chart_selected_setup_source,
    activeStructuredProfile?.source,
    sections.range_chart_selected_jib_option_source,
    activeStructuredJib?.source,
    sections.range_chart_capacity_source,
    sections.range_chart_external_spec_document_title,
  ].filter(Boolean).join(" / ");
  const setupLabelForChart = [selectedSetupLabel, selectedJibLabel].filter(Boolean).join(" / ");
  const limits = getRangeChartLimits({ craneName, setupLabel: setupLabelForChart, sourceLabel });
  const savedBoomLengthMForJib = parseDecimal(sections.range_chart_boom_length_m);
  const inferredJibLengthM = inferRangePhysicalJibLengthFromText(setupLabelForChart);
  const rawJibLengthM = rangeNumber(sections, "range_chart_jib_length_m", 0);
  const jibLengthM = normaliseRangePhysicalJibLength(rawJibLengthM, radiusM, savedBoomLengthMForJib, inferredJibLengthM);
  const jibAngleDeg = rangeNumber(sections, "range_chart_jib_angle_deg", 0);
  const pivotHeight = 1.1;
  const jibAngleRad = (jibAngleDeg * Math.PI) / 180;
  const hookX = radiusM;
  const hookY = tipHeightM;
  const boomEndX = Math.max(0.1, hookX - (jibLengthM > 0 ? jibLengthM * Math.cos(jibAngleRad) : 0));
  const boomEndY = Math.max(pivotHeight, hookY - (jibLengthM > 0 ? jibLengthM * Math.sin(jibAngleRad) : 0));
  const calculatedBoomLength = Math.sqrt(Math.pow(boomEndX, 2) + Math.pow(boomEndY - pivotHeight, 2));
  const calculatedBoomAngle = (Math.atan2(boomEndY - pivotHeight, boomEndX) * 180) / Math.PI;
  const storedBoomLengthM = rangeNumber(sections, "range_chart_boom_length_m", calculatedBoomLength);
  const storedBoomAngleDeg = rangeNumber(sections, "range_chart_boom_angle_deg", calculatedBoomAngle);
  const selectedChartBoomLengthM = activeStructuredProfile?.defaultBoomLengthM ?? null;
  // The saved structured profile is an exact load-chart column. Keep that selected chart boom
  // length throughout the issued pack, while still using the larger true geometry requirement
  // if the planned hook point cannot physically be reached by the selected duty.
  const boomLengthM = Math.max(selectedChartBoomLengthM || 0, storedBoomLengthM || 0, calculatedBoomLength || 0) || calculatedBoomLength;
  const boomAngleDeg = Math.abs(boomLengthM - calculatedBoomLength) <= 0.1 ? calculatedBoomAngle : storedBoomAngleDeg;
  const clearanceM = rangeNumber(sections, "range_chart_clearance_m", hookY - objectHeightM);
  const loadWeightKg = rangeKg(sections, "range_chart_load_weight_kg");
  const accessoryWeightKg = rangeKg(sections, "range_chart_accessory_weight_kg");
  const totalLiftedWeightKg = rangeKg(sections, "range_chart_total_lifted_weight_kg") ?? ((loadWeightKg ?? 0) + (accessoryWeightKg ?? 0) || null);
  const capacityResult = calculateRangeChartCapacity({
    craneName,
    setupLabel: setupLabelForChart,
    sourceLabel,
    radiusM,
    boomLengthM,
    jibLengthM,
    jibAngleDeg,
    totalLiftedWeightKg,
  });
  const bearingResult = calculateRangeChartBearingLoad({ craneName, setupLabel: setupLabelForChart, sourceLabel, totalLiftedWeightKg });
  const requiredBoomExceededForCapacity = Boolean(limits.maxBoomLengthM && boomLengthM > limits.maxBoomLengthM + 0.01);
  const radiusExceededForCapacity = Boolean(limits.maxRadiusM && radiusM > limits.maxRadiusM + 0.01);
  const tipHeightExceededForCapacity = Boolean(limits.maxTipHeightM && tipHeightM > limits.maxTipHeightM + 0.01);
  const jibExceededForCapacity = Boolean(limits.maxPhysicalJibLengthM && jibLengthM > limits.maxPhysicalJibLengthM + 0.01);
  const geometryInvalidForAutoCapacity = requiredBoomExceededForCapacity || radiusExceededForCapacity || tipHeightExceededForCapacity || jibExceededForCapacity;
  const savedChartCapacityKg = rangeKg(sections, "range_chart_chart_capacity_kg");
  // The issued PDF is a record of the AP-saved duty. Do not silently replace a saved chart
  // capacity during rendering with a newly calculated value; new/edited plans are recalculated
  // and validated in the builder before they can be approved or finalised.
  const chartCapacityKg = savedChartCapacityKg && savedChartCapacityKg > 0
    ? savedChartCapacityKg
    : (geometryInvalidForAutoCapacity ? null : capacityResult.capacityKg);
  const savedUtilisationPercent = parseDecimal(sections.range_chart_utilisation_percent);
  const utilisationPercent = savedUtilisationPercent !== null
    ? savedUtilisationPercent
    : (totalLiftedWeightKg && chartCapacityKg ? (totalLiftedWeightKg / chartCapacityKg) * 100 : null);
  const matLengthM = rangeNumber(sections, "range_chart_mat_length_m", parseDecimal(sections.ground_bearing_mat_length_m) ?? 0);
  const matWidthM = rangeNumber(sections, "range_chart_mat_width_m", parseDecimal(sections.ground_bearing_mat_width_m) ?? 0);
  const matCount = Math.max(1, Math.round(parseDecimal(sections.range_chart_mats_under_loaded_outrigger) ?? parseDecimal(sections.ground_bearing_mats_under_loaded_outrigger) ?? 1));
  const enteredMatSpread = hasEnteredMatSpread(matLengthM, matWidthM);
  const singleMatAreaM2 = enteredMatSpread && matLengthM && matWidthM ? matLengthM * matWidthM : null;
  const matAreaM2 = singleMatAreaM2 ? singleMatAreaM2 * matCount : null;
  const bearingLoadKg = rangeKg(sections, "range_chart_bearing_load_kg") ?? parseWeightToKg(sections.ground_bearing_bearing_load) ?? bearingResult.bearingLoadKg;
  const calculatedBearingPressureKgM2 = bearingLoadKg && matAreaM2 ? bearingLoadKg / matAreaM2 : null;
  const bearingPressureKgM2 = calculatedBearingPressureKgM2;
  const bearingPressure = bearingPressureKgM2 ? `${bearingPressureKgM2.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg/m² / ${(bearingPressureKgM2 / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t/m²` : "—";
  const estimatedBearingFactor = limits.estimatedBearingFactor ?? 0.75;
  const planningEstimateKg = limits.planningWeightKg && totalLiftedWeightKg
    ? (limits.planningWeightKg + totalLiftedWeightKg) * estimatedBearingFactor
    : null;
  const bearingSourceLower = String(bearingResult.source ?? "").toLowerCase();
  const isPublishedBearingReference = Boolean(bearingLoadKg && /published|static outrigger|outrigger load|reaction/.test(bearingSourceLower));
  const bearingPressureFormula = bearingLoadKg && isPublishedBearingReference
    ? [
        `Manufacturer/supplier outrigger reaction/load reference used: ${formatRangeKg(bearingLoadKg)}`,
        planningEstimateKg ? `Planning estimate would be (${formatRangeKg(limits.planningWeightKg)} + ${formatRangeKg(totalLiftedWeightKg)}) × ${estimatedBearingFactor} = ${formatRangeKg(planningEstimateKg)}` : "",
      ].filter(Boolean).join(". ")
    : bearingLoadKg && planningEstimateKg
      ? `(${formatRangeKg(limits.planningWeightKg)} + ${formatRangeKg(totalLiftedWeightKg)}) × ${estimatedBearingFactor} = ${formatRangeKg(bearingLoadKg)}`
      : bearingLoadKg
        ? `Worst-case outrigger load = ${formatRangeKg(bearingLoadKg)}`
        : "Worst-case outrigger load requires crane and load details";

  return {
    radiusM,
    tipHeightM,
    objectDistanceM,
    objectHeightM,
    objectWidthM,
    jibLengthM,
    jibAngleDeg,
    pivotHeight,
    hookX,
    hookY,
    boomEndX,
    boomEndY,
    boomLengthM,
    boomAngleDeg,
    clearanceM,
    loadWeightKg,
    accessoryWeightKg,
    totalLiftedWeightKg,
    chartCapacityKg,
    utilisationPercent,
    matLengthM,
    matWidthM,
    matCount,
    singleMatAreaM2,
    matAreaM2,
    bearingLoadKg,
    bearingPressure,
    bearingPressureKgM2,
    bearingPressureFormula,
    capacityMethod: rangeText(sections, "range_chart_capacity_method", capacityResult.method),
    capacitySource: rangeText(sections, "range_chart_capacity_source", capacityResult.source),
    bearingMethod: rangeText(sections, "range_chart_bearing_method", bearingResult.method),
    bearingSource: rangeText(sections, "range_chart_bearing_source", bearingResult.source),
    // Internal CRM warnings are intentionally not printed on downloaded lift-plan packs.
    // The live builder still shows warnings to the AP/office user.
    limitWarning: "",
    capacityWarning: "",
    bearingWarning: "",
    limits,
  };
}


type PackAdditionalCraneEntry = {
  id?: string;
  crane_name?: string;
  crane_role?: string;
  planned_use?: string;
  setup_profile?: string;
  boom_length_m?: string;
  radius_m?: string;
  hook_height_m?: string;
  crane_gross_weight_kg?: string;
  load_share_kg?: string;
  accessory_weight_kg?: string;
  chart_capacity_kg?: string;
  mat_length_m?: string;
  mat_width_m?: string;
  mat_count?: string;
  mats_under_loaded_outrigger?: string;
  spec_sheet_reference?: string;
  verification_notes?: string;
  selected_profile_key?: string;
  selected_jib_key?: string;
};

function parseAdditionalCraneEntries(value: unknown): PackAdditionalCraneEntry[] {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id ?? ""),
        crane_name: String(item?.crane_name ?? item?.craneName ?? ""),
        crane_role: String(item?.crane_role ?? item?.craneRole ?? ""),
        planned_use: String(item?.planned_use ?? item?.plannedUse ?? ""),
        setup_profile: String(item?.setup_profile ?? item?.setupProfile ?? ""),
        boom_length_m: String(item?.boom_length_m ?? item?.boomLengthM ?? ""),
        radius_m: String(item?.radius_m ?? item?.radiusM ?? ""),
        hook_height_m: String(item?.hook_height_m ?? item?.hookHeightM ?? ""),
        crane_gross_weight_kg: String(item?.crane_gross_weight_kg ?? item?.craneGrossWeightKg ?? ""),
        load_share_kg: String(item?.load_share_kg ?? item?.loadShareKg ?? ""),
        accessory_weight_kg: String(item?.accessory_weight_kg ?? item?.accessoryWeightKg ?? ""),
        chart_capacity_kg: String(item?.chart_capacity_kg ?? item?.chartCapacityKg ?? ""),
        mat_length_m: String(item?.mat_length_m ?? item?.matLengthM ?? ""),
        mat_width_m: String(item?.mat_width_m ?? item?.matWidthM ?? ""),
        mat_count: String(item?.mat_count ?? item?.matCount ?? ""),
        mats_under_loaded_outrigger: String(item?.mats_under_loaded_outrigger ?? item?.matsUnderLoadedOutrigger ?? item?.mat_count ?? item?.matCount ?? ""),
        spec_sheet_reference: String(item?.spec_sheet_reference ?? item?.specSheetReference ?? ""),
        verification_notes: String(item?.verification_notes ?? item?.verificationNotes ?? ""),
        selected_profile_key: String(item?.selected_profile_key ?? item?.selectedProfileKey ?? ""),
        selected_jib_key: String(item?.selected_jib_key ?? item?.selectedJibKey ?? ""),
      }))
      .filter((item) => Object.values(item).some((value) => String(value ?? "").trim().length > 0));
  } catch {
    return [];
  }
}

function additionalCraneNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function additionalCraneCalc(crane: PackAdditionalCraneEntry, primary: ReturnType<typeof rangeChartCalculated> | null) {
  const craneName = tidyDisplayLabel(crane.crane_name || "");
  const specOptions = getRangeChartSpecOptions({ craneName, setupLabel: crane.setup_profile, sourceLabel: crane.spec_sheet_reference });
  const selectedProfile = crane.selected_profile_key
    ? specOptions.profileOptions.find((option) => option.key === crane.selected_profile_key) ?? null
    : specOptions.profileOptions.find((option) => crane.setup_profile && option.label === crane.setup_profile) ?? specOptions.profileOptions[0] ?? null;
  const selectedJib = crane.selected_jib_key
    ? specOptions.jibOptions.find((option) => option.key === crane.selected_jib_key) ?? null
    : specOptions.jibOptions.find((option) => crane.setup_profile && crane.setup_profile.toLowerCase().includes(option.label.toLowerCase())) ?? null;

  const setupLabel = [selectedProfile?.label || crane.setup_profile || "", selectedJib?.label && !/^no jib/i.test(selectedJib.label) ? selectedJib.label : ""].filter(Boolean).join(" / ");
  const limits = getRangeChartLimits({
    craneName,
    setupLabel,
    sourceLabel: selectedProfile?.source || selectedJib?.source || crane.spec_sheet_reference,
    setupMaxBoomLengthM: selectedProfile?.maxBoomLengthM ?? selectedProfile?.defaultBoomLengthM ?? null,
    setupMaxRadiusM: selectedJib?.maxRadiusM ?? selectedProfile?.maxRadiusM ?? null,
    setupMaxTipHeightM: selectedJib?.maxTipHeightM ?? selectedProfile?.maxTipHeightM ?? null,
    setupMaxPhysicalJibLengthM: selectedJib?.lengthM ?? null,
  });

  const enteredBoomLengthM = additionalCraneNumber(crane.boom_length_m);
  const maxBoomLengthM = selectedProfile?.maxBoomLengthM ?? selectedProfile?.defaultBoomLengthM ?? limits.maxBoomLengthM ?? null;
  const boomLengthM = enteredBoomLengthM && maxBoomLengthM ? Math.min(enteredBoomLengthM, maxBoomLengthM) : enteredBoomLengthM ?? selectedProfile?.defaultBoomLengthM ?? selectedProfile?.maxBoomLengthM ?? limits.maxBoomLengthM ?? null;
  const boomClamped = Boolean(enteredBoomLengthM && maxBoomLengthM && enteredBoomLengthM > maxBoomLengthM);
  const radiusM = additionalCraneNumber(crane.radius_m) ?? primary?.radiusM ?? null;
  const hookHeightM = additionalCraneNumber(crane.hook_height_m) ?? primary?.tipHeightM ?? null;
  const grossKg = additionalCraneNumber(crane.crane_gross_weight_kg) ?? limits.planningWeightKg ?? null;
  const loadKg = additionalCraneNumber(crane.load_share_kg) ?? primary?.loadWeightKg ?? 0;
  const accessoryKg = additionalCraneNumber(crane.accessory_weight_kg) ?? primary?.accessoryWeightKg ?? 0;
  const totalLiftedKg = loadKg + accessoryKg;
  const jibLengthM = selectedJib?.lengthM ?? 0;

  const calculatedCapacity = radiusM
    ? calculateRangeChartCapacity({
        craneName,
        setupLabel,
        sourceLabel: selectedProfile?.source || selectedJib?.source || crane.spec_sheet_reference,
        radiusM,
        boomLengthM,
        jibLengthM,
        totalLiftedWeightKg: totalLiftedKg,
      })
    : null;
  const chartCapacityKg = calculatedCapacity?.capacityKg ?? (calculatedCapacity?.allowManualCapacityFallback ? additionalCraneNumber(crane.chart_capacity_kg) : null);
  const matLengthM = additionalCraneNumber(crane.mat_length_m);
  const matWidthM = additionalCraneNumber(crane.mat_width_m);
  const matCount = Math.max(1, Math.round(additionalCraneNumber(crane.mats_under_loaded_outrigger) ?? additionalCraneNumber(crane.mat_count) ?? 1));
  const singleMatAreaM2 = matLengthM && matWidthM ? matLengthM * matWidthM : null;
  const matAreaM2 = singleMatAreaM2 ? singleMatAreaM2 * matCount : null;
  const bearing = calculateRangeChartBearingLoad({
    craneName,
    setupLabel,
    sourceLabel: selectedProfile?.source || selectedJib?.source || crane.spec_sheet_reference,
    totalLiftedWeightKg: totalLiftedKg,
  });
  const bearingLoadKg = bearing.bearingLoadKg ?? (grossKg ? (grossKg + totalLiftedKg) * 0.75 : null);
  const bearingPressureKgM2 = bearingLoadKg && matAreaM2 ? bearingLoadKg / matAreaM2 : null;
  const utilisationPercent = chartCapacityKg && totalLiftedKg > 0 ? (totalLiftedKg / chartCapacityKg) * 100 : null;
  // Do not print internal alternative-crane warning messages on downloaded lift-plan packs.
  // The live system/builder view remains the place for AP checks and warning prompts.
  const warnings: string[] = [];

  return {
    grossKg,
    loadKg,
    accessoryKg,
    totalLiftedKg,
    chartCapacityKg,
    matLengthM,
    matWidthM,
    matCount,
    singleMatAreaM2,
    matAreaM2,
    bearingLoadKg,
    bearingPressureKgM2,
    utilisationPercent,
    boomLengthM,
    radiusM,
    hookHeightM,
    setupLabel,
    specReference: selectedProfile?.source || selectedJib?.source || crane.spec_sheet_reference,
    warnings,
  };
}

function formatAdditionalCraneValue(value: unknown, suffix = "") {
  const text = String(value ?? "").trim();
  if (!text) return "—";
  return suffix && /^-?\d+(\.\d+)?$/.test(text) ? `${text}${suffix}` : text;
}

function formatAdditionalPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 })}%`;
}

function RangeChartPackPage({
  sections,
  headerMonth,
  headerTitle,
  headerSubtitle,
  footerText,
}: {
  sections: StringMap;
  headerMonth?: ReactNode;
  headerTitle?: ReactNode;
  headerSubtitle?: ReactNode;
  footerText?: ReactNode;
}) {
  const calc = rangeChartCalculated(sections);
  const clientName = rangeText(sections, "range_chart_client", "—");
  const craneName = tidyCraneLabel(rangeText(sections, "range_chart_crane_name", "—"));
  const notes = rangeText(sections, "range_chart_notes", "Lift sketch");
  const selectedSetup = rangeText(sections, "range_chart_selected_setup_label", rangeText(sections, "selected_crane_setup_label", "—"));
  const rawSelectedJibOption = rangeText(sections, "range_chart_selected_jib_option_label", "");
  const selectedJibOption = /no\s+jib|main\s+boom\s+only|no\s+separate\s+additive\s+jib/i.test(rawSelectedJibOption)
    ? noJibLabelForCrane(craneName)
    : rawSelectedJibOption;
  const sourceMode = rangeText(sections, "range_chart_crane_source_mode", "selected_crm_crane");
  const sourceLabel = sourceMode === "external_spec_sheet"
    ? rangeText(sections, "range_chart_external_spec_document_title", "External / job-specific crane spec sheet")
    : sourceMode === "manual"
    ? "Selected / AP verified load chart"
    : "Selected CRM crane spec sheets";
  const recommendedSetup = buildRecommendedSetupText({
    craneName,
    radiusM: calc.radiusM,
    tipHeightM: calc.tipHeightM,
    totalLiftedWeightKg: calc.totalLiftedWeightKg,
    selectedSetupLabel: selectedSetup,
    selectedJibLabel: selectedJibOption,
    sourceLabel,
    chartCapacityKg: calc.chartCapacityKg,
    utilisationPercent: calc.utilisationPercent,
  });
  const maxX = Math.max(calc.radiusM + 4, calc.objectDistanceM + calc.objectWidthM + 4, 12);
  const maxY = Math.max(calc.tipHeightM + 4, calc.objectHeightM + 4, 8);
  const viewWidth = 900;
  const viewHeight = 500;
  const left = 68;
  const right = 24;
  const top = 24;
  const bottom = 58;
  const plotW = viewWidth - left - right;
  const plotH = viewHeight - top - bottom;
  const x = (metres: number) => left + (metres / maxX) * plotW;
  const y = (metres: number) => viewHeight - bottom - (metres / maxY) * plotH;
  const majorStep = maxX > 60 ? 10 : maxX > 30 ? 5 : 1;
  const minorStep = majorStep === 1 ? 0.5 : majorStep / 5;
  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];
  for (let value = 0; value <= maxX + 0.001; value += minorStep) verticalLines.push(Number(value.toFixed(2)));
  for (let value = 0; value <= maxY + 0.001; value += minorStep) horizontalLines.push(Number(value.toFixed(2)));
  const pivotX = x(0);
  const pivotY = y(calc.pivotHeight);
  const hookX = x(calc.hookX);
  const hookY = y(calc.hookY);
  const boomEndX = x(calc.boomEndX);
  const boomEndY = y(calc.boomEndY);
  const objectX = x(calc.objectDistanceM);
  const objectY = y(calc.objectHeightM);
  const objectW = Math.max(10, x(calc.objectDistanceM + calc.objectWidthM) - objectX);
  const objectH = y(0) - objectY;
  const groundY = y(0);
  const horizontalGapM = calc.radiusM - calc.objectDistanceM;
  const rawPackJibLength = rangeNumber(sections, "range_chart_jib_length_m", 0);
  const correctedPackJibLength = Math.abs(rawPackJibLength - calc.jibLengthM) > 0.1;
  const requiredBoomExceeded = calc.limits.maxBoomLengthM ? calc.boomLengthM > calc.limits.maxBoomLengthM + 0.01 : false;
  const maxJibExceeded = calc.limits.maxPhysicalJibLengthM ? calc.jibLengthM > calc.limits.maxPhysicalJibLengthM + 0.01 : false;
  const maxRadiusExceeded = calc.limits.maxRadiusM ? calc.radiusM > calc.limits.maxRadiusM + 0.01 : false;
  const maxTipHeightExceeded = calc.limits.maxTipHeightM ? calc.tipHeightM > calc.limits.maxTipHeightM + 0.01 : false;
  const hasChartWarning = calc.clearanceM < 0 || horizontalGapM < 0 || Boolean(calc.utilisationPercent && calc.utilisationPercent > 100) || correctedPackJibLength || requiredBoomExceeded || maxJibExceeded || maxRadiusExceeded || maxTipHeightExceeded || Boolean(calc.limitWarning || calc.capacityWarning || calc.bearingWarning);
  const dangerStroke = hasChartWarning ? "#d12c2c" : "#ea5151";

  return (
    <PageShell
      sectionTitle="Range Chart / Lift Sketch"
      headerTitle={headerTitle}
      headerSubtitle={headerSubtitle}
      headerMonth={headerMonth}
      footerText={footerText}
    >
      <SectionTitle>Range Chart / Lift Sketch</SectionTitle>
      <div style={rangeChartHeaderGrid}>
        <div><strong>Client:</strong> {clientName}</div>
        <div><strong>Crane:</strong> {craneName}</div>
        <div><strong>Main boom/profile:</strong> {selectedSetup}</div>
        <div><strong>Fly jib/extension:</strong> {selectedJibOption || (calc.jibLengthM > 0 ? `${formatRangeNumber(calc.jibLengthM)} physical jib` : noJibLabelForCrane(craneName))}</div>
        <div><strong>Spec source:</strong> {sourceLabel}</div>
        <div style={{ gridColumn: "1 / -1" }}><strong>Notes:</strong> {notes}</div>
      </div>

      <div style={rangeChartFrame}>
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} width="100%" role="img" aria-label="AnnS lift range chart">
          <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="#ffffff" />
          <rect x={left} y={top} width={plotW} height={plotH} fill="#eef7fb" stroke="#d7e7ee" />
          {verticalLines.map((value) => {
            const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
            return <line key={`range-x-${value}`} x1={x(value)} y1={top} x2={x(value)} y2={viewHeight - bottom} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.2 : 0.6} />;
          })}
          {horizontalLines.map((value) => {
            const isMajor = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001;
            return <line key={`range-y-${value}`} x1={left} y1={y(value)} x2={viewWidth - right} y2={y(value)} stroke={isMajor ? "#c3d3db" : "#e1edf2"} strokeWidth={isMajor ? 1.2 : 0.6} />;
          })}
          {verticalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
            <text key={`range-xl-${value}`} x={x(value)} y={viewHeight - bottom + 18} fontSize="10" fill="#4f5d64" textAnchor="middle">{value}</text>
          ))}
          {horizontalLines.filter((value) => Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.001).map((value) => (
            <text key={`range-yl-${value}`} x={left - 8} y={y(value) + 3} fontSize="10" fill="#4f5d64" textAnchor="end">{value}</text>
          ))}
          <rect x={objectX} y={objectY} width={objectW} height={objectH} fill="#36a6c9" opacity="0.95" />
          <line x1={Math.min(objectX, hookX)} y1={objectY} x2={Math.max(objectX, hookX)} y2={objectY} stroke={dangerStroke} strokeWidth="2" />
          <line x1={hookX} y1={Math.min(objectY, hookY)} x2={hookX} y2={Math.max(objectY, hookY)} stroke={dangerStroke} strokeWidth="2" />
          <line x1={pivotX} y1={groundY} x2={hookX} y2={groundY} stroke="#ea5151" strokeWidth="2" />
          <text x={(objectX + hookX) / 2} y={Math.min(objectY, hookY) - 8} fontSize="11" fontWeight="800" fill={dangerStroke} textAnchor="middle">{formatRangeGap(horizontalGapM)}</text>
          <text x={hookX + 10} y={(objectY + hookY) / 2} fontSize="11" fontWeight="800" fill={dangerStroke}>{formatRangeClearance(calc.clearanceM)}</text>
          <text x={(pivotX + hookX) / 2} y={groundY - 8} fontSize="11" fontWeight="800" fill="#ea5151" textAnchor="middle">{formatRangeNumber(calc.radiusM)}</text>
          <g transform={`translate(${pivotX - 54} ${groundY - 25})`}>
            <rect x="0" y="15" width="78" height="18" rx="4" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.2" />
            <rect x="18" y="0" width="27" height="18" rx="3" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.2" />
            <rect x="47" y="11" width="32" height="9" rx="2" fill="#f6a31a" stroke="#8d6500" strokeWidth="1.2" />
            <line x1="-8" y1="35" x2="92" y2="35" stroke="#6f6f6f" strokeWidth="6" strokeLinecap="round" />
            <circle cx="16" cy="39" r="8" fill="#858585" stroke="#4f4f4f" />
            <circle cx="51" cy="39" r="8" fill="#858585" stroke="#4f4f4f" />
            <circle cx="76" cy="39" r="8" fill="#858585" stroke="#4f4f4f" />
            <line x1="52" y1="14" x2="66" y2="-8" stroke="#f6a31a" strokeWidth="7" strokeLinecap="round" />
            <line x1="52" y1="14" x2="66" y2="-8" stroke="#8d6500" strokeWidth="1.7" strokeLinecap="round" />
          </g>
          <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#777" strokeWidth="8" strokeLinecap="round" />
          <line x1={pivotX} y1={pivotY} x2={boomEndX} y2={boomEndY} stroke="#4a4a4a" strokeWidth="2" strokeLinecap="round" />
          {calc.jibLengthM > 0 ? <line x1={boomEndX} y1={boomEndY} x2={hookX} y2={hookY} stroke="#777" strokeWidth="5" strokeLinecap="round" /> : null}
          {calc.jibLengthM > 0 ? <circle cx={boomEndX} cy={boomEndY} r="5" fill="#e11d1d" /> : null}
          <circle cx={hookX} cy={hookY} r="8" fill="#e11d1d" stroke="#940c0c" strokeWidth="2" />
          <line x1={hookX} y1={hookY} x2={hookX} y2={hookY + 24} stroke="#333" strokeWidth="2" />
          <rect x={left} y={viewHeight - bottom} width={plotW} height="2" fill="#4f5d64" />
          <rect x={left} y={top} width="2" height={plotH} fill="#4f5d64" />
        </svg>
      </div>


      <div style={rangeMetricGrid}>
        <MetricBox label="Boom Length" value={formatRangeBoomLength(calc)} />
        <MetricBox label="Boom Angle" value={formatRangeNumber(calc.boomAngleDeg, "°")} />
        <MetricBox label="Radius" value={formatRangeNumber(calc.radiusM)} />
        <MetricBox label="Tip Height" value={formatRangeNumber(calc.tipHeightM)} />
        <MetricBox label="Physical Jib Length" value={formatRangeNumber(calc.jibLengthM)} />
        <MetricBox label="Jib Angle" value={formatRangeNumber(calc.jibAngleDeg, "°")} />
        <MetricBox label="Object Distance" value={formatRangeNumber(calc.objectDistanceM)} />
        <MetricBox label="Object Height" value={formatRangeNumber(calc.objectHeightM)} />
        <MetricBox label="Clearance" value={formatRangeNumber(calc.clearanceM)} />
        <MetricBox label="Load Weight" value={formatRangeKg(calc.loadWeightKg)} />
        <MetricBox label="Accessory Weight" value={formatRangeKg(calc.accessoryWeightKg)} />
        <MetricBox label="Total Lifted Weight" value={formatRangeKg(calc.totalLiftedWeightKg)} />
        <MetricBox label="Recommended Setup" value={recommendedSetup} />
        <MetricBox label="Chart Capacity" value={formatRangeKg(calc.chartCapacityKg)} />
        <MetricBox label="Capacity Source" value={buildPackCapacitySourceText(calc.capacityMethod)} />
        <MetricBox label="Chart Utilisation" value={calc.utilisationPercent ? `${Number(calc.utilisationPercent).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%` : "—"} />
        {calc.matAreaM2 ? <MetricBox label="Additional Spreader Area" value={formatAreaM2(calc.matAreaM2)} /> : null}
        <MetricBox label="Bearing Load / Reaction" value={formatRangeKg(calc.bearingLoadKg)} />
        {calc.bearingPressureKgM2 ? <MetricBox label="Additional Spreader Pressure" value={calc.bearingPressure} /> : null}
        <MetricBox label="Ground-Loading Formula" value={calc.bearingPressureFormula} />
      </div>

    </PageShell>
  );
}

function MetricBox({ label, value }: { label: string; value: ReactNode }) {
  return <div style={rangeMetricBox}><div style={rangeMetricLabel}>{label}</div><div style={rangeMetricValue}>{value}</div></div>;
}


function defaultSectionText(
  sections: StringMap,
  key: keyof StringMap,
  fallback: string
) {
  const value = sections[key];
  const selected = value && String(value).trim() ? String(value).trim() : fallback;
  return tidyRepeatedTextBlock(selected);
}

function currentCraneSectionText(
  sections: StringMap,
  key: keyof StringMap,
  fallback: string,
  currentCraneName: unknown
) {
  const saved = sections[key];
  const safeSaved = currentCraneSafeText(saved, currentCraneName);
  const selected = safeSaved || fallback;
  return sanitiseCurrentCranePackText(selected, currentCraneName);
}

function currentCraneFieldText(
  sections: StringMap,
  key: keyof StringMap,
  fallback: string,
  currentCraneName: unknown
) {
  const saved = sections[key];
  const safeSaved = currentCraneSafeText(saved, currentCraneName);
  return sanitiseCurrentCranePackText(safeSaved || fallback, currentCraneName);
}

function safeAppendixTitleForCurrentCrane(asset: PackAppendixAssetItem, currentCraneName: unknown, index: number) {
  const rawTitle = String(asset.title ?? "").trim();
  if (rawTitle && !textMentionsDifferentKnownCrane(rawTitle, currentCraneName)) return rawTitle;
  const craneName = tidyDisplayLabel(currentCraneName) || "Selected crane";
  const pageNumber = asset.page_number ? `page ${asset.page_number}` : `appendix ${index}`;
  return `${craneName} specification / chart ${pageNumber}`;
}

function safeAppendixDescriptionForCurrentCrane(asset: PackAppendixAssetItem, currentCraneName: unknown) {
  const raw = String(asset.description ?? "").trim();
  return textMentionsDifferentKnownCrane(raw, currentCraneName) ? "Specification / chart page" : raw;
}

function EditableInput({
  name,
  defaultValue,
  align = "left",
  emptyPrintValue = "—",
}: {
  name: string;
  defaultValue: string;
  align?: "left" | "right";
  emptyPrintValue?: string;
}) {
  const printValue = defaultValue && String(defaultValue).trim() ? defaultValue : emptyPrintValue;

  return (
    <span className="editable-value-wrap" style={editableValueWrapStyle}>
      <input
        className="editable-control"
        name={name}
        defaultValue={defaultValue}
        spellCheck={false}
        style={{
          ...inlineInputStyle,
          textAlign: align,
        }}
      />
      <span
        className="print-value"
        style={{
          ...printValueStyle,
          textAlign: align,
        }}
      >
        {printValue}
      </span>
    </span>
  );
}

function EditableTextarea({
  name,
  defaultValue,
  rows = 4,
  compact = false,
}: {
  name: string;
  defaultValue: string;
  rows?: number;
  compact?: boolean;
}) {
  const printValue = defaultValue && String(defaultValue).trim() ? defaultValue : "—";

  return (
    <span className="editable-value-wrap" style={editableValueWrapStyle}>
      <textarea
        className="editable-control"
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        spellCheck={false}
        style={{
          ...inlineTextareaStyle,
          minHeight: compact ? undefined : rows * 22,
        }}
      />
      <span
        className="print-value print-value-multiline"
        style={printValueStyle}
      >
        {printValue}
      </span>
    </span>
  );
}

function isAppendixImageDocument(doc: any) {
  const mime = String(doc?.file_type ?? "").toLowerCase();
  const name = String(doc?.file_name ?? "").toLowerCase();
  const documentType = String(doc?.document_type ?? "").toLowerCase();

  const looksLikeImage =
    mime.startsWith("image/") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif");

  // Site drawings can be PDFs. Do not render a PDF through an <img> tag because it creates
  // blank/broken appendix pages in the printed lift-plan pack. PDF/spec pages should only be
  // included through generated preview images from asset_document_previews.
  return looksLikeImage || (documentType === "photo" && !name.endsWith(".pdf"));
}

function parseSelectedAppendixKeys(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function appendixKey(asset: PackAppendixAssetItem, index: number) {
  return asset.key || `${asset.source_type ?? "appendix"}:${asset.source_document_id ?? asset.title}:${asset.page_number}:${index}`;
}

function storagePathCandidates(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return [] as string[];

  const candidates: string[] = [];

  function add(candidate: string) {
    const cleaned = String(candidate ?? "")
      .trim()
      .split("?")[0]
      .replace(/^\/+/, "")
      .replace(/^job-documents\//i, "");
    if (!cleaned || /^https?:\/\//i.test(cleaned)) return;
    if (!candidates.includes(cleaned)) candidates.push(cleaned);
    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded && !candidates.includes(decoded)) candidates.push(decoded);
    } catch {
      // Keep the original path if it is not URI encoded.
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const markers = [
        "/storage/v1/object/public/job-documents/",
        "/storage/v1/object/sign/job-documents/",
        "/storage/v1/object/authenticated/job-documents/",
      ];
      for (const marker of markers) {
        const index = url.pathname.indexOf(marker);
        if (index >= 0) {
          add(url.pathname.slice(index + marker.length));
        }
      }
    } catch {
      // Fall through to raw path handling below.
    }
  }

  add(raw);
  return candidates;
}

async function signedJobDocumentMap(paths: string[]) {
  const supabase = createSupabaseServerClient();
  const pathCandidates = paths.map((path) => ({
    raw: String(path ?? ""),
    candidates: storagePathCandidates(path),
  })).filter((item) => item.raw && item.candidates.length);

  const candidatePaths = Array.from(new Set(pathCandidates.flatMap((item) => item.candidates)));
  if (!candidatePaths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from("job-documents")
    .createSignedUrls(candidatePaths, 60 * 60);

  if (error || !data) return new Map<string, string>();

  const signedByCandidate = new Map<string, string>();
  for (const row of data) {
    if (row.path && row.signedUrl) {
      signedByCandidate.set(String(row.path), String(row.signedUrl));
    }
  }

  const out = new Map<string, string>();
  for (const item of pathCandidates) {
    const signed = item.candidates.map((candidate) => signedByCandidate.get(candidate)).find(Boolean);
    if (signed) out.set(item.raw, signed);
  }
  return out;
}


function appendixDedupeKey(asset: PackAppendixAssetItem) {
  const title = normaliseDuplicateKey(String(asset.title ?? ""));
  const doc = String(asset.source_document_id ?? "").trim();
  const page = String(asset.page_number ?? "").trim();
  const image = String(asset.image_url ?? "").split("?")[0];
  return [doc || title, page, image || title].join(":");
}

function dedupeAppendixAssets(items: PackAppendixAssetItem[]) {
  const seen = new Set<string>();
  const out: PackAppendixAssetItem[] = [];
  for (const item of items) {
    const key = appendixDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export default async function CraneLiftPlanPackPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { saved?: string; error?: string };
}) {
  const supabase = createSupabaseServerClient();

  const [{ data: job }, { data: liftPlan }, { data: jobDocuments }] = await Promise.all([
    supabase
      .from("jobs")
      .select(`
        id,
        job_number,
        job_date,
        start_date,
        end_date,
        start_time,
        end_time,
        site_name,
        site_address,
        contact_name,
        contact_phone,
        hire_type,
        lift_type,
        notes,
        clients:client_id (
          company_name
        ),
        cranes:crane_id (
          id,
          name,
          make,
          model,
          capacity,
          reg_number
        ),
        operators:operator_id (
          id,
          full_name
        ),
        main_operator:main_operator_id (
          id,
          full_name
        ),
        job_equipment (
          id,
          asset_type,
          source_type,
          item_name,
          start_date,
          end_date,
          start_time,
          end_time,
          crane_id,
          operator_id,
          cranes:crane_id (
            id,
            name,
            make,
            model,
            capacity,
            reg_number
          ),
          operators:operator_id (
            id,
            full_name
          )
        )
      `)
      .eq("id", params.id)
      .single(),
    supabase.from("lift_plans").select("*").eq("job_id", params.id).maybeSingle(),
    supabase
      .from("job_documents")
      .select("id, file_name, file_path, file_type, document_type, created_at")
      .eq("job_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  let sections: StringMap =
    ((liftPlan as any)?.pack_sections as Record<string, string | null> | null) ?? {};
  const includeRangeChartPage = rangeChartIsEnabled(sections);
  const additionalCraneEntries = parseAdditionalCraneEntries(sections.additional_cranes_json);
  const multiCraneEnabled = sections.multi_crane_enabled === "true" || additionalCraneEntries.length > 0;
  const client = flatten((job as any)?.clients)[0] ?? null;
  await attachCraneSpecDocumentsToJob(supabase, job as any);

  const selectedJob = {
    ...(job as any),
    selected_job_equipment_id: (liftPlan as any)?.selected_job_equipment_id ?? null,
    selected_crane_id: (liftPlan as any)?.selected_crane_id ?? null,
    pack_sections: (liftPlan as any)?.pack_sections ?? null,
  };
  const primary = getPrimaryCraneContext(selectedJob);
  const crane = primary?.crane ?? flatten((job as any)?.cranes)[0] ?? null;
  const allocation = primary?.allocation ?? null;
  const operator =
    primary?.operator ??
    flatten((job as any)?.main_operator)[0] ??
    flatten((job as any)?.operators)[0] ??
    null;

  const equipmentProfile = matchCraneJobEquipmentProfile({
    ...selectedJob,
    cranes: crane ? [crane] : flatten((job as any)?.cranes),
    job_equipment: (job as any)?.job_equipment ?? [],
  });

  const linkedCraneIdForAppendix = realLinkedCraneId(job, liftPlan, primary, crane);
  const craneNameForAppendix = craneLabel(crane, allocation);
  sections = sanitisePackSectionsForCurrentCrane(sections, craneNameForAppendix);
  const craneAppendixContext = {
    craneName: craneNameForAppendix,
    craneMake: (crane as any)?.make ?? null,
    craneModel: (crane as any)?.model ?? null,
    craneCapacity: (crane as any)?.capacity ?? null,
    liftType: (job as any)?.lift_type ?? (job as any)?.hire_type ?? null,
    craneConfiguration: currentCraneSafeText(sections.range_chart_selected_setup_label, craneNameForAppendix) || currentCraneSafeText(sections.boom_configuration, craneNameForAppendix) || currentCraneSafeText(liftPlan?.crane_configuration, craneNameForAppendix),
    loadDescription: String(liftPlan?.method_statement ?? (job as any)?.notes ?? ""),
    notes: [
      (job as any)?.notes,
      sections.range_chart_selected_setup_label,
      sections.range_chart_selected_jib_label,
      sections.range_chart_external_spec_document_title,
    ].filter(Boolean).join(" "),
  };
  const [craneAppendixAssets, jobSpecAppendixAssets] = await Promise.all([
    getCraneAppendixAssetsForPack(linkedCraneIdForAppendix, craneAppendixContext),
    getJobSpecAppendixAssetsForPack(params.id),
  ]);
  const appendixImageDocs = ((jobDocuments as any[]) ?? []).filter(isAppendixImageDocument);
  const jobAppendixAssets: PackAppendixAssetItem[] = appendixImageDocs
    .map((doc: any) => {
      const documentId = String(doc?.id ?? "").trim();
      if (!documentId) return null;
      return {
        title: doc?.file_name || "Uploaded appendix",
        description: String(doc?.document_type ?? "").split("_").join(" "),
        // Use the same CRM proxy route as the lift-plan page. This avoids broken
        // pack images for older WhatsApp/site drawing uploads whose stored paths
        // are encoded or saved as public storage URLs.
        image_url: `/api/jobs/${params.id}/documents/${documentId}/preview`,
        page_number: null,
      } as PackAppendixAssetItem;
    })
    .filter(Boolean) as PackAppendixAssetItem[];
  // When the selected crane has its current managed specification attached, do not also
  // print an older job-level copy for the same HK40 family. The previous HK40 document
  // has been removed from the crane record and the newly uploaded correct document must
  // be the sole HK40 technical reference in newly generated/regenerated packs.
  const currentCraneAppendixText = `${craneNameForAppendix} ${(crane as any)?.make ?? ""} ${(crane as any)?.model ?? ""}`.toLowerCase();
  const isSelectedHk40 = /\bhk\s*40\b|tadano\s*faun|faun\s*hk/i.test(currentCraneAppendixText);
  const filteredJobSpecAppendixAssets = isSelectedHk40
    ? jobSpecAppendixAssets.filter((asset) => !/\bhk\s*40\b|tadano\s*faun|faun\s*hk/i.test(`${asset.title ?? ""} ${asset.description ?? ""}`))
    : jobSpecAppendixAssets;
  const specAppendixAssets = [...craneAppendixAssets, ...filteredJobSpecAppendixAssets];
  const selectedAppendixKeys = parseSelectedAppendixKeys(sections.selected_appendix_keys);
  const selectedAppendixKeySet = selectedAppendixKeys === null ? null : new Set(selectedAppendixKeys);
  const selectedSpecAppendixAssets = selectedAppendixKeySet
    ? specAppendixAssets.filter((asset, index) => selectedAppendixKeySet.has(appendixKey(asset, index)))
    : specAppendixAssets;
  const appendixAssets = dedupeAppendixAssets([...selectedSpecAppendixAssets, ...jobAppendixAssets]);

  const clientName = client?.company_name || "the client";
  const printTitle = [
    client?.company_name || "Customer",
    "Lift Plan Pack",
    (job as any)?.job_number ? `Job ${(job as any).job_number}` : null,
  ].filter(Boolean).join(" - ");
  const projectName =
    sections.cover_project ||
    (job as any)?.site_name ||
    `Job ${(job as any)?.job_number ?? ""}`.trim();
  const appointedPerson = liftPlan?.appointed_person || liftPlan?.approved_by || "Shaun Robinson";
  const approvedBy = liftPlan?.approved_by || appointedPerson;
  const liftSupervisor = String(liftPlan?.lift_supervisor ?? "").trim();
  const liftSupervisorField = (key: string, align: "left" | "right" = "left") => {
    const saved = defaultSectionText(sections, key, "");
    return <EditableInput name={key} defaultValue={saved || liftSupervisor} align={align} emptyPrintValue="" />;
  };
  const craneName = craneNameForAppendix;
  const safeLiftPlanCraneConfiguration = currentCraneSafeText(liftPlan?.crane_configuration, craneName);
  const safeBoomConfigurationSection = currentCraneSafeText(sections.boom_configuration, craneName);
  const safeCraneSetupProcedureSection = currentCraneSafeText(sections.crane_setup_procedure, craneName);
  const hasRangeGroundBearingData = Boolean(
    sections.range_chart_bearing_load_kg ||
    sections.range_chart_total_lifted_weight_kg ||
    sections.range_chart_mat_area_m2 ||
    sections.range_chart_bearing_pressure ||
    sections.range_chart_load_weight_kg ||
    sections.range_chart_accessory_weight_kg ||
    sections.range_chart_chart_capacity_kg
  );
  const rangeGroundCalc = hasRangeGroundBearingData ? rangeChartCalculated(sections) : null;
  const rangeLoadWeightKg = rangeGroundCalc?.loadWeightKg ?? parseWeightToKg(liftPlan?.load_weight);
  const rangeAccessoryWeightKg = rangeGroundCalc?.accessoryWeightKg ?? parseWeightToKg(sections.crane_lifting_accessories_weight_text);
  const rangeTotalLiftedWeightKg = rangeGroundCalc?.totalLiftedWeightKg ?? (rangeLoadWeightKg || rangeAccessoryWeightKg ? (rangeLoadWeightKg ?? 0) + (rangeAccessoryWeightKg ?? 0) : null);
  const rangeChartCapacityKg = rangeGroundCalc?.chartCapacityKg ?? null;
  const rangeUtilisationPercent = rangeGroundCalc?.utilisationPercent ?? (rangeTotalLiftedWeightKg && rangeChartCapacityKg ? (rangeTotalLiftedWeightKg / rangeChartCapacityKg) * 100 : null);
  const rangeBearingLoadKg = rangeGroundCalc?.bearingLoadKg ?? null;
  const rangeBearingSource = String(rangeGroundCalc?.bearingSource ?? "").toLowerCase();
  const rangeBearingMethod = String(rangeGroundCalc?.bearingMethod ?? "").toLowerCase();
  const rangeBearingUsesPlanningFormula = rangeBearingMethod === "automatic" && (
    rangeBearingSource.includes("planning estimate") ||
    rangeBearingSource.includes("worst-case ground-bearing") ||
    rangeBearingSource.includes("planning/gross weight") ||
    rangeBearingSource.includes("existing lift-plan formula") ||
    rangeBearingSource.includes("appointed-person mat calculation") ||
    rangeBearingSource.includes("gross lifted load) ×")
  );
  const rangePlanningGrossWeightKg = rangeBearingUsesPlanningFormula && rangeBearingLoadKg && rangeTotalLiftedWeightKg !== null
    ? Math.max(0, (rangeBearingLoadKg / 0.75) - rangeTotalLiftedWeightKg)
    : null;
  const rangeSpecPlanningWeightKg = rangeGroundCalc?.limits?.planningWeightKg ?? null;
  const rangeSelectedJibLabel = String(sections.range_chart_selected_jib_option_label ?? "").trim();
  const rangeSelectedSetupLabel = String(sections.range_chart_selected_setup_label ?? "").trim();
  const currentCraneWeightSpecOptions = getRangeChartSpecOptions({ craneName });
  const currentCraneWeightSetupKey = String(sections.range_chart_selected_setup_key ?? sections.selected_crane_setup_key ?? "").trim();
  const currentCraneWeightStructuredKey = currentCraneWeightSetupKey.startsWith("profile:") ? currentCraneWeightSetupKey.slice("profile:".length) : currentCraneWeightSetupKey;
  const currentCraneWeightProfile = currentCraneWeightSpecOptions.profileOptions.find((profile) => profile.key === currentCraneWeightStructuredKey) ?? null;
  const currentCraneWeightJib = currentCraneWeightSpecOptions.jibOptions.find((jib) => jib.key === String(sections.range_chart_selected_jib_option_key ?? "").trim()) ?? null;
  const currentCraneWeightLimits = getRangeChartLimits({
    craneName,
    setupLabel: [currentCraneWeightProfile?.label || rangeSelectedSetupLabel, currentCraneWeightJib?.label || rangeSelectedJibLabel].filter(Boolean).join(" / "),
    sourceLabel: [
      sections.range_chart_selected_setup_source,
      currentCraneWeightProfile?.source,
      sections.range_chart_selected_jib_option_source,
      currentCraneWeightJib?.source,
      sections.range_chart_capacity_source,
      sections.range_chart_external_spec_document_title,
      sections.selected_crane_spec_source,
    ].filter(Boolean).join(" / "),
  });
  const currentCranePlanningWeightKg = currentCraneWeightLimits.planningWeightKg ?? null;

  const craneCapacity = rangeChartCapacityKg
    ? formatKgAndTonnes(rangeChartCapacityKg)
    : rangeTotalLiftedWeightKg
      ? "Selected / AP verified load chart"
      : formatCapacity(equipmentProfile, crane, craneName);
  const recommendedSetupText = buildRecommendedSetupText({
    craneName,
    radiusM: rangeGroundCalc?.radiusM ?? parseDecimal(sections.range_chart_radius_m),
    tipHeightM: rangeGroundCalc?.tipHeightM ?? parseDecimal(sections.range_chart_tip_height_m),
    totalLiftedWeightKg: rangeTotalLiftedWeightKg,
    selectedSetupLabel: rangeSelectedSetupLabel || currentCraneWeightProfile?.label || sections.selected_crane_setup_label,
    selectedJibLabel: rangeSelectedJibLabel || currentCraneWeightJib?.label,
    sourceLabel: [
      sections.range_chart_selected_setup_source,
      currentCraneWeightProfile?.source,
      sections.range_chart_selected_jib_option_source,
      currentCraneWeightJib?.source,
      sections.range_chart_capacity_source,
      sections.range_chart_external_spec_document_title,
      sections.selected_crane_spec_source,
    ].filter(Boolean).join(" / "),
    chartCapacityKg: rangeChartCapacityKg,
    utilisationPercent: rangeUtilisationPercent,
  });
  const loadWeight = rangeLoadWeightKg ? formatKgOnly(rangeLoadWeightKg) : (liftPlan?.load_weight ? `${liftPlan.load_weight} kg` : "—");
  const accessoryWeight = rangeAccessoryWeightKg ? formatKgOnly(rangeAccessoryWeightKg) : "—";
  const boomConfig = shortBoomConfiguration(
    safeBoomConfigurationSection,
    safeLiftPlanCraneConfiguration,
    equipmentProfile
  );
  const boomLength = shortBoomLength(sections.boom_length, equipmentProfile, craneName);
  const utilisation = rangeUtilisationPercent !== null && rangeUtilisationPercent !== undefined
    ? formatPercentValue(rangeUtilisationPercent)
    : "—";
  const enteredCraneWeightKg = parseWeightToKg(sections.ground_bearing_crane_max_weight || sections.crane_gross_weight) ?? parseWeightToKg(crane?.gross_weight || crane?.grossWeight);
  const craneMaxWeightKg = currentCranePlanningWeightKg ?? rangeSpecPlanningWeightKg ?? enteredCraneWeightKg ?? rangePlanningGrossWeightKg;
  const loadMaxWeightKg = rangeTotalLiftedWeightKg ?? parseWeightToKg(sections.ground_bearing_load_max_weight || liftPlan?.load_weight);
  const combinedMaxWeightKg = craneMaxWeightKg && loadMaxWeightKg ? craneMaxWeightKg + loadMaxWeightKg : null;
  const estimatedGroundBearingKg = rangeBearingLoadKg ?? (craneMaxWeightKg && loadMaxWeightKg ? (craneMaxWeightKg + loadMaxWeightKg) * 0.75 : null);
  const matLengthM = (rangeGroundCalc?.matLengthM && rangeGroundCalc.matLengthM > 0 ? rangeGroundCalc.matLengthM : null) ?? parseDecimal(sections.ground_bearing_mat_length_m);
  const matWidthM = (rangeGroundCalc?.matWidthM && rangeGroundCalc.matWidthM > 0 ? rangeGroundCalc.matWidthM : null) ?? parseDecimal(sections.ground_bearing_mat_width_m);
  const matCount = Math.max(1, Math.round((rangeGroundCalc?.matCount && rangeGroundCalc.matCount > 0 ? rangeGroundCalc.matCount : null) ?? parseDecimal(sections.range_chart_mats_under_loaded_outrigger) ?? parseDecimal(sections.ground_bearing_mats_under_loaded_outrigger) ?? 1));
  const enteredMatSpread = hasEnteredMatSpread(matLengthM, matWidthM);
  const singleMatAreaM2 = enteredMatSpread && matLengthM && matWidthM ? Number((matLengthM * matWidthM).toFixed(3)) : null;
  const matAreaM2 = singleMatAreaM2 ? Number((singleMatAreaM2 * matCount).toFixed(3)) : null;
  const bearingLoadKg = rangeBearingLoadKg ?? parseWeightToKg(sections.ground_bearing_bearing_load) ?? estimatedGroundBearingKg;
  const bearingPressure = rangeGroundCalc?.bearingPressure && rangeGroundCalc.bearingPressure !== "—" ? rangeGroundCalc.bearingPressure : formatBearingPressure(bearingLoadKg, matAreaM2);
  const matSizeText = enteredMatSpread && matLengthM && matWidthM ? `${matLengthM}m x ${matWidthM}m × ${matCount} under worst-case loaded outrigger` : "Mat/spreader dimensions not entered";
  const primaryGroundLoadingFormula = rangeGroundCalc?.bearingPressureFormula || (bearingLoadKg && craneMaxWeightKg && loadMaxWeightKg
    ? `(${formatRangeKg(craneMaxWeightKg)} + ${formatRangeKg(loadMaxWeightKg)}) × 0.75 = ${formatRangeKg(bearingLoadKg)}`
    : "Worst-case outrigger load requires crane and load details");
  const primaryAdditionalSpreaderFormula = enteredMatSpread && bearingLoadKg && matAreaM2 && bearingPressure !== "—"
    ? `${formatRangeKg(bearingLoadKg)} ÷ ${formatAreaM2(matAreaM2)} = ${bearingPressure}`
    : "";
  const scopeFallback = fallbackScope(clientName, projectName, liftPlan, loadWeight);
  const communicationFallback = fallbackCommunication((job as any)?.contact_name || "");
  const methodStatementLines = splitLines(liftPlan?.method_statement);
  const riskLines = splitLines(liftPlan?.risk_assessment);
  const hazardLines = splitLines(liftPlan?.site_hazards);
  const controlLines = splitLines(liftPlan?.control_measures);
  const ppeLines = splitLines(liftPlan?.ppe_required);
  const emergencyContacts = splitLines(sections.emergency_contacts || "").join("\n");
  const equipmentList = splitLines(sections.equipment_list || "").join("\n");
  const toolboxNotes = splitLines(sections.toolbox_notes || "").join("\n");

  const coverProjectText = defaultSectionText(
    sections,
    "cover_project",
    (job as any)?.site_name || `Job ${(job as any)?.job_number ?? ""}`.trim()
  );
  const liftClassificationText = defaultSectionText(
    sections,
    "lift_classification",
    (job as any)?.hire_type || "Basic"
  );
  const rangeHasNoJib = /^(?:no\s+jib|main\s+boom\s+only|no\s+separate\s+additive\s+jib)/i.test(rangeSelectedJibLabel);
  const rangeBoomConfiguration = rangeGroundCalc
    ? currentCraneIsAk46(craneName)
      ? "Main boom / total boom-extension"
      : rangeHasNoJib || !rangeSelectedJibLabel
        ? "Main boom"
        : "Main boom + jib / extension"
    : "";
  const boomConfigurationText = sanitiseCurrentCranePackText(rangeBoomConfiguration || currentCraneSectionText(sections, "boom_configuration", boomConfig, craneName), craneName);
  const boomLengthText = rangeGroundCalc?.boomLengthM ? formatRangeBoomLength(rangeGroundCalc) : currentCraneSectionText(sections, "boom_length", boomLength, craneName);
  const introductionText = defaultSectionText(
    sections,
    "introduction",
    `This lift plan has been prepared from the information supplied by ${clientName}, the site details available at planning stage and the lifting information entered for this job. The lift is to be carried out to this plan, BS 7121, LOLER, PUWER and the relevant crane manufacturer guidance.`
  );
  const clientResponsibilitiesText = defaultSectionText(
    sections,
    "client_responsibilities",
    `The client is to provide accurate load details, suitable access, a suitable standing area for the crane, traffic / pedestrian controls where needed and details of any restrictions, underground services, permits or site rules that may affect the lift. The client remains responsible for the condition of the load and any client-supplied lifting points.`
  );
  const contractLiftArrivalText = defaultSectionText(
    sections,
    "contract_lift_arrival",
    `On arrival, the crane and lifting personnel will report to the site contact, complete any required induction and move to the planned lifting position under supervision. The lift must not start until the lift supervisor has confirmed the crane position, ground support, exclusion zone, communication method and general site conditions are suitable.`
  );
  const rawScopeOfWorksText = defaultSectionText(
    sections,
    "scope_of_works",
    sections.scope_of_works || liftPlan?.load_description || scopeFallback
  );
  const scopeOfWorksText = fixScopeOfWorksForCurrentCrane({
    value: rawScopeOfWorksText,
    fallback: scopeFallback,
    currentCraneName: craneName,
    craneWeightKg: craneMaxWeightKg,
    totalLiftedWeightKg: loadMaxWeightKg,
    bearingLoadKg,
  });
  const communicationText = defaultSectionText(
    sections,
    "communication",
    communicationFallback
  );
  const weatherConditionsText = defaultSectionText(
    sections,
    "weather_conditions",
    sections.weather_conditions || liftPlan?.weather_limitations || equipmentProfile?.weatherNote || `The lift must not proceed in unsafe wind, lightning, heavy rain or poor visibility. Wind speed is to be checked against the crane chart, selected configuration, load shape and site conditions before lifting starts and monitored during the operation.`
  );
  const siteAccessText = defaultSectionText(
    sections,
    "site_access_egress",
    `The client must keep clear and safe access available for the crane, support vehicles and lifting team. The route to and from the set-up position must be suitable for the crane size, weight, width and turning requirements.`
  );
  const groundConditionsText = defaultSectionText(
    sections,
    "ground_conditions",
    sections.ground_conditions || liftPlan?.ground_conditions || `Ground conditions are to be checked on arrival. The crane must be set up on firm, level ground capable of supporting the crane, lifted load and outrigger / stabiliser loads. Mats or additional spreader protection are to be used where required.`
  );
  const overheadText = defaultSectionText(
    sections,
    "overhead_obstructions",
    sections.overhead_obstructions || liftPlan?.site_hazards || `Overhead services, nearby structures, scaffold, plant, trees, public areas and any slewing restrictions must be identified before set-up and controlled throughout the lift.`
  );
  const trafficText = currentCraneSectionText(
    sections,
    "traffic_pedestrian_management",
    liftPlan?.exclusion_zone_details && !textMentionsDifferentKnownCrane(liftPlan.exclusion_zone_details, craneName)
      ? liftPlan.exclusion_zone_details
      : `The lifting area, slewing area and landing zone for ${tidyCraneLabel(craneName)} are to be barriered or controlled. Only authorised personnel involved in the operation are to enter the exclusion zone while the crane is set up, the load is suspended or the lift is taking place.`,
    craneName
  );
  const liftingEquipmentText = defaultSectionText(
    sections,
    "lifting_equipment_certification",
    sections.lifting_equipment_certification || "All lifting accessories must have current certification, be suitable for the load and be visually inspected before use."
  );
  const rawCraneDetailsFallback = equipmentProfile?.summary || `${craneName} to be checked against the current manufacturer specification and load chart.`;
  const craneDetailsFallback = currentCraneIsAk46(craneName)
    ? tidyRepeatedTextBlock(String(rawCraneDetailsFallback)
        .replace(/max\s+capacity\s+26\s*t/gi, "max lifting capacity 6 t")
        .replace(/max\s+capacity\s+26,?000\s*kg/gi, "max lifting capacity 6,000 kg"))
    : rawCraneDetailsFallback;
  const craneDetailsText = currentCraneSectionText(
    sections,
    "crane_details",
    craneDetailsFallback,
    craneName
  );
  const craneSetupBaseText =
    safeCraneSetupProcedureSection ||
    safeLiftPlanCraneConfiguration ||
    equipmentProfile?.configurationNote ||
    `The crane is to be rigged and configured in accordance with the manufacturer instructions, the selected load chart and the approved lift arrangement.`;
  const craneSetupText = tidyRepeatedTextBlock([
    `Recommended crane setup for this lift: ${recommendedSetupText}`,
    craneSetupBaseText,
    `The final crane set-up on site must be checked against the current manufacturer / supplier load chart, LMI, ground conditions and the actual lift arrangement before the load is lifted.`,
  ].filter(Boolean).join("\n\n"));
  const liftingProcedureText = currentCraneSectionText(
    sections,
    "lifting_procedure",
    methodStatementLines.length && !textMentionsDifferentKnownCrane(methodStatementLines.join("\n"), craneName)
      ? methodStatementLines.join("\n")
      : [
          `Attend site at ${projectName} and complete the pre-lift briefing with everyone involved before lifting starts.`,
          `Set out the exclusion zone and confirm the load details, lifting accessories, lift route, landing area and communication method.`,
          `Position ${tidyCraneLabel(craneName)} in the planned location, deploy outriggers / stabilisers on suitable mats or pads and confirm the crane is level and correctly supported before the load is taken.`,
          `The crane configuration, recommended setup, boom length, counterweight / ballast, radius and duty are to be checked against the selected load chart for the actual lift before lifting starts.`,
          `Inspect the lifting accessories, connect the load using the planned certified arrangement, complete a controlled test lift where required and carry out the lift under the direction of the lift supervisor using the agreed signalling method.`,
          `Land the load safely, remove lifting accessories, de-rig the crane in line with the manufacturer instructions and leave the work area safe and tidy.`,
        ].join(" "),
    craneName
  );
  const deRigText = defaultSectionText(
    sections,
    "de_rig_procedure",
    `On completion, the crane operator and lifting team will remove lifting accessories, de-rig the crane in line with the manufacturer instructions, recover mats and barriers and leave the area safe and tidy.`
  );
  const emergencyProcedureText = currentCraneSectionText(
    sections,
    "emergency_procedure",
    liftPlan?.emergency_procedures && !textMentionsDifferentKnownCrane(liftPlan.emergency_procedures, craneName)
      ? liftPlan.emergency_procedures
      : `Stop work immediately if conditions become unsafe, an equipment fault occurs or the load cannot be controlled. Make ${tidyCraneLabel(craneName)} and the load safe where possible, isolate the area, inform site management and contact emergency services if required. Site emergency procedures are to be followed for injury, instability, contact with services or crane failure.`,
    craneName
  );
  const riskSummaryText = currentCraneSectionText(
    sections,
    "risk_assessment_summary",
    riskLines.length && !textMentionsDifferentKnownCrane(riskLines.join("\n"), craneName)
      ? riskLines.join("\n")
      : "Main risks include load drop, sling / accessory failure, crane instability, unsuitable ground, incorrect set-up, collision with structures or personnel, weather changes and unauthorised access to the exclusion zone. Controls include certified lifting accessories, agreed communication, exclusion zones, suitable ground support, pre-lift briefing and checking the selected load chart before lifting.",
    craneName
  );
  const emergencyContactsText = defaultSectionText(sections, "emergency_contacts", emergencyContacts);
  const equipmentListText = defaultSectionText(sections, "equipment_list", equipmentList);
  const toolboxNotesText = defaultSectionText(sections, "toolbox_notes", toolboxNotes);

  const jobPlanningSnapshotText = currentCraneSectionText(
    sections,
    "job_planning_snapshot_text",
    [
      `Client: ${clientName}`,
      `Project: ${coverProjectText}`,
      `Crane: ${craneName}`,
      `Lift Type: ${(job as any)?.lift_type || "—"}`,
      `Site Contact: ${(job as any)?.contact_name || "—"}`,
      `Job Notes: ${(job as any)?.notes || "—"}`,
    ].join("\n"),
    craneName
  );

  const displayStartDate =
    (allocation as any)?.start_date ??
    (job as any)?.start_date ??
    (job as any)?.job_date ??
    null;

  const packMonthLabel = fmtMonthYear(displayStartDate ?? new Date());
  const fieldText = (key: string, fallback: string) => defaultSectionText(sections, key, fallback);
  const packMonthText = (key: string) => {
    const saved = defaultSectionText(sections, key, "");
    if (!saved || saved === "April 2026") return packMonthLabel;
    return saved;
  };
  const inputField = (key: string, fallback: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={fieldText(key, fallback)} align={align} />
  );
  const currentCraneInputField = (key: string, fallback: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={currentCraneFieldText(sections, key, fallback, craneName)} align={align} />
  );
  const calculatedInputField = (key: string, value: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={fieldText(key, value)} align={align} />
  );
  const monthInputField = (key: string, align: "left" | "right" = "left") => (
    <EditableInput name={key} defaultValue={packMonthText(key)} align={align} />
  );
  const areaField = (key: string, fallback: string, rows = 4, compact = false) => (
    <EditableTextarea name={key} defaultValue={fieldText(key, fallback)} rows={rows} compact={compact} />
  );

  const saveOk = String(searchParams?.saved ?? "") === "1";
  const saveError = String(searchParams?.error ?? "").trim();
  const isLocked = Boolean((liftPlan as any)?.paperwork_locked);
  const drawingMachineType: LiftMachineType = /jekko|spider/i.test(
    `${equipmentProfile?.machineType ?? ""} ${craneName}`,
  )
    ? "spider-crane"
    : "mobile-crane";
  const drawingModel = parseLiftDrawingModel(
    sections.lift_drawing_model_json,
    {
      machineType: drawingMachineType,
      machineLabel: craneName,
      drawingNumber: `LP-${params.id.slice(0, 8).toUpperCase()}`,
    },
  );
  const includeTechnicalDrawing = technicalDrawingEnabled(
    sections.include_technical_drawing,
  );
  const drawingSchedule = {
    loadDescription: liftPlan?.load_description,
    loadWeightKg:
      parseDecimal(sections.range_chart_load_weight_kg) ??
      parseDecimal(liftPlan?.load_weight),
    accessoryWeightKg:
      parseDecimal(sections.range_chart_accessory_weight_kg) ?? 0,
    grossLiftedWeightKg:
      parseDecimal(sections.range_chart_total_lifted_weight_kg),
    radiusM:
      parseDecimal(sections.range_chart_radius_m) ??
      parseDecimal(liftPlan?.lift_radius),
    boomLengthM: parseDecimal(sections.range_chart_boom_length_m),
    boomAngleDeg: parseDecimal(sections.range_chart_boom_angle_deg),
    hookHeightM:
      parseDecimal(sections.range_chart_tip_height_m) ??
      parseDecimal(liftPlan?.lift_height),
    chartCapacityKg: parseDecimal(sections.range_chart_chart_capacity_kg),
    chartSource: sections.range_chart_capacity_source,
    chartPage: sections.range_chart_capacity_page,
    utilisationPercent: parseDecimal(sections.range_chart_utilisation_percent),
    exactConfiguration:
      sections.range_chart_selected_setup_label ??
      sections.selected_crane_setup_label ??
      liftPlan?.crane_configuration,
    stabiliserSetup:
      liftPlan?.outrigger_setup ?? sections.configuration_outrigger_note,
    workingSector: drawingModel.technical.workingSector,
    operatingWeightKg: drawingModel.technical.operatingWeightKg,
    groundPressureKgM2:
      parseDecimal(sections.range_chart_bearing_pressure_kg_m2) ??
      drawingModel.technical.groundPressureKgM2,
    matLengthM:
      parseDecimal(sections.range_chart_mat_length_m) ??
      parseDecimal(sections.ground_bearing_mat_length_m),
    matWidthM:
      parseDecimal(sections.range_chart_mat_width_m) ??
      parseDecimal(sections.ground_bearing_mat_width_m),
    liftingAccessories: liftPlan?.lifting_accessories,
    siteHazards: liftPlan?.site_hazards,
    controlMeasures: liftPlan?.control_measures,
  };
  const drawingValidation = validateLiftDrawing(drawingModel, drawingSchedule);
  const drawingIncomplete =
    includeTechnicalDrawing &&
    (drawingModel.status !== "verified" ||
      drawingValidation.errors.length > 0);
  const draftIncomplete =
    !isLocked ||
    !liftPlan?.lift_plan_complete ||
    drawingIncomplete;

  const outreachRef = rangeGroundCalc?.radiusM
    ? `${rangeGroundCalc.radiusM.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m radius`
    : formatOutreachReference(equipmentProfile);
  const jibRef = rangeGroundCalc
    ? rangeHasNoJib || !rangeSelectedJibLabel
      ? noJibLabelForCrane(craneName)
      : rangeSelectedJibLabel
    : formatJibReference(equipmentProfile);

  return (
    <div className={`print-document-root${draftIncomplete ? " draft-incomplete" : ""}`} style={wrapper}>
      <style>{`
        .lift-pack-page { position: relative; }
        .draft-incomplete .lift-pack-page::after {
          content: "DRAFT - TECHNICAL INFORMATION INCOMPLETE - NOT FOR USE";
          position: absolute;
          z-index: 20;
          top: 48%;
          left: -5%;
          width: 110%;
          transform: rotate(-24deg);
          text-align: center;
          font-size: 26px;
          line-height: 1.2;
          font-weight: 950;
          letter-spacing: .04em;
          color: rgba(170, 0, 0, .14);
          pointer-events: none;
        }
        @media screen and (max-width: 760px) {
          .lift-pack-page {
            width: 100% !important;
            min-height: auto !important;
            padding: 14px !important;
            margin: 0 auto 14px auto !important;
          }

          .lift-pack-table-wrap {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .lift-pack-table-wrap table {
            min-width: 620px;
          }
        }

        @media print {
          @page { size: A4; margin: 0; }

          html, body {
            background: white !important;
            width: 210mm !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-hide { display: none !important; }

          .print-document-root {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .lift-pack-page {
            width: 190mm !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 10mm 5mm 8mm 5mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: visible !important;
          }

          .lift-pack-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .editable-control {
            display: none !important;
          }

          .print-value {
            display: block !important;
            width: 100% !important;
            min-height: 0 !important;
            white-space: normal !important;
            overflow: visible !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            font: inherit !important;
            color: #111 !important;
          }

          .print-value-multiline {
            white-space: pre-wrap !important;
            line-height: 1.38 !important;
          }

          .lift-pack-table-wrap { overflow: visible !important; }
          .lift-pack-table-wrap table { min-width: 0 !important; }
        }
      `}</style>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener("input", function (event) {
              var target = event.target;
              if (!target || !target.name) return;
              if (target.name === "pack_edit_changed_keys") return;
              var changedInput = document.getElementById("crane-pack-changed-keys");
              if (changedInput) {
                var changedKeys = [];
                try {
                  changedKeys = JSON.parse(changedInput.value || "[]");
                } catch (error) {
                  changedKeys = [];
                }
                if (changedKeys.indexOf(target.name) === -1) {
                  changedKeys.push(target.name);
                  changedInput.value = JSON.stringify(changedKeys);
                }
              }
              var fields = document.getElementsByName(target.name);
              for (var i = 0; i < fields.length; i += 1) {
                var field = fields[i];
                if (field !== target && "value" in field) {
                  field.value = target.value;
                }
              }
            });
          `,
        }}
      />

      <form action={`/api/jobs/${params.id}/lift-plan/pack-selections`} method="post">
        <input
          id="crane-pack-changed-keys"
          type="hidden"
          name="pack_edit_changed_keys"
          defaultValue="[]"
        />
        <div className="print-hide" style={toolbar}>
          <a href={`/jobs/${params.id}/lift-plan`} style={buttonStyle}>
            ← Back to lift plan
          </a>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="submit" style={isLocked ? { ...saveButtonStyle, opacity: 0.55, cursor: "not-allowed" } : saveButtonStyle} disabled={isLocked}>
              {isLocked ? "Lift plan locked" : "Save pack edits"}
            </button>
            <PrintPackButton printTitle={printTitle} />
          </div>
        </div>

        {isLocked ? (
          <div className="print-hide" style={lockedBannerStyle}>
            This lift plan is locked. Pack fields are read-only on this page until the lock is removed.
          </div>
        ) : null}
        {saveOk ? <div className="print-hide" style={saveOkStyle}>Pack edits saved and the corresponding lift-plan fields were updated.</div> : null}
        {saveError ? <div className="print-hide" style={saveErrorStyle}>{saveError}</div> : null}

      <fieldset disabled={isLocked} style={fieldsetStyle}>
      <PageShell
        sectionTitle={inputField("page_section_cover", "Cover Sheet", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <div style={coverHero}>
          <div>
            <div style={coverTitle}>{inputField("cover_title", "ANNS – LIFTING PLAN – V1")}</div>
            <div style={coverSubtitle}>{monthInputField("cover_subtitle")}</div>
          </div>
          <div style={coverCompany}>
            <div>{inputField("cover_company_line_1", "Anns Crane Hire Ltd", "right")}</div>
            <div>{inputField("cover_company_line_2", "6 Bay St, Port Tennant, Swansea, SA1 8LB", "right")}</div>
            <div>{inputField("cover_company_line_3", "01792 641653 • info@annscranehire.co.uk", "right")}</div>
          </div>
        </div>

        <InfoTable
          rows={[
            [inputField("cover_label_client", "Client"), inputField("cover_client", clientName)],
            [inputField("cover_label_project", "Project"), inputField("cover_project", coverProjectText)],
            [
              inputField("cover_label_start_date", "Start Date"),
              inputField("cover_start_date", fmtDate(displayStartDate ?? (job as any)?.start_date ?? (job as any)?.job_date)),
            ],
            [
              inputField("cover_label_duration", "Duration"),
              inputField(
                "cover_duration",
                calcDuration(
                  (job as any)?.start_date ?? (job as any)?.job_date,
                  (job as any)?.end_date ?? (job as any)?.job_date
                )
              ),
            ],
            [inputField("cover_label_site_address", "Site Address"), areaField("cover_site_address", coverAddress(job), 2, true)],
            [inputField("cover_label_site_contact", "Site Contact"), inputField("cover_site_contact", (job as any)?.contact_name || "—")],
            [inputField("cover_label_appointed_person", "Appointed Person"), inputField("cover_appointed_person", appointedPerson)],
            [inputField("cover_label_prepared_by", "Prepared by"), inputField("cover_prepared_by_value", "ANNS CRANE HIRE LTD")],
            [
              inputField("cover_label_lift_classification", "Lift Classification"),
              inputField("lift_classification", liftClassificationText),
            ],
            [inputField("cover_label_cranes", "Crane(s)"), calculatedInputField("cover_cranes", craneName)],
            [inputField("cover_label_boom_configuration", "Boom configuration"), <EditableTextarea name="boom_configuration" defaultValue={boomConfigurationText} rows={3} compact />],
            [inputField("cover_label_boom_length", "Boom length"), calculatedInputField("boom_length", boomLengthText)],
          ]}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_toc", "Table of Contents", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("toc_title", "Table of Contents")}</SectionTitle>
        <div style={tocGrid}>
          {[
            ["toc_item_1", "1. Introduction"],
            ["toc_item_2", "2. Appointed Person Declaration"],
            ["toc_item_3", "3. Client Responsibilities and General Conditions"],
            ["toc_item_4", "4. The Contract Lift and Arrival on Site"],
            ["toc_item_5", "5. Brief Scope of Works"],
            ["toc_item_6", "6. Lifting Personnel"],
            ["toc_item_7", "7. On Site Communication"],
            ["toc_item_8", "8. Weather Conditions"],
            ["toc_item_9", "9. Site Access and Egress"],
            ["toc_item_10", "10. Ground Conditions"],
            ["toc_item_11", "11. Overhead Obstructions and Slewing Restrictions"],
            ["toc_item_12", "12. Traffic and Pedestrian Management"],
            ["toc_item_13", "13. Lifting Equipment to be used & Certification"],
            ["toc_item_14", "14. Crane Details"],
            ["toc_item_drawing", "Technical Drawing - Plan View & Side Elevation"],
            ["toc_item_15", "15. Variation from Method Statement"],
            ["toc_item_16", "16. Toolbox Talk Attendance"],
            ["toc_item_17", "17. Crane Set-up Procedure"],
            ["toc_item_18", "18. Lifting Procedure"],
            ["toc_item_19", "19. De-Rig Procedure"],
            ["toc_item_20", "20. Emergency Procedure"],
            ["toc_item_21", "21. Risk Assessments"],
            ["toc_item_22", "22. Check Lists and Sign Offs"],
          ].map(([key, item]) => (
            <div key={String(key)} style={tocItem}>
              {inputField(String(key), String(item))}
            </div>
          ))}
          {includeRangeChartPage ? (
            <div style={tocItem}>{inputField("toc_item_range_chart", "Range Chart / Lift Sketch")}</div>
          ) : null}
          {appendixAssets.length ? (
            <div style={tocItem}>{inputField("toc_item_appendix", "Appendix – Selected machine specification and chart pages")}</div>
          ) : null}
        </div>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_1", "1. Introduction", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_1", "1. Introduction")}</SectionTitle>
        <BoxedParagraph title={inputField("method_statement_title", "Method Statement – CPA Contract Lift")}>
          {<EditableTextarea name="introduction" defaultValue={introductionText} rows={8} />}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle={inputField("site_inspection_title", "Site Inspection")}
          leftBody={areaField("site_inspection_text", `A pre-lift planning review must confirm access and egress, crane standing area, ground conditions, exclusion zones, overhead obstructions, public interface, delivery positions and any site-specific restrictions before lifting operations commence.`, 8)}
          rightTitle={inputField("roles_responsibilities_title", "Roles and Responsibilities")}
          rightBody={areaField("roles_responsibilities_text", `The Appointed Person is responsible for the lift planning. The Lift Supervisor is responsible for implementing the plan on site. The Slinger/Signaller is responsible for directing the lift and ensuring correct attachment of lifting accessories. The crane operator must only operate within the approved configuration and under the agreed signalling method.`, 8)}
        />

        <BoxedParagraph title={inputField("job_planning_snapshot_title", "Job Planning Snapshot")} compact>
          {areaField("job_planning_snapshot_text", jobPlanningSnapshotText, 7, true)}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_2_5", "2–5. Planning & Scope", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_2", "2. Appointed Person Declaration")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("ap_decl_label_name", "Name"), inputField("ap_decl_name", appointedPerson)],
            [inputField("ap_decl_label_prepared_for", "Prepared for job"), inputField("ap_decl_prepared_for_job", `#${(job as any)?.job_number ?? "—"}`)],
            [inputField("cover_label_prepared_by", "Prepared by"), inputField("cover_prepared_by_value", "ANNS CRANE HIRE LTD")],
            [inputField("ap_decl_label_approved_by", "Approved by"), inputField("ap_decl_approved_by_value", approvedBy)],
            [inputField("ap_decl_label_approved_at", "Approved at"), inputField("ap_decl_approved_at_value", fmtDateTime(liftPlan?.approved_at))],
          ]}
        />

        <SectionTitle>{inputField("section_title_3", "3. Client Responsibilities and General Conditions")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="client_responsibilities" defaultValue={clientResponsibilitiesText} rows={8} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_4", "4. The Contract Lift and Arrival on Site")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="contract_lift_arrival" defaultValue={contractLiftArrivalText} rows={8} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_5", "5. Brief Scope of Works")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="scope_of_works" defaultValue={scopeOfWorksText} rows={8} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_6_12", "6–12. Site Controls", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_6", "6. Lifting Personnel")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("cover_label_appointed_person", "Appointed Person"), inputField("personnel_appointed_person", appointedPerson)],
            [inputField("personnel_label_ls", "Lift Supervisor"), liftSupervisorField("personnel_lift_supervisor")],
            [inputField("personnel_label_operator", "Crane Operator"), inputField("personnel_crane_operator", liftPlan?.crane_operator || operator?.full_name || "—")],
            [inputField("personnel_label_client_contact", "Client / Site Contact"), inputField("personnel_client_contact", (job as any)?.contact_name || "—")],
          ]}
        />

        <SectionTitle>{inputField("section_title_7", "7. On Site Communication")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="communication" defaultValue={communicationText} rows={6} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_8", "8. Weather Conditions")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="weather_conditions" defaultValue={weatherConditionsText} rows={6} />}
        </BoxedParagraph>

        <TwoColumnBoxes
          leftTitle={inputField("section_title_9", "9. Site Access and Egress")}
          leftBody={<EditableTextarea name="site_access_egress" defaultValue={siteAccessText} rows={6} />}
          rightTitle={inputField("section_title_10", "10. Ground Conditions")}
          rightBody={<EditableTextarea name="ground_conditions" defaultValue={groundConditionsText} rows={6} />}
        />

        <TwoColumnBoxes
          leftTitle={inputField("section_title_11", "11. Overhead Obstructions and Slewing Restrictions")}
          leftBody={<EditableTextarea name="overhead_obstructions" defaultValue={overheadText} rows={6} />}
          rightTitle={inputField("section_title_12", "12. Traffic and Pedestrian Management")}
          rightBody={<EditableTextarea name="traffic_pedestrian_management" defaultValue={trafficText} rows={6} />}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_13", "13. Equipment & Certification", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_13", "13. Lifting Equipment to be used & Certification")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("equipment_label_sling_type", "Sling type"), inputField("equipment_sling_type", liftPlan?.sling_type || "—")],
            [inputField("equipment_label_lifting_accessories", "Lifting accessories"), areaField("equipment_lifting_accessories", liftPlan?.lifting_accessories || "—", 3, true)],
            [
              inputField("equipment_label_loler", "LOLER / certification"),
              <EditableTextarea name="lifting_equipment_certification" defaultValue={liftingEquipmentText} rows={4} compact />,
            ],
          ]}
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_14", "14. Crane Details", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_14", "14. Crane Details")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("crane_label_type", "Crane type"), calculatedInputField("crane_type_value", craneName)],
            [
              inputField("crane_label_gross_weight", "Crane gross weight"),
              calculatedInputField("crane_gross_weight", formatKgAndTonnes(craneMaxWeightKg)),
            ],
            [inputField("crane_label_load_weight", "Gross weight of load"), calculatedInputField("crane_load_weight", loadWeight)],
            [
              inputField("crane_label_lifting_accessories_weight", "Gross weight of lifting accessories"),
              calculatedInputField("crane_lifting_accessories_weight_text", accessoryWeight),
            ],
            [inputField("cover_label_boom_configuration", "Boom configuration"), <EditableTextarea name="boom_configuration" defaultValue={boomConfigurationText} rows={3} compact />],
            [inputField("crane_label_minimum_required_setup", "Recommended setup"), calculatedInputField("crane_minimum_required_setup", recommendedSetupText)],
            [inputField("crane_label_outreach_reference", "Boom / outreach reference"), calculatedInputField("crane_outreach_reference", outreachRef)],
            [inputField("crane_label_jib_reference", "Jib / max outreach"), calculatedInputField("crane_jib_reference", jibRef)],
            [inputField("crane_label_max_capacity", "Chart capacity at radius"), calculatedInputField("crane_max_capacity", craneCapacity)],
            [inputField("crane_label_utilisation", "Crane utilisation %"), calculatedInputField("crane_utilisation", utilisation)],
          ]}
        />

        {/* Internal capacity warnings are kept inside the CRM screen and are not printed on downloaded lift plan packs. */}

        <BoxedParagraph title={inputField("ground_bearing_title", "Ground bearing load calculation")}>
          <InfoTable
            rows={[
              [inputField("ground_bearing_label_crane_max", "Crane planning / gross weight"), calculatedInputField("ground_bearing_crane_max_weight", formatKgAndTonnes(craneMaxWeightKg))],
              [inputField("ground_bearing_label_load_max", "Total lifted load"), calculatedInputField("ground_bearing_load_max_weight", formatKgAndTonnes(loadMaxWeightKg))],
              [inputField("ground_bearing_label_combined", "Crane + lifted load reference"), calculatedInputField("ground_bearing_combined_weight", formatKgAndTonnes(combinedMaxWeightKg))],
              [inputField("ground_bearing_label_factor", "Worst-case outrigger load factor"), calculatedInputField("ground_bearing_factor", "0.75")],
              [inputField("ground_bearing_label_result", "Worst-case outrigger load"), calculatedInputField("ground_bearing_result", formatKgAndTonnes(estimatedGroundBearingKg))],
              [inputField("ground_bearing_label_mat_size", "Mat / spreader dimensions"), calculatedInputField("ground_bearing_mat_size", matSizeText)],
              [inputField("ground_bearing_label_bearing_load", "Worst-case outrigger load used for ground-bearing calculation"), calculatedInputField("ground_bearing_bearing_load", formatKgAndTonnes(bearingLoadKg))],
              ...(enteredMatSpread ? ([
                [inputField("ground_bearing_label_mat_count", "Mats/spreader pieces under worst-case loaded outrigger"), calculatedInputField("ground_bearing_mat_count", String(matCount))],
                [inputField("ground_bearing_label_single_mat_area", "Single support piece area"), calculatedInputField("ground_bearing_single_mat_area", formatAreaM2(singleMatAreaM2))],
                [inputField("ground_bearing_label_mat_area", "Total support area under worst-case outrigger"), calculatedInputField("ground_bearing_mat_area_display", formatAreaM2(matAreaM2))],
                [inputField("ground_bearing_label_pressure", "Mat/spreader pressure reference"), calculatedInputField("ground_bearing_pressure", bearingPressure)],
              ] as Array<[ReactNode, any]>) : []),
            ]}
          />
          <div style={{ marginTop: 8 }}>
            {<EditableTextarea name="ground_bearing_notes" defaultValue={[primaryGroundLoadingFormula, primaryAdditionalSpreaderFormula].filter(Boolean).join("\n")} rows={3} compact />}
          </div>
        </BoxedParagraph>

        {multiCraneEnabled ? (
          <BoxedParagraph title={inputField("multi_crane_title", "Alternative crane options / additional crane details")}>
            <div style={{ display: "grid", gap: 12 }}>
              <InfoTable
                rows={[
                  [inputField("multi_crane_label_lift_type", "Lift type / arrangement"), calculatedInputField("multi_crane_lift_type", sections.multi_crane_lift_type || "Alternative crane options for same lift / multi-day job")],
                  [inputField("multi_crane_label_notes", "AP / crane-option notes"), areaField("multi_crane_notes", sections.multi_crane_notes || "Each crane option must be verified by the appointed person against the actual crane used on the day. These entries are alternative crane options for the same planned work unless the lift type states tandem/shared-load.", 4, true)],
                ]}
              />
              {additionalCraneEntries.length ? additionalCraneEntries.map((additionalCrane, index) => {
                const calc = additionalCraneCalc(additionalCrane, rangeGroundCalc);
                return (
                  <div key={additionalCrane.id || index} style={{ border: "1px solid #111", padding: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Crane option {index + 1}</div>
                    <InfoTable
                      rows={[
                        ["Crane", calculatedInputField(`additional_crane_${index}_name`, additionalCrane.crane_name || "—")],
                        ["Use / role", calculatedInputField(`additional_crane_${index}_role`, additionalCrane.crane_role || "—")],
                        ["Planned day / visit / when used", calculatedInputField(`additional_crane_${index}_planned_use`, additionalCrane.planned_use || "—")],
                        ["Setup / profile / chart", calculatedInputField(`additional_crane_${index}_setup`, calc.setupLabel || additionalCrane.setup_profile || "—")],
                        ["Spec sheet / chart reference", calculatedInputField(`additional_crane_${index}_spec`, calc.specReference || additionalCrane.spec_sheet_reference || "—")],
                        ["Boom length", calculatedInputField(`additional_crane_${index}_boom`, formatAdditionalCraneValue(calc.boomLengthM, " m"))],
                        ["Radius", calculatedInputField(`additional_crane_${index}_radius`, formatAdditionalCraneValue(calc.radiusM, " m"))],
                        ["Hook / lift height", calculatedInputField(`additional_crane_${index}_height`, formatAdditionalCraneValue(calc.hookHeightM, " m"))],
                        ["Chart capacity at radius", calculatedInputField(`additional_crane_${index}_capacity`, formatKgAndTonnes(calc.chartCapacityKg))],
                        ["Crane planning / gross weight", calculatedInputField(`additional_crane_${index}_gross`, formatKgAndTonnes(calc.grossKg))],
                        ["Planned load on this crane", calculatedInputField(`additional_crane_${index}_load_share`, formatKgAndTonnes(calc.loadKg))],
                        ["Accessories for this crane", calculatedInputField(`additional_crane_${index}_accessories`, formatKgAndTonnes(calc.accessoryKg))],
                        ["Total lifted / planned load", calculatedInputField(`additional_crane_${index}_total`, formatKgAndTonnes(calc.totalLiftedKg))],
                        ["Utilisation", calculatedInputField(`additional_crane_${index}_utilisation`, formatAdditionalPercent(calc.utilisationPercent))],
                        ["Selected mat / spreader", calculatedInputField(`additional_crane_${index}_mat`, calc.matLengthM && calc.matWidthM ? `${calc.matLengthM}m x ${calc.matWidthM}m` : "—")],
                        ["Mat bearing area", calculatedInputField(`additional_crane_${index}_mat_area`, formatAreaM2(calc.matAreaM2))],
                        ["Worst-case outrigger load", calculatedInputField(`additional_crane_${index}_bearing`, formatKgAndTonnes(calc.bearingLoadKg))],
                        ["Mat/spreader pressure reference", calculatedInputField(`additional_crane_${index}_pressure`, calc.bearingPressureKgM2 ? `${calc.bearingPressureKgM2.toLocaleString("en-GB", { maximumFractionDigits: 0 })} kg/m² / ${(calc.bearingPressureKgM2 / 1000).toLocaleString("en-GB", { maximumFractionDigits: 2 })} t/m²` : "—")],
                        ["Verification notes", areaField(`additional_crane_${index}_notes`, additionalCrane.verification_notes || "Confirm the selected chart, radius, boom / jib setup, load weight, hook block / accessories, outrigger setup and ground conditions before lifting.", 4, true)],
                      ]}
                    />
                    {/* Internal CRM warnings are not printed on downloaded lift-plan packs. */}
                  </div>
                );
              }) : <div>No alternative crane details entered.</div>}
            </div>
          </BoxedParagraph>
        ) : null}

        <BoxedParagraph title={inputField("crane_specifications_title", "Crane specifications")}>
          {<EditableTextarea name="crane_details" defaultValue={craneDetailsText} rows={8} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("configuration_outrigger_title", "Configuration / outrigger note")}>
          {areaField("configuration_outrigger_note", `${equipmentProfile?.configurationNote || "The crane is to be configured and rigged only in the arrangement approved for the planned lift."}

${equipmentProfile?.outriggersNote || "Outriggers are to be deployed as required by the selected duty and site restrictions on suitable support mats / spreaders."}`, 7)}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("load_chart_note_title", "Load chart note")}>
          {areaField("load_chart_note", "Final radius, boom length, hook block weight, accessories, outrigger arrangement, ground conditions and any partial set-up restrictions must be checked against the current applicable chart before the lift proceeds.", 5)}
        </BoxedParagraph>
      </PageShell>

      {includeTechnicalDrawing ? <><PageShell
        sectionTitle="Technical Drawing - Plan View"
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <LiftArrangementDrawing
          model={drawingModel}
          client={clientName}
          project={coverProjectText}
          jobNumber={(job as any)?.job_number ? `#${(job as any).job_number}` : params.id}
          view="plan"
          forceDraft={draftIncomplete}
        />
      </PageShell>

      <PageShell
        sectionTitle="Technical Drawing - Side Elevation"
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <LiftArrangementDrawing
          model={drawingModel}
          client={clientName}
          project={coverProjectText}
          jobNumber={(job as any)?.job_number ? `#${(job as any).job_number}` : params.id}
          view="elevation"
          forceDraft={draftIncomplete}
        />
      </PageShell></> : null}

      <PageShell
        sectionTitle={inputField("page_section_15_16", "15–16. Variation & Toolbox", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_15", "15. Variation from Method Statement")}</SectionTitle>
        <BlankTable
          headers={[
            inputField("variation_header_1", "Variation Details"),
            inputField("variation_header_2", "Time / Date"),
            inputField("variation_header_3", "AP Contact"),
            inputField("variation_header_4", "Initials"),
          ]}
          rows={5}
          namePrefix="variation_table"
          sections={sections}
        />

        <div style={avoidBreak}>
          <SectionTitle>{inputField("section_title_16", "16. Toolbox Talk Attendance")}</SectionTitle>
          <CheckboxTable
            leftHeader={inputField("checklist_left_header", "PRE-LIFT CHECK POINTS")}
            rightHeader={inputField("checklist_right_header", "ERECTION / COMPLETION CHECKS")}
            left={[
              inputField("check_left_1", "Crane test certificates"),
              inputField("check_left_2", "Crane thorough examination report"),
              inputField("check_left_3", "Operator weekly inspection form"),
              inputField("check_left_4", "Test certificates / thorough exam reports for lifting accessories"),
              inputField("check_left_5", "Toolbox talk delivered and recorded"),
              inputField("check_left_6", "Appropriate PPE"),
            ]}
            right={[
              inputField("check_right_1", "Working area cordoned off"),
              inputField("check_right_2", "Crane set in correct location"),
              inputField("check_right_3", "Crane limits & load indicator OK"),
              inputField("check_right_4", "Rigging fitted as detailed"),
              inputField("check_right_5", "Weather within acceptable limits"),
              inputField("check_right_6", "Site cleared"),
            ]}
            namePrefix="toolbox_checklist"
            sections={sections}
          />
        </div>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_17", "17. Crane Set-up Procedure", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_17", "17. Crane Set-up Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="crane_setup_procedure" defaultValue={craneSetupText} rows={7} />}
        </BoxedParagraph>
        <BoxedParagraph title={inputField("outrigger_setup_note_title", "Outrigger / set-up note")} compact>
          {areaField("outrigger_setup_note", sentenceCase(
            liftPlan?.outrigger_setup || equipmentProfile?.outriggersNote,
            `Outriggers are to be deployed as required by the selected configuration and the site restrictions. Suitable mats / spreaders are to be used where necessary.`
          ), 4, true)}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_18_19", "18–19. Lifting & De-Rig Procedure", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_18", "18. Lifting Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="lifting_procedure" defaultValue={liftingProcedureText} rows={10} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_19", "19. De-Rig Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="de_rig_procedure" defaultValue={deRigText} rows={7} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_20_21", "20–21. Emergency & Risk", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_20", "20. Emergency Procedure")}</SectionTitle>
        <BoxedParagraph>
          {<EditableTextarea name="emergency_procedure" defaultValue={emergencyProcedureText} rows={7} />}
        </BoxedParagraph>

        <SectionTitle>{inputField("section_title_21", "21. Risk Assessments")}</SectionTitle>
        <TwoColumnBoxes
          leftTitle={inputField("risk_assessment_summary_title", "Risk assessment summary")}
          leftBody={
            <EditableTextarea name="risk_assessment_summary" defaultValue={riskSummaryText} rows={9} />
          }
          rightTitle={inputField("site_hazards_title", "Site hazards")}
          rightBody={
            areaField("site_hazards", hazardLines.length
              ? hazardLines.join("\n")
              : "Overhead obstructions, restricted access, uneven ground, adjacent traffic, and any site-specific hazards identified at planning stage or on arrival.", 9)
          }
        />

        <TwoColumnBoxes
          leftTitle={inputField("control_measures_title", "Control measures")}
          leftBody={
            areaField("control_measures", controlLines.length
              ? controlLines.join("\n")
              : "Establish exclusion zone, use competent personnel, inspect equipment, monitor weather, maintain communication, and follow the approved lift plan and manufacturer guidance.", 9)
          }
          rightTitle={inputField("ppe_required_title", "PPE required")}
          rightBody={
            areaField("ppe_required", ppeLines.length
              ? ppeLines.join("\n")
              : "Hard hat, hi-vis clothing, safety footwear, gloves and any additional PPE required for the specific load / site conditions.", 9)
          }
        />
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_22", "22. Check Lists & Sign Offs", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
      >
        <SectionTitle>{inputField("section_title_22", "22. Check Lists and Sign Offs")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("signoff_label_lift_plan_complete", "Lift plan complete"), inputField("signoff_lift_plan_complete", yesNo(liftPlan?.lift_plan_complete))],
            [inputField("signoff_label_rams_complete", "RAMS complete"), inputField("signoff_rams_complete", yesNo(liftPlan?.rams_complete))],
            [inputField("ap_decl_label_approved_by", "Approved by"), inputField("ap_decl_approved_by_value", approvedBy)],
            [inputField("ap_decl_label_approved_at", "Approved at"), inputField("ap_decl_approved_at_value", fmtDateTime(liftPlan?.approved_at))],
            [inputField("signoff_label_approval_notes", "Approval notes"), areaField("signoff_approval_notes", liftPlan?.approval_notes || "—", 3, true)],
          ]}
        />

        <div style={avoidBreak}>
          <div style={subHeading}>{inputField("attendance_record_title", "Attendance Record")}</div>
          <BlankTable headers={[inputField("attendance_header_1", "Name"), inputField("attendance_header_2", "Employer"), inputField("attendance_header_3", "Signature")]} rows={4} namePrefix="attendance_record" sections={sections} />
        </div>

        <div style={avoidBreak}>
          <div style={subHeading}>{inputField("delegation_title", "Delegation of Duties")}</div>
          <InfoTable
            rows={[
              [inputField("delegation_label_ap", "Appointed Person"), inputField("delegation_appointed_person", appointedPerson)],
              [inputField("delegation_label_ls", "Lift Supervisor"), liftSupervisorField("delegation_lift_supervisor")],
              [inputField("delegation_label_operator", "Crane Operator"), inputField("delegation_crane_operator", liftPlan?.crane_operator || operator?.full_name || "—")],
            ]}
          />
        </div>

        <div style={signatureGrid}>
          <SignatureRow title={inputField("signature_title_ap", "Appointed Person signature")} name={appointedPerson} nameField="signature_ap_name" dateField="signature_ap_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_ls", "Lift Supervisor signature")} name={liftSupervisor} nameField="signature_ls_name" dateField="signature_ls_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_operator", "Crane Operator signature")} name={liftPlan?.crane_operator || operator?.full_name} nameField="signature_operator_name" dateField="signature_operator_date" sections={sections} />
          <SignatureRow title={inputField("signature_title_client", "Client completion sign-off")} name={(job as any)?.contact_name} nameField="signature_client_name" dateField="signature_client_date" sections={sections} />
        </div>

        <BoxedParagraph title={inputField("toolbox_notes_title", "Toolbox / sign-off notes")}>
          {<EditableTextarea name="toolbox_notes" defaultValue={toolboxNotesText} rows={6} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("emergency_contacts_title", "Emergency contacts")}>
          {<EditableTextarea name="emergency_contacts" defaultValue={emergencyContactsText} rows={5} />}
        </BoxedParagraph>

        <BoxedParagraph title={inputField("equipment_list_title", "Equipment list")}>
          {<EditableTextarea name="equipment_list" defaultValue={equipmentListText} rows={5} />}
        </BoxedParagraph>
      </PageShell>

      <PageShell
        sectionTitle={inputField("page_section_wind", "Wind Speed Record Sheet", "right")}
        headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
        headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
        headerMonth={monthInputField("page_header_month", "right")}
        footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
        breakAfter={true}
      >
        <SectionTitle>{inputField("section_title_wind", "Wind speed record sheet")}</SectionTitle>
        <InfoTable
          rows={[
            [inputField("wind_label_project", "Project"), <EditableInput name="cover_project" defaultValue={coverProjectText} />],
            [inputField("wind_label_lift_supervisor", "Lift Supervisor"), liftSupervisorField("wind_lift_supervisor")],
            [inputField("wind_label_date", "Date"), calculatedInputField("wind_date", fieldText("cover_start_date", fmtDate(displayStartDate ?? (job as any)?.start_date ?? (job as any)?.job_date)))],
          ]}
        />
        <div style={{ height: 8 }} />
        <BlankTable headers={[inputField("wind_header_1", "Time"), inputField("wind_header_2", "Wind Speed"), inputField("wind_header_3", "OK To Work (Y / N)"), inputField("wind_header_4", "Notes")]} rows={12} namePrefix="wind_record" sections={sections} />
      </PageShell>

      {includeRangeChartPage ? (
        <RangeChartPackPage
          sections={sections}
          headerMonth={monthInputField("page_header_month", "right")}
          headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
          headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
          footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
        />
      ) : null}

      {appendixAssets.map((asset, index) => (
        <AppendixPage
          key={`${asset.title}-${asset.page_number}-${index}`}
          asset={asset}
          index={index + 1}
          titleNode={currentCraneInputField(`appendix_${index + 1}_title`, safeAppendixTitleForCurrentCrane(asset, craneName, index + 1))}
          captionNode={<EditableTextarea name={`appendix_${index + 1}_caption`} defaultValue={safeAppendixDescriptionForCurrentCrane(asset, craneName)} rows={2} compact />}
          headerMonth={monthInputField("page_header_month", "right")}
          headerTitle={inputField("page_header_title", "ANNS – LIFTING PLAN – V1")}
          headerSubtitle={inputField("page_header_subtitle", "Anns Crane Hire Ltd")}
          footerText={inputField("page_footer_text", "Anns Crane Hire Ltd, 6 Bay St, Port Tennant, Swansea, SA1 8LB • 01792 641653 • info@annscranehire.co.uk")}
        />
      ))}
      </fieldset>
      </form>
    </div>
  );
}


const fieldsetStyle: CSSProperties = {
  border: 0,
  margin: 0,
  padding: 0,
  minInlineSize: "auto",
};

const lockedBannerStyle: CSSProperties = {
  margin: "0 0 16px",
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(180,0,0,0.10)",
  border: "1px solid rgba(180,0,0,0.16)",
  color: "#8b0000",
  fontWeight: 700,
};

const wrapper: CSSProperties = {
  background: "#f5f5f5",
  color: "#111",
  minHeight: "100vh",
  padding: 24,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Open Sans, Helvetica Neue, sans-serif",
};

const toolbar: CSSProperties = {
  maxWidth: "190mm",
  margin: "0 auto 16px auto",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.95)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.12)",
};

const saveButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  border: "none",
  cursor: "pointer",
};

const saveOkStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  margin: "0 auto 16px auto",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(0,160,80,0.12)",
  border: "1px solid rgba(0,160,80,0.18)",
  color: "#0b6b34",
  fontWeight: 700,
};

const saveErrorStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  margin: "0 auto 16px auto",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(180,0,0,0.12)",
  border: "1px solid rgba(180,0,0,0.18)",
  color: "#8b0000",
  fontWeight: 700,
};

const editableValueWrapStyle: CSSProperties = {
  display: "block",
  width: "100%",
  minWidth: 0,
};

const printValueStyle: CSSProperties = {
  display: "none",
  width: "100%",
  minWidth: 0,
  font: "inherit",
  fontWeight: "inherit",
  color: "#111",
  overflowWrap: "anywhere",
  boxSizing: "border-box",
};

const inlineInputStyle: CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  fontWeight: 600,
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  overflowWrap: "anywhere",
};

const inlineTextareaStyle: CSSProperties = {
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "#111",
  lineHeight: 1.5,
  outline: "none",
  resize: "vertical",
  whiteSpace: "pre-wrap",
  overflow: "hidden",
  boxSizing: "border-box",
};

const pageStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  minHeight: "277mm",
  margin: "0 auto 16px auto",
  background: "#fff",
  boxSizing: "border-box",
  padding: 16,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.16)",
  display: "flex",
  flexDirection: "column",
};

const pageHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid #bcbcbc",
  minWidth: 0,
  overflow: "visible",
};

const pageBody: CSSProperties = {
  paddingTop: 12,
  flex: 1,
};

const pageFooter: CSSProperties = {
  paddingTop: 8,
  marginTop: "auto",
  borderTop: "1px solid #bcbcbc",
  fontSize: 10.5,
  color: "#555",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  alignItems: "center",
  gap: 12,
};

const pageFooterText: CSSProperties = {
  textAlign: "center",
  lineHeight: 1.35,
};

const reviewQrWrap: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  alignItems: "center",
  gap: 2,
  padding: 4,
  background: "#fff",
  border: "1px solid #d8dee8",
  borderRadius: 5,
  minWidth: 92,
};

const reviewQrImage: CSSProperties = {
  width: 82,
  height: 82,
  objectFit: "contain",
  display: "block",
  imageRendering: "pixelated",
};

const reviewQrText: CSSProperties = {
  fontSize: 8.5,
  lineHeight: 1,
  fontWeight: 800,
  color: "#1f2937",
};

const logoStyle: CSSProperties = {
  width: 54,
  height: 54,
  objectFit: "contain",
};

const coverHero: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(190px, 240px)",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 18,
  minWidth: 0,
};

const coverTitle: CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
  minWidth: 0,
  overflowWrap: "anywhere",
};

const coverSubtitle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  color: "#555",
};

const coverCompany: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  textAlign: "right",
  width: "100%",
  maxWidth: 240,
  justifySelf: "end",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: 10,
  fontSize: 24,
  fontWeight: 900,
};

const subHeading: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginTop: 14,
  marginBottom: 8,
};

const infoTable: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(130px, 180px) minmax(0, 1fr)",
  borderTop: "1px solid #333",
  borderLeft: "1px solid #333",
  breakInside: "avoid",
};

const infoLabel: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 700,
  background: "#f6f6f6",
};

const infoValue: CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #333",
  borderBottom: "1px solid #333",
  fontWeight: 600,
  minWidth: 0,
  overflowWrap: "anywhere",
};

const boxed: CSSProperties = {
  border: "1px solid #333",
  padding: 12,
  marginBottom: 12,
  breakInside: "avoid",
};

const compactBoxed: CSSProperties = {
  padding: 10,
};

const boxedTitle: CSSProperties = {
  fontWeight: 900,
  marginBottom: 6,
};

const boxedBody: CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const tocGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
};

const tocItem: CSSProperties = {
  paddingBottom: 6,
  borderBottom: "1px dotted #aaa",
  fontWeight: 700,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  breakInside: "avoid",
};

const thStyle: CSSProperties = {
  border: "1px solid #333",
  textAlign: "left",
  padding: "7px 8px",
  fontSize: 13,
  background: "#f6f6f6",
};

const tdStyle: CSSProperties = {
  border: "1px solid #333",
  padding: "8px",
  height: 28,
  verticalAlign: "top",
};

const tickCell: CSSProperties = {
  ...tdStyle,
  width: 24,
  minWidth: 24,
  padding: 0,
};

const avoidBreak: CSSProperties = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const signatureGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
  marginTop: 14,
};

const signatureBox: CSSProperties = {
  border: "1px solid #333",
  padding: 10,
  breakInside: "avoid",
};

const rangeChartHeaderGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px 14px",
  fontSize: 12,
  lineHeight: 1.35,
  border: "1px solid #a9d5e4",
  borderRadius: 8,
  padding: 10,
  background: "#f6fbff",
  marginBottom: 8,
};

const rangeChartFrame: CSSProperties = {
  border: "1px solid #a9d5e4",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
  marginBottom: 8,
};

const rangeChartDangerBox: CSSProperties = {
  border: "1px solid #d99a9a",
  background: "#fff1f1",
  color: "#7a1515",
  borderRadius: 8,
  padding: 8,
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 800,
  marginBottom: 8,
};

const rangeMetricGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
  marginTop: 8,
};

const rangeMetricBox: CSSProperties = {
  border: "1px solid #cde4ec",
  borderRadius: 7,
  padding: "6px 8px",
  background: "#fbfdff",
};

const rangeMetricLabel: CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  color: "#4f6f78",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const rangeMetricValue: CSSProperties = {
  marginTop: 3,
  fontSize: 12,
  fontWeight: 900,
};

const rangeVerificationBox: CSSProperties = {
  marginTop: 8,
  border: "1px solid #f0cf84",
  background: "#fff8e6",
  borderRadius: 8,
  padding: 8,
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 700,
};

const appendixPageStyle: CSSProperties = {
  width: "min(190mm, 100%)",
  minHeight: "277mm",
  margin: "0 auto 16px auto",
  background: "#fff",
  boxSizing: "border-box",
  padding: 16,
  boxShadow: "0 0 0 1px rgba(0,0,0,0.16)",
  display: "flex",
  flexDirection: "column",
};

const appendixPageBody: CSSProperties = {
  paddingTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  flex: 1,
};

const appendixTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.15,
};

const appendixDescription: CSSProperties = {
  fontSize: 13,
  opacity: 0.82,
};

const appendixFrame: CSSProperties = {
  border: "1px solid #333",
  padding: 6,
  height: "225mm",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#fff",
};

const appendixImage: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "contain",
};
