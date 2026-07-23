export type AssetPresetKind = "crane" | "vehicle";

export type AssetProfileInput = {
  name?: string | null;
  make?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  capacity?: string | null;
};

export type AssetAppendixBundlePreset = {
  key: string;
  title: string;
  documentType: string;
  appendixOrder: number;
  pages: number[];
};

export type AssetAppendixPreset = {
  key: string;
  label: string;
  assetType: AssetPresetKind;
  bundles: AssetAppendixBundlePreset[];
};

export type CraneAppendixSelectionContext = {
  /** Optional crane identity fields are used only to find the correct CRM spec sheets when crane names have been tidied/renamed. */
  craneName?: string | null;
  craneMake?: string | null;
  craneModel?: string | null;
  craneCapacity?: string | null;
  liftType?: string | null;
  craneConfiguration?: string | null;
  outriggerSetup?: string | null;
  loadDescription?: string | null;
  notes?: string | null;
};

export type VehicleAppendixSelectionContext = {
  jobType?: string | null;
  vehicleConfiguration?: string | null;
  hiabConfiguration?: string | null;
  outriggerSetup?: string | null;
  loadDescription?: string | null;
  notes?: string | null;
};

export type AppendixSelectionFacts = {
  operating_mode?: string | null;
  support_mode?: string | null;
  attachment_mode?: string | null;
  stability_class?: string | null;
  restricted_access?: boolean;
  lifting_persons?: boolean;
};

function norm(...parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function stripNegativePlatformMentions(text: string) {
  return text
    .replace(/do not use\s+(the\s+)?basket/g, " ")
    .replace(/do not use\s+(the\s+)?platform/g, " ")
    .replace(/do not use\s+mewp/g, " ")
    .replace(/not use\s+(the\s+)?basket/g, " ")
    .replace(/not use\s+(the\s+)?platform/g, " ")
    .replace(/not use\s+mewp/g, " ")
    .replace(/no basket/g, " ")
    .replace(/no platform/g, " ")
    .replace(/without basket/g, " ")
    .replace(/without platform/g, " ")
    .replace(/not for basket/g, " ")
    .replace(/not for platform/g, " ")
    .replace(/not in basket mode/g, " ")
    .replace(/not in platform mode/g, " ");
}

function supportModeFromText(text: string) {
  if (hasAny(text, ["variable stabiliser", "variable stabilizer", "hpsc"])) {
    return "variable_hpsc";
  }
  if (hasAny(text, ["partial", "part rigged", "part-rigged", "part rig", "intermediate"])) {
    return "partial";
  }
  if (hasAny(text, ["restricted", "restricted setup", "limited setup"])) {
    return "restricted";
  }
  if (hasAny(text, ["full outriggers", "fully deployed", "full support", "full stabiliser", "full stabilizer"])) {
    return "full";
  }
  return null;
}

const PRESETS: AssetAppendixPreset[] = [
  {
    key: "ak46",
    label: "Böcker AK 46/6000",
    assetType: "crane",
    bundles: [
      { key: "spec", title: "AK46 SPEC", documentType: "spec_sheet", appendixOrder: 10, pages: [1] },
      { key: "crane", title: "AK46 CRANE OPERATION", documentType: "load_chart", appendixOrder: 20, pages: [2] },
      { key: "basket", title: "AK46 PLATFORM / BASKET", documentType: "load_chart", appendixOrder: 30, pages: [3] },
      { key: "dimensions", title: "AK46 DIMENSIONS", documentType: "manual", appendixOrder: 40, pages: [4] },
    ],
  },
  {
    key: "gmk4080",
    label: "Grove GMK4080-1",
    assetType: "crane",
    bundles: [
      { key: "spec", title: "GMK4080 SPEC", documentType: "spec_sheet", appendixOrder: 10, pages: [3] },
      { key: "support", title: "GMK4080 DIMENSIONS / NOTES / RANGE", documentType: "manual", appendixOrder: 15, pages: [10, 11, 12, 13] },
      { key: "main_boom", title: "GMK4080 MAIN BOOM", documentType: "load_chart", appendixOrder: 20, pages: [14, 15, 16, 17] },
      { key: "jib_a", title: "GMK4080 JIB (A)", documentType: "load_chart", appendixOrder: 30, pages: [18, 19, 20] },
      { key: "jib_b", title: "GMK4080 JIB (B)", documentType: "load_chart", appendixOrder: 31, pages: [21, 22] },
      { key: "extension", title: "GMK4080 EXTENSION / LUFFING", documentType: "load_chart", appendixOrder: 40, pages: [23, 24] },
    ],
  },
  {
    key: "jekko_spx532",
    label: "Jekko SPX532",
    assetType: "crane",
    bundles: [
      { key: "core", title: "SPX532 CORE / SUPPORT", documentType: "spec_sheet", appendixOrder: 10, pages: [2, 3, 4] },
      { key: "stability", title: "SPX532 STABILITY", documentType: "manual", appendixOrder: 15, pages: [7, 8] },
      { key: "main_boom", title: "SPX532 MAIN BOOM", documentType: "load_chart", appendixOrder: 20, pages: [9, 10, 11] },
      { key: "jib1000", title: "SPX532 JIB1000", documentType: "load_chart", appendixOrder: 30, pages: [12, 13, 14] },
      { key: "jib1200_a", title: "SPX532 JIB1200 (A)", documentType: "load_chart", appendixOrder: 40, pages: [15, 16, 17] },
      { key: "jib1200_b", title: "SPX532 JIB1200 (B)", documentType: "load_chart", appendixOrder: 41, pages: [18, 19, 20] },
    ],
  },
  {
    key: "hk40",
    label: "Tadano Faun HK40",
    assetType: "crane",
    bundles: [
      { key: "spec", title: "HK40 SPEC / DIMENSIONS", documentType: "spec_sheet", appendixOrder: 10, pages: [1, 2, 3] },
      { key: "main_boom", title: "HK40 MAIN BOOM CHARTS", documentType: "load_chart", appendixOrder: 20, pages: [4, 5, 6, 7, 8, 9, 10, 11] },
      { key: "extension", title: "HK40 9 M BOOM EXTENSION", documentType: "load_chart", appendixOrder: 30, pages: [12, 13] },
      { key: "technical", title: "HK40 TECHNICAL DATA", documentType: "manual", appendixOrder: 40, pages: [14, 15, 16] },
    ],
  },
  {
    key: "mtk35",
    label: "Marchetti MTK 35",
    assetType: "crane",
    bundles: [
      { key: "spec", title: "MTK35 SPEC / DIMENSIONS", documentType: "spec_sheet", appendixOrder: 10, pages: [2, 6] },
      { key: "crane", title: "MTK35 CRANE CHARTS", documentType: "load_chart", appendixOrder: 20, pages: [3, 4] },
      { key: "mewp", title: "MTK35 MEWP", documentType: "load_chart", appendixOrder: 30, pages: [5] },
    ],
  },
  {
    key: "xhipro858",
    label: "HIAB X-HIPRO 858",
    assetType: "vehicle",
    bundles: [
      { key: "spec", title: "X-HIPRO 858 EP-6 TECHNICAL DATA", documentType: "spec_sheet", appendixOrder: 10, pages: [2] },
      { key: "chart", title: "X-HIPRO 858 EP-6 LOAD DIAGRAM", documentType: "load_chart", appendixOrder: 20, pages: [3] },
    ],
  },
  {
    key: "pk65002",
    label: "Palfinger PK 65002 SH",
    assetType: "vehicle",
    bundles: [
      { key: "spec", title: "PK65002 SH TECHNICAL SPECIFICATION", documentType: "spec_sheet", appendixOrder: 10, pages: [11] },
      { key: "boom", title: "PK65002 SH E MAIN BOOM CHART", documentType: "load_chart", appendixOrder: 20, pages: [8] },
      { key: "dimensions", title: "PK65002 SH DIMENSIONS", documentType: "manual", appendixOrder: 30, pages: [10] },
    ],
  },
];

export function detectAssetAppendixPreset(assetType: AssetPresetKind, profile: AssetProfileInput | null | undefined) {
  const haystack = norm(profile?.name, profile?.make, profile?.model, profile?.vehicleType, profile?.capacity);
  if (!haystack) return null;

  if (assetType === "crane") {
    if (hasAny(haystack, ["ak 46", "ak46", "46 6000", "46/6000", "bocker ak"])) return PRESETS.find((p) => p.key === "ak46") ?? null;
    if (hasAny(haystack, ["gmk4080", "gmk 4080", "4080 1", "4080-1", "grove"])) return PRESETS.find((p) => p.key === "gmk4080") ?? null;
    if (hasAny(haystack, ["spx532", "spx 532", "jekko"])) return PRESETS.find((p) => p.key === "jekko_spx532") ?? null;
    if (hasAny(haystack, ["hk40", "hk 40", "tadano faun", "faun hk"])) return PRESETS.find((p) => p.key === "hk40") ?? null;
    if (hasAny(haystack, ["mtk35", "mtk 35", "marchetti"])) return PRESETS.find((p) => p.key === "mtk35") ?? null;
  }

  if (assetType === "vehicle") {
    if (hasAny(haystack, ["x hipro 858", "x-hipro 858", "858", "hiab x"])) return PRESETS.find((p) => p.key === "xhipro858") ?? null;
    if (hasAny(haystack, ["pk 65002", "pk65002", "65002 sh", "palfinger"])) return PRESETS.find((p) => p.key === "pk65002") ?? null;
  }

  return null;
}

export function listAssetAppendixPresetBundles(assetType: AssetPresetKind, profile: AssetProfileInput | null | undefined) {
  return detectAssetAppendixPreset(assetType, profile)?.bundles ?? [];
}

function bundleTitles(preset: AssetAppendixPreset, keys: string[]) {
  const wanted = new Set(keys);
  return preset.bundles.filter((bundle) => wanted.has(bundle.key)).map((bundle) => bundle.title);
}

export function buildCraneAppendixFacts(
  context: CraneAppendixSelectionContext | null | undefined
): AppendixSelectionFacts {
  const source = norm(
    context?.liftType,
    context?.craneConfiguration,
    context?.outriggerSetup,
    context?.loadDescription,
    context?.notes
  );

  const platformSignalSource = stripNegativePlatformMentions(source);
  const explicitCraneLift = hasAny(source, ["crane lift", "contract lift", "standard lifting", "lifting operation"]);
  const explicitGlazing = hasAny(source, ["glazing", "glass", "vacuum lifter"]);
  const liftingPersons =
    hasAny(platformSignalSource, ["basket", "platform", "mewp", "man basket", "personnel basket", "lifting persons", "people lifting"]) &&
    !explicitCraneLift &&
    !explicitGlazing;
  const restrictedAccess = hasAny(source, ["restricted access", "tight access", "narrow access", "confined", "limited access", "restricted setup"]);
  const stabilityClass = ["j0", "j1", "j5", "j6", "j7"].find((item) => source.includes(item))?.toUpperCase() ?? null;

  let attachmentMode = "main_boom";
  if (liftingPersons) attachmentMode = "platform";
  else if (hasAny(source, ["hydraulic luffing", "luffing", "boom extension", "fixed offset", "extension / luffing", "extension and luffing"])) attachmentMode = "extension";
  else if (hasAny(source, ["jib1200", "jib 1200", "1200"])) attachmentMode = "jib1200";
  else if (hasAny(source, ["jib1000", "jib 1000", "1000"])) attachmentMode = "jib1000";
  else if (hasAny(source, ["swingaway", "boom + jib", "boom and jib", "fly jib", "jib"])) attachmentMode = "jib";

  if (stabilityClass === "J0") {
    attachmentMode = "no_lift";
  }

  let operatingMode = "crane_lift";
  if (liftingPersons) operatingMode = "platform_or_basket";

  return {
    operating_mode: operatingMode,
    support_mode: supportModeFromText(source),
    attachment_mode: attachmentMode,
    stability_class: stabilityClass,
    restricted_access: restrictedAccess,
    lifting_persons: liftingPersons,
  };
}

export function buildVehicleAppendixFacts(
  context: VehicleAppendixSelectionContext | null | undefined
): AppendixSelectionFacts {
  const source = norm(
    context?.jobType,
    context?.vehicleConfiguration,
    context?.hiabConfiguration,
    context?.outriggerSetup,
    context?.loadDescription,
    context?.notes
  );

  const liftingPersons = hasAny(source, ["basket", "platform", "mewp", "man basket", "personnel basket", "lifting persons", "people lifting"]);
  const restrictedAccess = hasAny(source, ["restricted access", "tight access", "narrow access", "confined", "limited access", "restricted setup"]);

  let attachmentMode = "main_boom";
  if (liftingPersons) attachmentMode = "platform";
  else if (hasAny(source, ["fly", "fly jib", "dps", "pj100", "pj125", "pj170", "jib150", "jib"])) attachmentMode = "fly_jib";

  return {
    operating_mode: liftingPersons ? "platform_or_basket" : "hiab_loader",
    support_mode: supportModeFromText(source),
    attachment_mode: attachmentMode,
    restricted_access: restrictedAccess,
    lifting_persons: liftingPersons,
  };
}

export function selectCraneBundleTitlesForContext(
  profile: AssetProfileInput | null | undefined,
  context: CraneAppendixSelectionContext | null | undefined
) {
  const preset = detectAssetAppendixPreset("crane", profile);
  if (!preset) return null;

  const facts = buildCraneAppendixFacts(context);

  if (preset.key === "ak46") {
    const keys = ["spec", facts.operating_mode === "platform_or_basket" ? "basket" : "crane"];
    if (facts.restricted_access || facts.support_mode === "partial" || facts.support_mode === "restricted") {
      keys.push("dimensions");
    }
    return bundleTitles(preset, keys);
  }

  if (preset.key === "gmk4080") {
    const keys = ["spec", "support"];
    if (facts.attachment_mode === "extension") keys.push("extension");
    else if (facts.attachment_mode === "jib") keys.push("jib_a", "jib_b");
    else keys.push("main_boom");
    return bundleTitles(preset, keys);
  }

  if (preset.key === "jekko_spx532") {
    const keys = ["core", "stability"];
    if (facts.stability_class === "J0" || facts.attachment_mode === "no_lift") {
      return bundleTitles(preset, keys);
    }
    if (facts.attachment_mode === "jib1200") keys.push("jib1200_a", "jib1200_b");
    else if (facts.attachment_mode === "jib1000") keys.push("jib1000");
    else keys.push("main_boom");
    return bundleTitles(preset, keys);
  }

  if (preset.key === "hk40") {
    const keys = ["spec", "main_boom"];
    if (facts.attachment_mode === "extension" || facts.attachment_mode === "jib") keys.push("extension");
    return bundleTitles(preset, keys);
  }

  if (preset.key === "mtk35") {
    return bundleTitles(preset, ["spec", facts.operating_mode === "platform_or_basket" ? "mewp" : "crane"]);
  }

  return preset.bundles.map((bundle) => bundle.title);
}

export function selectVehicleBundleTitlesForContext(
  profile: AssetProfileInput | null | undefined,
  context: VehicleAppendixSelectionContext | null | undefined
) {
  const preset = detectAssetAppendixPreset("vehicle", profile);
  if (!preset) return null;

  const facts = buildVehicleAppendixFacts(context);

  if (preset.key === "xhipro858") {
    return bundleTitles(preset, ["spec", "chart"]);
  }

  if (preset.key === "pk65002") {
    const keys = ["spec", facts.attachment_mode === "fly_jib" ? "fly" : "boom"];
    if (
      facts.restricted_access ||
      facts.support_mode === "variable_hpsc" ||
      facts.support_mode === "partial" ||
      facts.support_mode === "restricted"
    ) {
      keys.push("dimensions");
    }
    return bundleTitles(preset, keys);
  }

  return preset.bundles.map((bundle) => bundle.title);
}
