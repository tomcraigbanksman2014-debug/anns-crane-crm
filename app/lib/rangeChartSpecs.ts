export type RangeChartCapacityPoint = {
  radiusM: number;
  capacityKg: number;
};

export type RangeChartProfileOption = {
  key: string;
  label: string;
  defaultBoomLengthM?: number | null;
  maxBoomLengthM?: number | null;
  maxRadiusM?: number | null;
  maxTipHeightM?: number | null;
  source?: string;
};

export type RangeChartJibOption = {
  key: string;
  label: string;
  lengthM: number;
  maxRadiusM?: number | null;
  maxTipHeightM?: number | null;
  source?: string;
};

export type RangeChartSpecRule = {
  id: string;
  title: string;
  match: RegExp[];
  maxCapacityKg?: number | null;
  maxBoomLengthM?: number | null;
  maxPhysicalJibLengthM?: number | null;
  maxRadiusM?: number | null;
  maxTipHeightM?: number | null;
  defaultBearingLoadKg?: number | null;
  bearingLoadSource?: string;
  capacitySource?: string;
  capacityPoints?: RangeChartCapacityPoint[];
  profileOptions?: RangeChartProfileOption[];
  jibOptions?: RangeChartJibOption[];
  notes?: string;
};

export type RangeChartCapacityResult = {
  capacityKg: number | null;
  method: "automatic" | "manual";
  source: string;
  warning?: string;
};

export type RangeChartBearingResult = {
  bearingLoadKg: number | null;
  method: "automatic" | "manual";
  source: string;
  warning?: string;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function point(radiusM: number, capacityKg: number): RangeChartCapacityPoint {
  return { radiusM, capacityKg };
}

function profile(
  key: string,
  label: string,
  defaultBoomLengthM: number | null,
  maxBoomLengthM: number | null,
  maxRadiusM?: number | null,
  maxTipHeightM?: number | null,
  source?: string
): RangeChartProfileOption {
  return { key, label, defaultBoomLengthM, maxBoomLengthM, maxRadiusM, maxTipHeightM, source };
}

function jib(
  key: string,
  label: string,
  lengthM: number,
  maxRadiusM?: number | null,
  maxTipHeightM?: number | null,
  source?: string
): RangeChartJibOption {
  return { key, label, lengthM, maxRadiusM, maxTipHeightM, source };
}

export const RANGE_CHART_SPEC_RULES: RangeChartSpecRule[] = [
  {
    id: "ak46-6000",
    title: "Böcker AK 46/6000",
    match: [/\bak\s*46(?:\/6000)?\b/i, /\bbocker\b.*\bak\s*46/i, /\bböcker\b.*\bak\s*46/i],
    maxCapacityKg: 6000,
    maxBoomLengthM: 46,
    maxPhysicalJibLengthM: 11,
    maxRadiusM: 39,
    maxTipHeightM: 46,
    profileOptions: [
      profile("ak46-main-44", "Main boom / extension up to 44 m", 44, 44, 38, 43.3, "AK 46/6000 technical information"),
      profile("ak46-main-46", "Optional max extension up to 46 m", 46, 46, 39, 46, "AK 46/6000 technical information"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("ak46-jib-5-3", "5.3 m hydraulic jib", 5.3, 38, 43.3, "AK 46/6000: jib extendable 5.3 / 8.1 / 11.0 m"),
      jib("ak46-jib-8-1", "8.1 m hydraulic jib", 8.1, 39, 43.3, "AK 46/6000: jib extendable 5.3 / 8.1 / 11.0 m"),
      jib("ak46-jib-11", "11.0 m hydraulic jib", 11, 39, 46, "AK 46/6000: jib extendable 5.3 / 8.1 / 11.0 m"),
    ],
    capacitySource: "AK 46/6000 spec: crane-operation range/load table",
    // Conservative step curve from the AK 46/6000 technical information.
    // For values between two published radii, the next lower published capacity is used.
    capacityPoints: [
      point(8, 6000),
      point(11, 4000),
      point(17.7, 2000),
      point(26, 1000),
      point(34.5, 500),
      point(39, 250),
    ],
    notes:
      "Uses the published AK 46/6000 range/load points as a conservative step curve. Final duty must still be checked on the supplier/manufacturer chart.",
  },
  {
    id: "gmk4080-1",
    title: "Grove GMK4080-1",
    match: [/\bgmk\s*4080\s*-?\s*1\b/i, /\bgrove\b.*\b4080\s*-?\s*1\b/i],
    maxCapacityKg: 80000,
    maxBoomLengthM: 51,
    maxPhysicalJibLengthM: 21,
    maxRadiusM: 75,
    maxTipHeightM: 75,
    profileOptions: [
      profile("gmk4080-main-51", "Main boom up to 51 m", 51, 51, null, 54, "GMK4080-1 product guide: 11.0 m to 51.0 m TWIN-LOCK boom"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("gmk4080-swingaway-8-7", "8.7 m bi-fold swingaway", 8.7, null, null, "GMK4080-1 optional bi-fold swingaway 8.7 / 15 m"),
      jib("gmk4080-swingaway-15", "15 m bi-fold swingaway", 15, null, null, "GMK4080-1 optional bi-fold swingaway 8.7 / 15 m"),
      jib("gmk4080-lattice-21", "21 m lattice extension", 21, 75, 75, "GMK4080-1 optional 21 m lattice extension"),
    ],
    capacitySource: "GMK4080-1 spec: use exact load chart/LMI for capacity at selected boom, radius and counterweight",
    notes:
      "The GMK4080-1 product guide includes many duty tables by boom, counterweight and extension. This guard checks geometry limits but does not guess a radius capacity unless a structured table is added.",
  },
  {
    id: "spx532",
    title: "Jekko SPX532",
    match: [/\bspx\s*532\b/i, /\bspx532\b/i, /\bjekko\b.*\b532\b/i],
    maxCapacityKg: 3200,
    maxBoomLengthM: 10.8,
    maxPhysicalJibLengthM: 5.1,
    maxRadiusM: 14.8,
    maxTipHeightM: 17.3,
    profileOptions: [
      profile("spx532-main-10-8", "Main telescopic boom up to 10.8 m", 10.8, 10.8, 9.7, 12.1, "SPX532 technical data: boom telescoping 2.5 - 10.8 m"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("spx532-jib-small", "JIB1200GX / short jib option", 1.2, null, null, "SPX532 jib option - verify exact chart"),
      jib("spx532-jib-long", "JIB1000.2H1MX / long jib option", 5.1, 14.8, 17.3, "SPX532 jib option - verify exact chart"),
    ],
    defaultBearingLoadKg: 3000,
    bearingLoadSource: "Jekko SPX532 spec: static outrigger load 3000 kg",
    capacitySource: "Jekko SPX532 spec: use exact selected J-rating/outrigger load chart for capacity",
    notes:
      "SPX532 duties depend on outrigger/stability zone and selected J-rating. The guard checks known maximum limits and auto-fills the published static outrigger load, but capacity must use the exact selected chart unless structured J-chart data is saved.",
  },
  {
    id: "hk40",
    title: "Tadano Faun HK 40",
    match: [/\bhk\s*40\b/i, /\btadano\b.*\bhk\s*40\b/i, /\bfaun\b.*\bhk\s*40\b/i],
    maxCapacityKg: 40000,
    maxBoomLengthM: 35.2,
    maxPhysicalJibLengthM: 9,
    maxRadiusM: 35.2,
    maxTipHeightM: 44.2,
    profileOptions: [
      profile("hk40-main-35-2", "Main boom up to 35.2 m", 35.2, 35.2, 32, 35.2, "HK 40 spec: 10.5 m - 35.2 m telescopic boom"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("hk40-extension-9", "9 m boom extension", 9, null, 44.2, "HK 40 spec: 9 m boom extension"),
    ],
    capacitySource: "HK 40 spec: use exact load chart for selected counterweight, boom and radius",
    notes:
      "The HK 40 tables vary by counterweight and boom length. This guard checks the published maximum geometry and flags manual chart verification for capacity.",
  },
  {
    id: "mtk35",
    title: "Marchetti MTK 35",
    match: [/\bmtk\s*35\b/i, /\bmarchetti\b.*\b35\b/i],
    maxCapacityKg: 35000,
    maxBoomLengthM: 32,
    maxPhysicalJibLengthM: 14.5,
    maxRadiusM: 40,
    maxTipHeightM: 52,
    profileOptions: [
      profile("mtk35-main-32", "Main boom up to 32 m", 32, 32, 40, 40, "MTK35 specs: main boom height diagram"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("mtk35-extension-8", "8 m extension", 8, null, null, "MTK35 specs: 32 + 8 m lifting heights"),
      jib("mtk35-extension-14-5", "14.5 m extension", 14.5, 40, 52, "MTK35 specs: 32 + 14.5 m lifting heights"),
    ],
    capacitySource: "MTK 35 spec: use exact EN13000 load chart for selected boom/jib/radius",
    notes:
      "The MTK 35 sheet shows boom and jib ranges and states hook/slings are part of the load. Capacity must be checked against the exact chart unless structured capacity data is saved.",
  },
];

export function findRangeChartSpecRule(...values: unknown[]) {
  const haystack = lower(values.filter(Boolean).join(" "));
  if (!haystack) return null;
  return RANGE_CHART_SPEC_RULES.find((rule) => rule.match.some((pattern) => pattern.test(haystack))) ?? null;
}

export function conservativeCapacityFromCurve(points: RangeChartCapacityPoint[] | undefined, radiusM: number) {
  if (!points?.length || !Number.isFinite(radiusM)) return null;
  const sorted = [...points].sort((a, b) => a.radiusM - b.radiusM);
  for (const item of sorted) {
    if (radiusM <= item.radiusM + 0.0001) return item.capacityKg;
  }
  return null;
}

export function calculateRangeChartCapacity({
  craneName,
  setupLabel,
  sourceLabel,
  radiusM,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
  radiusM: number;
}): RangeChartCapacityResult {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  if (!rule) {
    return {
      capacityKg: null,
      method: "manual",
      source: "No recognised structured crane capacity rule found. Enter/check the capacity against the manufacturer/supplier chart.",
      warning: "Chart capacity cannot be auto-calculated until this crane/spec sheet has structured load-chart data.",
    };
  }

  const capacityKg = conservativeCapacityFromCurve(rule.capacityPoints, radiusM);
  if (capacityKg !== null) {
    return {
      capacityKg,
      method: "automatic",
      source: rule.capacitySource || `${rule.title} structured capacity rule`,
    };
  }

  if (rule.capacityPoints?.length) {
    return {
      capacityKg: null,
      method: "manual",
      source: rule.capacitySource || `${rule.title} structured capacity rule`,
      warning: `Radius is outside the structured ${rule.title} capacity curve. Check the exact chart manually.`,
    };
  }

  return {
    capacityKg: null,
    method: "manual",
    source: rule.capacitySource || `${rule.title} load chart`,
    warning: `${rule.title} needs the exact manufacturer/supplier chart for capacity at this radius, boom, counterweight/outrigger setup and accessories.`,
  };
}

export function calculateRangeChartBearingLoad({
  craneName,
  setupLabel,
  sourceLabel,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
}): RangeChartBearingResult {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  if (rule?.defaultBearingLoadKg) {
    return {
      bearingLoadKg: rule.defaultBearingLoadKg,
      method: "automatic",
      source: rule.bearingLoadSource || `${rule.title} published outrigger/load reaction`,
    };
  }

  return {
    bearingLoadKg: null,
    method: "manual",
    source: rule
      ? `${rule.title} spec does not provide a single safe bearing reaction in the structured CRM rule. Use the exact outrigger reaction chart/manual value.`
      : "No recognised crane bearing reaction rule found. Use the exact outrigger reaction chart/manual value.",
    warning: "Bearing load/reaction cannot be safely auto-calculated from geometry alone. Enter/check the exact outrigger reaction before relying on ground bearing pressure.",
  };
}



export function getRangeChartSpecOptions({
  craneName,
  setupLabel,
  sourceLabel,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
}) {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  return {
    rule,
    profileOptions: rule?.profileOptions ?? [],
    jibOptions: rule?.jibOptions ?? [],
  };
}

export function getRangeChartLimits({
  craneName,
  setupLabel,
  sourceLabel,
  setupMaxBoomLengthM,
  setupMaxRadiusM,
  setupMaxTipHeightM,
  setupMaxPhysicalJibLengthM,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
  setupMaxBoomLengthM?: number | null;
  setupMaxRadiusM?: number | null;
  setupMaxTipHeightM?: number | null;
  setupMaxPhysicalJibLengthM?: number | null;
}) {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  return {
    rule,
    maxCapacityKg: rule?.maxCapacityKg ?? null,
    maxBoomLengthM: setupMaxBoomLengthM ?? rule?.maxBoomLengthM ?? null,
    maxPhysicalJibLengthM: setupMaxPhysicalJibLengthM ?? rule?.maxPhysicalJibLengthM ?? null,
    maxRadiusM: setupMaxRadiusM ?? rule?.maxRadiusM ?? null,
    maxTipHeightM: setupMaxTipHeightM ?? rule?.maxTipHeightM ?? null,
  };
}
