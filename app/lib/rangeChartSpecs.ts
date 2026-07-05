export type RangeChartCapacityPoint = {
  radiusM: number;
  capacityKg: number;
};

export type RangeChartCapacityCurve = {
  key: string;
  label: string;
  jibLengthM?: number | null;
  boomLengthM?: number | null;
  jibAngleMinDeg?: number | null;
  jibAngleMaxDeg?: number | null;
  counterweightT?: number | null;
  points: RangeChartCapacityPoint[];
  source: string;
  setupAdvice?: string;
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
  planningWeightKg?: number | null;
  planningWeightSource?: string;
  estimatedBearingFactor?: number | null;
  capacitySource?: string;
  capacityPoints?: RangeChartCapacityPoint[];
  capacityCurves?: RangeChartCapacityCurve[];
  profileOptions?: RangeChartProfileOption[];
  jibOptions?: RangeChartJibOption[];
  notes?: string;
};

export type RangeChartCapacityResult = {
  capacityKg: number | null;
  method: "automatic" | "manual";
  source: string;
  warning?: string;
  setupAdvice?: string;
  /**
   * True only when it is acceptable to use an explicitly entered/manual capacity value.
   * For recognised structured cranes, this stays false when the exact chart/setup cannot
   * be matched, so stale max-capacity values such as 4t/35t/80t cannot be used as
   * capacity-at-radius.
   */
  allowManualCapacityFallback?: boolean;
  recognisedRuleId?: string | null;
};

export type RangeChartBearingResult = {
  bearingLoadKg: number | null;
  method: "automatic" | "manual";
  source: string;
  warning?: string;
};

export type RangeChartSetupSuggestion = {
  key: string;
  label: string;
  capacityKg: number;
  utilisationPercent: number | null;
  boomLengthM: number | null;
  jibLengthM: number | null;
  counterweightT?: number | null;
  profileKey?: string | null;
  profileLabel?: string | null;
  jibOptionKey?: string | null;
  jibOptionLabel?: string | null;
  boomAngleDeg?: number | null;
  source: string;
  advice: string;
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

function pointT(radiusM: number, capacityT: number): RangeChartCapacityPoint {
  return { radiusM, capacityKg: Math.round(capacityT * 1000) };
}

function pointsT(items: Array<[number, number]>): RangeChartCapacityPoint[] {
  return items.map(([radiusM, capacityT]) => pointT(radiusM, capacityT));
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

function curve(
  key: string,
  label: string,
  points: RangeChartCapacityPoint[],
  options: Omit<RangeChartCapacityCurve, "key" | "label" | "points">,
): RangeChartCapacityCurve {
  return { key, label, points, ...options };
}

// All curves below are deliberately used as planning aids only. They are structured from the uploaded spec-sheet charts
// so the CRM can give useful setup advice and catch obvious out-of-capacity cases. The appointed person must still
// verify the exact manufacturer/supplier chart, counterweight, outrigger setting, hook block and LMI before approval.

const AK46_MAIN = [
  point(8, 6000), point(11, 4000), point(17.7, 2000), point(26, 1000), point(34.5, 500), point(39, 250),
];

const GMK_4080_MAIN_BOOM_11_193T = pointsT([[2.5, 80.0], [3.0, 68.0], [4.0, 53.5], [5.0, 46.0], [6.0, 40.0], [7.0, 34.5], [8.0, 28.5]]);
const GMK_4080_MAIN_BOOM_15_15_193T = pointsT([[3, 57.5], [4, 50.5], [5, 44.5], [6, 39.5], [7, 34.5], [8, 30.0], [9, 25.5], [10, 22.0], [11, 18.8], [12, 16.3]]);
const GMK_4080_MAIN_BOOM_19_25_193T = pointsT([[3, 53.0], [4, 47.0], [5, 41.5], [6, 38.0], [7, 34.0], [8, 30.0], [9, 25.5], [10, 22.0], [11, 19.2], [12, 16.7], [13, 14.7], [14, 13.1], [15, 11.9], [16, 11.0]]);
const GMK_4080_MAIN_BOOM_23_30_193T = pointsT([[3, 49.5], [4, 44.0], [5, 39.0], [6, 35.0], [7, 32.0], [8, 28.5], [9, 25.0], [10, 22.5], [11, 19.1], [12, 16.6], [13, 14.8], [14, 13.7], [15, 12.3], [16, 11.1], [18, 9.2], [20, 7.7]]);
const GMK_4080_MAIN_BOOM_27_21_193T = pointsT([[4, 36.5], [5, 35.0], [6, 33.5], [7, 31.0], [8, 28.0], [9, 24.0], [10, 21.0], [11, 18.8], [12, 17.2], [13, 15.2], [14, 13.5], [15, 12.1], [16, 11.0], [18, 9.1], [20, 7.6], [22, 6.5], [24, 5.5]]);
const GMK_4080_MAIN_BOOM_31_193T = pointsT([[5, 27.5], [6, 26.5], [7, 25.5], [8, 24.5], [9, 23.0], [10, 20.5], [11, 18.4], [12, 16.4], [13, 14.7], [14, 13.1], [15, 11.7], [16, 10.5], [18, 8.8], [20, 8.0], [22, 6.8], [24, 5.9], [26, 5.1], [28, 3.7]]);
const GMK_4080_MAIN_BOOM_35_15_193T = pointsT([[6, 20.0], [7, 19.7], [8, 19.3], [9, 18.2], [10, 17.1], [11, 16.0], [12, 15.0], [13, 13.9], [14, 12.6], [15, 11.4], [16, 10.5], [18, 9.1], [20, 7.6], [22, 6.5], [24, 5.5], [26, 4.8], [28, 4.1], [30, 3.6], [32, 3.1]]);
const GMK_4080_MAIN_BOOM_39_25_193T = pointsT([[7, 15.3], [8, 15.3], [9, 15.1], [10, 14.8], [11, 14.0], [12, 13.3], [13, 12.5], [14, 11.8], [15, 11.0], [16, 10.1], [18, 8.3], [20, 7.1], [22, 6.6], [24, 5.7], [26, 4.9], [28, 4.3], [30, 3.9], [32, 3.6], [34, 3.2], [36, 1.6]]);
const GMK_4080_MAIN_BOOM_43_30_193T = pointsT([[8, 11.5], [9, 11.5], [10, 11.5], [11, 11.5], [12, 11.5], [13, 11.2], [14, 10.8], [15, 10.3], [16, 9.7], [18, 8.4], [20, 7.0], [22, 6.1], [24, 5.6], [26, 5.0], [28, 4.3], [30, 3.8], [32, 3.4], [34, 3.0], [36, 2.6], [38, 2.3], [40, 1.1]]);
const GMK_4080_MAIN_BOOM_47_21_193T = pointsT([[9, 8.9], [10, 8.9], [11, 8.9], [12, 8.9], [13, 8.9], [14, 8.9], [15, 8.9], [16, 8.6], [18, 8.0], [20, 7.3], [22, 6.1], [24, 5.5], [26, 4.9], [28, 4.2], [30, 3.7], [32, 3.2], [34, 2.8], [36, 2.4], [38, 2.1], [40, 1.8], [42, 1.5]]);
const GMK_4080_MAIN_BOOM_51_193T = pointsT([[10, 7.2], [11, 7.2], [12, 7.2], [13, 7.2], [14, 7.2], [15, 7.2], [16, 7.2], [18, 7.2], [20, 6.7], [22, 6.3], [24, 5.4], [26, 4.6], [28, 4.0], [30, 3.4], [32, 2.9], [34, 2.5], [36, 2.1], [38, 1.8], [40, 1.5], [42, 1.3], [44, 1.0], [46, 0.8]]);

const GMK_4080_SWINGAWAY_8_7_51_020_193T = pointsT([
  [12, 4.2], [13, 4.1], [14, 4.0], [15, 4.0], [16, 3.9], [18, 3.8], [20, 3.6], [22, 3.5], [24, 3.4],
  [26, 3.3], [28, 3.3], [30, 3.2], [32, 3.1], [34, 3.0], [36, 2.8], [38, 2.5], [40, 2.1], [42, 1.7], [44, 1.2],
]);

const GMK_4080_SWINGAWAY_15_51_020_193T = pointsT([
  [15, 2.3], [16, 2.2], [18, 2.1], [20, 2.0], [22, 2.0], [24, 1.9], [26, 1.8], [28, 1.8], [30, 1.7],
  [32, 1.7], [34, 1.7], [36, 1.6], [38, 1.5], [40, 1.2], [42, 1.0], [44, 0.7],
]);

const GMK_4080_EXTENSION_21_51_020_193T = pointsT([
  [18, 2.1], [20, 2.0], [22, 2.0], [24, 1.9], [26, 1.8], [28, 1.8], [30, 1.7], [32, 1.7], [34, 1.7],
  [36, 1.6], [38, 1.6], [40, 1.5], [42, 1.5], [44, 1.5], [46, 1.3], [48, 1.1], [50, 0.9], [52, 0.8], [54, 0.6],
]);

const JEKKO_SPX532_MAIN_J7_LONG_BOOM = pointsT([
  [1, 1.45], [2, 1.27], [3, 1.17], [4, 1.03], [5, 0.96], [6, 0.90], [7, 0.80], [8, 0.64], [9, 0.52], [9.45, 0.47],
]);
const JEKKO_SPX532_MAIN_J6_LONG_BOOM = pointsT([
  [1, 1.45], [2, 1.27], [3, 1.17], [4, 1.03], [5, 0.96], [6, 0.80], [7, 0.60], [8, 0.48], [9, 0.40], [9.45, 0.32],
]);
// Fallback planning curve used only when the SPX532 is recognised as main-boom work but the exact J-rating
// has not been selected in the setup dropdown/text yet. It deliberately follows the reduced J6 long-boom line,
// not the 3.2t maximum machine capacity, so the CRM gives a useful preliminary capacity without hiding the
// appointed-person verification warning.
const JEKKO_SPX532_MAIN_CONSERVATIVE_PENDING_J_RATING = JEKKO_SPX532_MAIN_J6_LONG_BOOM;
const JEKKO_SPX532_MAIN_J5 = pointsT([
  [1, 0.40], [2, 0.40], [3, 0.30], [4, 0.28], [5, 0.20],
]);
const JEKKO_SPX532_JIB1000_J5_51 = pointsT([
  [1, 0.22], [2, 0.21], [3, 0.20], [4, 0.19], [5, 0.18],
]);
const JEKKO_SPX532_JIB500GR = [point(4, 500), point(8, 400), point(10, 300), point(12, 200)];

const HK40_MAIN_10_5_45T = pointsT([[3, 35.0], [3.5, 31.6], [4, 29.0], [4.5, 26.8], [5, 24.5], [6, 21.0], [7, 18.2]]);
const HK40_MAIN_15_4_45T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 20.0], [7, 18.5], [8, 14.7], [9, 12.1], [10, 10.2], [11, 8.7], [12, 7.6]]);
const HK40_MAIN_20_4_45T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 20.0], [7, 17.4], [8, 14.6], [9, 12.2], [10, 10.3], [11, 8.8], [12, 7.6], [14, 5.9], [16, 4.8]]);
const HK40_MAIN_25_3_45T = pointsT([[3, 15.0], [3.5, 15.0], [4, 15.0], [4.5, 15.0], [5, 14.8], [6, 13.7], [7, 12.6], [8, 11.7], [9, 10.8], [10, 10.1], [11, 8.9], [12, 7.7], [14, 6.0], [16, 4.8], [18, 3.9], [20, 3.2], [22, 2.7]]);
const HK40_MAIN_30_3_45T = pointsT([[4.5, 10.3], [5, 10.3], [6, 10.3], [7, 10.3], [8, 9.6], [9, 8.9], [10, 8.3], [11, 7.8], [12, 7.3], [14, 6.0], [16, 4.8], [18, 3.9], [20, 3.2], [22, 2.7], [24, 2.2], [26, 1.9]]);
const HK40_MAIN_32_7_45T = pointsT([[6, 8.9], [7, 8.9], [8, 8.8], [9, 8.2], [10, 7.6], [11, 7.2], [12, 6.7], [14, 6.0], [16, 4.9], [18, 4.0], [20, 3.3], [22, 2.7], [24, 2.2], [26, 1.9], [28, 1.6]]);
const HK40_MAIN_35_2_45T = pointsT([[6, 7.6], [7, 7.6], [8, 7.6], [9, 7.6], [10, 7.1], [11, 6.7], [12, 6.3], [14, 5.6], [16, 4.9], [18, 4.0], [20, 3.3], [22, 2.7], [24, 2.2], [26, 1.9], [28, 1.6], [30, 1.3], [32, 1.1]]);
const HK40_MAIN_10_5_21T = pointsT([[3, 35.0], [3.5, 31.5], [4, 28.8], [4.5, 26.4], [5, 24.2], [6, 20.6], [7, 15.8]]);
const HK40_MAIN_15_4_21T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 20.0], [7, 16.1], [8, 12.8], [9, 10.5], [10, 8.8], [11, 7.5], [12, 6.5]]);
const HK40_MAIN_20_4_21T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 18.6], [7, 15.2], [8, 12.7], [9, 10.6], [10, 8.8], [11, 7.6], [12, 6.5], [14, 5.0], [16, 3.9]]);
const HK40_MAIN_25_3_21T = pointsT([[3, 15.0], [3.5, 15.0], [4, 15.0], [4.5, 15.0], [5, 14.8], [6, 13.7], [7, 12.6], [8, 11.7], [9, 10.3], [10, 8.9], [11, 7.6], [12, 6.6], [14, 5.0], [16, 3.9], [18, 3.1], [20, 2.5], [22, 2.0]]);
const HK40_MAIN_30_3_21T = pointsT([[4.5, 10.3], [5, 10.3], [6, 10.3], [7, 10.3], [8, 9.6], [9, 8.9], [10, 8.3], [11, 7.6], [12, 6.7], [14, 5.1], [16, 4.0], [18, 3.1], [20, 2.5], [22, 2.0], [24, 1.7], [26, 1.3]]);
const HK40_MAIN_32_7_21T = pointsT([[6, 8.9], [7, 8.9], [8, 8.8], [9, 8.2], [10, 7.6], [11, 7.2], [12, 6.6], [14, 5.1], [16, 4.0], [18, 3.2], [20, 2.6], [22, 2.1], [24, 1.7], [26, 1.4], [28, 1.1]]);
const HK40_MAIN_35_2_21T = pointsT([[6, 7.6], [7, 7.6], [8, 7.6], [9, 7.6], [10, 7.1], [11, 6.7], [12, 6.3], [14, 5.1], [16, 4.0], [18, 3.2], [20, 2.6], [22, 2.1], [24, 1.7], [26, 1.4], [28, 1.1], [30, 0.9], [32, 0.7]]);
const HK40_MAIN_10_5_14T = pointsT([[3, 35.0], [3.5, 31.1], [4, 28.3], [4.5, 26.1], [5, 23.5], [6, 19.2], [7, 15.1]]);
const HK40_MAIN_15_4_14T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 19.4], [7, 15.4], [8, 12.2], [9, 10.0], [10, 8.4], [11, 7.1], [12, 6.1]]);
const HK40_MAIN_20_4_14T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 17.8], [7, 14.5], [8, 12.2], [9, 10.1], [10, 8.4], [11, 7.2], [12, 6.2], [14, 4.6], [16, 3.6]]);
const HK40_MAIN_25_3_14T = pointsT([[3, 15.0], [3.5, 15.0], [4, 15.0], [4.5, 15.0], [5, 14.8], [6, 13.7], [7, 12.6], [8, 11.5], [9, 9.9], [10, 8.5], [11, 7.3], [12, 6.2], [14, 4.7], [16, 3.6], [18, 2.9], [20, 2.3], [22, 1.9]]);
const HK40_MAIN_30_3_14T = pointsT([[4.5, 10.3], [5, 10.3], [6, 10.3], [7, 10.3], [8, 9.6], [9, 8.9], [10, 8.2], [11, 7.2], [12, 6.3], [14, 4.8], [16, 3.7], [18, 2.9], [20, 2.3], [22, 1.9], [24, 1.5], [26, 1.2]]);
const HK40_MAIN_32_7_14T = pointsT([[6, 8.9], [7, 8.9], [8, 8.8], [9, 8.2], [10, 7.6], [11, 7.0], [12, 6.2], [14, 4.8], [16, 3.7], [18, 2.9], [20, 2.3], [22, 1.9], [24, 1.5], [26, 1.2], [28, 0.9]]);
const HK40_MAIN_35_2_14T = pointsT([[6, 7.6], [7, 7.6], [8, 7.6], [9, 7.6], [10, 7.1], [11, 6.7], [12, 6.1], [14, 4.8], [16, 3.7], [18, 2.9], [20, 2.4], [22, 1.9], [24, 1.5], [26, 1.2], [28, 0.9], [30, 0.7], [32, 0.6]]);
const HK40_MAIN_10_5_0T = pointsT([[3, 34.0], [3.5, 31.0], [4, 28.8], [4.5, 26.1], [5, 23.4], [6, 19.0], [7, 14.2]]);
const HK40_MAIN_15_4_0T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 17.8], [7, 14.3], [8, 11.5], [9, 9.4], [10, 7.8], [11, 6.6], [12, 5.6]]);
const HK40_MAIN_20_4_0T = pointsT([[3, 20.0], [3.5, 20.0], [4, 20.0], [4.5, 20.0], [5, 20.0], [6, 16.3], [7, 13.3], [8, 11.1], [9, 9.4], [10, 7.9], [11, 6.6], [12, 5.7], [14, 4.2], [16, 3.3]]);
const HK40_MAIN_25_3_0T = pointsT([[3, 15.0], [3.5, 15.0], [4, 15.0], [4.5, 15.0], [5, 14.8], [6, 13.7], [7, 12.4], [8, 10.5], [9, 8.9], [10, 7.6], [11, 6.6], [12, 5.7], [14, 4.3], [16, 3.3], [18, 2.6], [20, 2.0], [22, 1.6]]);
const HK40_MAIN_30_3_0T = pointsT([[4.5, 10.3], [5, 10.3], [6, 10.3], [7, 10.3], [8, 9.6], [9, 8.4], [10, 7.3], [11, 6.3], [12, 5.6], [14, 4.3], [16, 3.3], [18, 2.6], [20, 2.1], [22, 1.6], [24, 1.3], [26, 1.0]]);
const HK40_MAIN_32_7_0T = pointsT([[6, 8.9], [7, 8.9], [8, 8.8], [9, 8.2], [10, 7.1], [11, 6.2], [12, 5.5], [14, 4.3], [16, 3.4], [18, 2.6], [20, 2.1], [22, 1.6], [24, 1.3], [26, 1.0], [28, 0.7]]);
const HK40_MAIN_35_2_0T = pointsT([[6, 7.6], [7, 7.6], [8, 7.6], [9, 7.6], [10, 6.9], [11, 6.1], [12, 5.4], [14, 4.2], [16, 3.4], [18, 2.6], [20, 2.1], [22, 1.6], [24, 1.3], [26, 1.0], [28, 0.7], [30, 0.5]]);

const MTK35_MAIN_32 = pointsT([[6, 7.0], [7, 7.0], [8, 7.0], [9, 6.8], [10, 6.5], [12, 5.4], [14, 4.0], [16, 3.1], [18, 2.3], [20, 1.8], [22, 1.4], [24, 1.0], [26, 0.7], [28, 0.5]]);
const MTK35_MAIN_26_5 = pointsT([[4, 10.8], [5, 10.8], [6, 10.6], [7, 10.4], [8, 10.2], [9, 9.1], [10, 7.5], [12, 5.3], [14, 4.0], [16, 3.0], [18, 2.3], [20, 1.7], [22, 1.3]]);
const MTK35_MAIN_19_9 = pointsT([[3, 16.5], [3.5, 16.5], [4, 16.5], [5, 16.4], [6, 16.0], [7, 14.2], [8, 11.2], [9, 8.9], [10, 7.3], [12, 5.2], [14, 3.8], [16, 2.8]]);
const MTK35_MAIN_10 = pointsT([[2.5, 35.0], [3, 29.0], [3.5, 24.5], [4, 22.2], [5, 19.0], [6, 16.4], [7, 13.7]]);
const MTK35_MAIN_13_3 = pointsT([[3, 17.5], [3.5, 17.5], [4, 17.5], [5, 17.5], [6, 16.7], [7, 14.0], [8, 10.8], [9, 8.5], [10, 6.9]]);
const MTK35_MAIN_16_6 = pointsT([[3, 17.1], [3.5, 17.1], [4, 17.1], [5, 17.1], [6, 16.8], [7, 14.1], [8, 11.0], [9, 8.8], [10, 7.2], [12, 5.1], [14, 3.7]]);
const MTK35_MAIN_23_2 = pointsT([[3.5, 16.0], [4, 16.0], [5, 16.0], [6, 15.8], [7, 14.2], [8, 11.3], [9, 9.0], [10, 7.4], [12, 5.3], [14, 3.9], [16, 2.9], [18, 2.2], [20, 1.6]]);
const MTK35_MAIN_29_8 = pointsT([[5, 7.8], [6, 7.8], [7, 7.8], [8, 7.8], [9, 7.7], [10, 7.5], [12, 5.4], [14, 4.0], [16, 3.0], [18, 2.3], [20, 1.8], [22, 1.3], [24, 1.0], [26, 0.7]]);
const MTK35_EXTENSION_8_0 = pointsT([
  [8, 2.7], [10, 2.7], [12, 2.7], [14, 2.7], [16, 2.6], [18, 2.4], [20, 1.9], [22, 1.4], [24, 1.1],
  [26, 0.8], [28, 0.6], [30, 0.4], [32, 0.3], [34, 0.3],
]);
const MTK35_EXTENSION_8_20 = pointsT([
  [10, 2.5], [12, 2.5], [14, 2.5], [16, 2.5], [18, 2.4], [20, 2.1], [22, 1.6], [24, 1.2], [26, 0.9],
  [28, 0.7], [30, 0.4],
]);
const MTK35_EXTENSION_8_40 = pointsT([
  [12, 2.3], [14, 2.3], [16, 2.2], [18, 2.1], [20, 2.0], [22, 1.7], [24, 1.3], [26, 1.0], [28, 0.7],
  [30, 0.5], [32, 0.5], [34, 0.4],
]);
const MTK35_EXTENSION_14_5_0 = pointsT([
  [10, 1.4], [12, 1.4], [14, 1.3], [16, 1.3], [18, 1.2], [20, 1.2], [22, 1.1], [24, 1.0], [26, 0.9],
  [28, 0.7], [30, 0.5], [32, 0.5],
]);
const MTK35_EXTENSION_14_5_20 = pointsT([
  [12, 1.2], [14, 1.2], [16, 1.1], [18, 1.1], [20, 1.0], [22, 0.9], [24, 0.8], [26, 0.8], [28, 0.7],
  [30, 0.7], [32, 0.6],
]);
const MTK35_EXTENSION_14_5_40 = pointsT([
  [16, 0.8], [18, 0.8], [20, 0.8], [22, 0.8], [24, 0.7], [26, 0.7], [28, 0.7], [30, 0.7],
]);

export const RANGE_CHART_SPEC_RULES: RangeChartSpecRule[] = [
  {
    id: "ak46-6000",
    title: "Böcker AK 46/6000",
    match: [/\bak\s*46(?:\/6000)?\b/i, /\bbocker\b.*\bak\s*46/i, /\bböcker\b.*\bak\s*46/i, /\bak46\b/i],
    maxCapacityKg: 6000,
    maxBoomLengthM: 46,
    // AK46 maximum extension/boom length is the total crane extension, including the hydraulic 11 m extension.
    // Do not add a separate 11 m jib on top of 46 m in the range sketch.
    maxPhysicalJibLengthM: 0,
    maxRadiusM: 39,
    maxTipHeightM: 46,
    planningWeightKg: 26000,
    planningWeightSource: "AK 46/6000 spec: permissible gross vehicle weight up to 26 t",
    estimatedBearingFactor: 0.75,
    profileOptions: [
      profile("ak46-crane-operation", "AK46 crane-operation range table / total boom-extension up to 46 m", null, 46, 39, 46, "AK 46/6000 crane-operation range/load table"),
      profile("ak46-total-44", "AK46 total boom-extension up to 44 m", null, 44, 38, 43.3, "AK 46/6000 technical information"),
      profile("ak46-total-46", "AK46 optional total boom-extension up to 46 m", null, 46, 39, 46, "AK 46/6000 technical information"),
    ],
    jibOptions: [
      jib("none", "No separate additive jib — hydraulic extension is included in the 46 m total boom-extension", 0, 39, 46, "AK 46/6000: 5.3 m / 8.1 m / 11.0 m hydraulic extension is included within the 44 m / optional 46 m total extension length"),
    ],
    capacitySource: "AK 46/6000 spec: crane-operation range/load table",
    capacityPoints: AK46_MAIN,
    capacityCurves: [
      curve("ak46-main", "AK46 crane-operation range table", AK46_MAIN, {
        jibLengthM: null,
        boomLengthM: 46,
        source: "AK 46/6000 spec: 6t at 8m, 4t at 11m, 2t at 17.7m, 1t at 26m, 500kg at 34.5m, 250kg at 39m",
        setupAdvice: "AK46 preliminary check: use the published crane-operation range/load table for capacity at radius. The 44 m / optional 46 m maximum is the total boom-extension length and already includes the hydraulic extension; do not add an extra 11 m jib on top of the 46 m total. Do not apply the 800 kg extension marker as a hard cap where the crane-operation chart gives 1,000 kg up to 26 m. Confirm single/two-fall operation, exact boom/extension configuration and LMI before approval.",
      }),
    ],
    notes: "Uses the published AK 46/6000 range/load points as a conservative planning curve. The 46 m maximum is treated as total boom-extension length including the hydraulic extension, not 46 m plus a separate 11 m jib. Final duty must still be checked on the supplier/manufacturer chart.",
  },
  {
    id: "gmk4080-1",
    title: "Grove GMK4080-1",
    match: [/\bgmk\s*4080\s*-?\s*1\b/i, /\bgrove\b.*\b4080\s*-?\s*1\b/i, /\bmanitowoc\b.*\b4080\b/i],
    maxCapacityKg: 80000,
    maxBoomLengthM: 51,
    maxPhysicalJibLengthM: 21,
    maxRadiusM: 75,
    maxTipHeightM: 75,
    planningWeightKg: 48000,
    planningWeightSource: "GMK4080-1 product guide: total weight 48 t with 9.3 t counterweight",
    estimatedBearingFactor: 0.75,
    profileOptions: [
      profile("gmk4080-main-11-193t", "Main boom 11.0 m — 19.3 t counterweight chart", 11.0, 11.0, null, 54, "GMK4080-1 load chart: 11.0 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-15_15-193t", "Main boom 15.15 m — 19.3 t counterweight chart", 15.15, 15.15, null, 54, "GMK4080-1 load chart: 15.15 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-19_25-193t", "Main boom 19.25 m — 19.3 t counterweight chart", 19.25, 19.25, null, 54, "GMK4080-1 load chart: 19.25 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-23_30-193t", "Main boom 23.30 m — 19.3 t counterweight chart", 23.3, 23.3, null, 54, "GMK4080-1 load chart: 23.30 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-27_21-193t", "Main boom 27.21 m — 19.3 t counterweight chart", 27.21, 27.21, null, 54, "GMK4080-1 load chart: 27.21 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-31-193t", "Main boom 31.0 m — 19.3 t counterweight chart", 31.0, 31.0, null, 54, "GMK4080-1 load chart: 31.0 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-35_15-193t", "Main boom 35.15 m — 19.3 t counterweight chart", 35.15, 35.15, null, 54, "GMK4080-1 load chart: 35.15 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-39_25-193t", "Main boom 39.25 m — 19.3 t counterweight chart", 39.25, 39.25, null, 54, "GMK4080-1 load chart: 39.25 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-43_30-193t", "Main boom 43.30 m — 19.3 t counterweight chart", 43.3, 43.3, null, 54, "GMK4080-1 load chart: 43.30 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-47_21-193t", "Main boom 47.21 m — 19.3 t counterweight chart", 47.21, 47.21, null, 54, "GMK4080-1 load chart: 47.21 m main boom, 19.3 t counterweight"),
      profile("gmk4080-main-51-193t", "Main boom 51.0 m — 19.3 t counterweight chart", 51.0, 51.0, null, 54, "GMK4080-1 load chart: 51.0 m main boom, 19.3 t counterweight"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("gmk4080-swingaway-8-7", "8.7 m bi-fold swingaway", 8.7, 46, 63, "GMK4080-1 optional bi-fold swingaway 8.7 m"),
      jib("gmk4080-swingaway-15", "15 m bi-fold swingaway", 15, 50, 69, "GMK4080-1 optional bi-fold swingaway 15 m"),
      jib("gmk4080-lattice-21", "21 m lattice extension", 21, 54, 75, "GMK4080-1 optional 21 m lattice extension"),
    ],
    capacitySource: "GMK4080-1 product guide load charts. Exact table/counterweight must still be verified before lifting.",
    capacityCurves: [
      curve("gmk-main-11-193t", "GMK4080-1 11.0 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_11_193T, { boomLengthM: 11.0, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 11.0 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 11.0 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-15_15-193t", "GMK4080-1 15.15 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_15_15_193T, { boomLengthM: 15.15, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 15.15 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 15.15 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-19_25-193t", "GMK4080-1 19.25 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_19_25_193T, { boomLengthM: 19.25, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 19.25 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 19.25 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-23_30-193t", "GMK4080-1 23.30 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_23_30_193T, { boomLengthM: 23.3, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 23.30 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 23.30 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-27_21-193t", "GMK4080-1 27.21 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_27_21_193T, { boomLengthM: 27.21, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 27.21 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 27.21 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-31-193t", "GMK4080-1 31.0 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_31_193T, { boomLengthM: 31.0, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 31.0 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 31.0 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-35_15-193t", "GMK4080-1 35.15 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_35_15_193T, { boomLengthM: 35.15, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 35.15 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 35.15 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-39_25-193t", "GMK4080-1 39.25 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_39_25_193T, { boomLengthM: 39.25, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 39.25 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 39.25 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-43_30-193t", "GMK4080-1 43.30 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_43_30_193T, { boomLengthM: 43.3, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 43.30 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 43.30 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-47_21-193t", "GMK4080-1 47.21 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_47_21_193T, { boomLengthM: 47.21, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 47.21 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 47.21 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-main-51-193t", "GMK4080-1 51.0 m main boom, 19.3 t counterweight", GMK_4080_MAIN_BOOM_51_193T, { boomLengthM: 51.0, jibLengthM: 0, counterweightT: 19.3, source: "GMK4080-1 load chart: 51.0 m telescopic boom, 360°, 19.3 t counterweight", setupAdvice: "Selected GMK4080-1 51.0 m boom / 19.3 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("gmk-8-7-51-020-193t", "51 m boom + 8.7 m swingaway, 0°-20°, 19.3 t", GMK_4080_SWINGAWAY_8_7_51_020_193T, {
        boomLengthM: 51, jibLengthM: 8.7, jibAngleMinDeg: 0, jibAngleMaxDeg: 20, counterweightT: 19.3,
        source: "GMK4080-1 swingaway load chart: 51.0 m boom + 8.7 m swingaway, 0°-20°, 360°, 19.3 t counterweight",
        setupAdvice: "Use 8.7 m swingaway only where the extra height/reach is needed; main boom only may give more capacity.",
      }),
      curve("gmk-15-51-020-193t", "51 m boom + 15 m swingaway, 0°-20°, 19.3 t", GMK_4080_SWINGAWAY_15_51_020_193T, {
        boomLengthM: 51, jibLengthM: 15, jibAngleMinDeg: 0, jibAngleMaxDeg: 20, counterweightT: 19.3,
        source: "GMK4080-1 swingaway load chart: 51.0 m boom + 15.0 m swingaway, 0°-20°, 360°, 19.3 t counterweight",
        setupAdvice: "Use 15 m swingaway only where required. If capacity is tight, check 8.7 m swingaway or main boom only.",
      }),
      curve("gmk-21-51-020-193t", "51 m boom + 21 m extension, 0°-20°, 19.3 t", GMK_4080_EXTENSION_21_51_020_193T, {
        boomLengthM: 51, jibLengthM: 21, jibAngleMinDeg: 0, jibAngleMaxDeg: 20, counterweightT: 19.3,
        source: "GMK4080-1 boom-extension load chart: 51.0 m boom + 21.0 m extension, 0°-20°, 360°, 19.3 t counterweight",
        setupAdvice: "Use the 21 m extension only for the extra height/reach. If capacity is tight, try shorter fly jib or main boom only.",
      }),
    ],
    notes: "Structured preliminary curves cover common long-boom and extension options. Final manufacturer chart/LMI verification is mandatory.",
  },
  {
    id: "spx532",
    title: "Jekko SPX532",
    match: [/\bspx\s*532[a-z0-9-]*\b/i, /\bspx532[a-z0-9-]*\b/i, /\bjekko\b.*\b532[a-z0-9-]*\b/i],
    maxCapacityKg: 3200,
    maxBoomLengthM: 10.8,
    maxPhysicalJibLengthM: 5.1,
    maxRadiusM: 14.8,
    maxTipHeightM: 17.3,
    planningWeightKg: 2520,
    planningWeightSource: "SPX532 spec: dry crane weight 2520 kg",
    estimatedBearingFactor: 0.75,
    profileOptions: [
      profile("spx532-main-j7", "Main boom — J7/full-stability planning chart", 10.3, 10.8, 9.7, 12.1, "SPX532 main boom J7 chart"),
      profile("spx532-main-j6", "Main boom — J6 reduced-stability planning chart", 10.3, 10.8, 9.7, 12.1, "SPX532 main boom J6 chart"),
      profile("spx532-main-j5", "Main boom — J5 reduced-stability planning chart", 5.7, 10.8, 5, 12.1, "SPX532 main boom J5 chart"),
    ],
    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("spx532-jib500gr", "JIB500GR grabber jib", 0.5, 12, 14.8, "SPX532 JIB500GR planning chart"),
      jib("spx532-jib1000", "JIB1000.2H1MX long jib", 5.1, 5, 17.3, "SPX532 JIB1000.2H1MX chart"),
    ],
    defaultBearingLoadKg: 3000,
    bearingLoadSource: "Jekko SPX532 spec: static outrigger load 3000 kg",
    capacitySource: "Jekko SPX532 spec: structured J-rating/load charts; exact outrigger/stability rating must be verified.",
    capacityCurves: [
      curve("spx532-main-j7", "SPX532 main boom J7/full stability", JEKKO_SPX532_MAIN_J7_LONG_BOOM, {
        boomLengthM: 10.8, jibLengthM: 0, source: "SPX532 page 10: main boom J7 chart, L up to 10.3 m", setupAdvice: "Use only if the outrigger/stability area gives J7 crane performance.",
      }),
      curve("spx532-main-j6", "SPX532 main boom J6", JEKKO_SPX532_MAIN_J6_LONG_BOOM, {
        boomLengthM: 10.8, jibLengthM: 0, source: "SPX532 page 10: main boom J6 chart, L up to 10.3 m", setupAdvice: "Use only if the outrigger/stability area gives J6 crane performance.",
      }),
      curve("spx532-main-j5", "SPX532 main boom J5", JEKKO_SPX532_MAIN_J5, {
        boomLengthM: 5.7, jibLengthM: 0, source: "SPX532 page 11: main boom J5 chart", setupAdvice: "Use only if the outrigger/stability area gives J5 crane performance.",
      }),
      curve("spx532-main-pending-j-rating", "SPX532 main boom conservative planning curve pending J-rating verification", JEKKO_SPX532_MAIN_CONSERVATIVE_PENDING_J_RATING, {
        boomLengthM: 10.8,
        jibLengthM: 0,
        source: "SPX532 preliminary main-boom planning curve using the reduced J6 long-boom line until exact J-rating/stability is verified",
        setupAdvice: "Preliminary only: the CRM has used the conservative SPX532 main-boom J6 planning line because the exact J-rating/stability setup has not been selected. The appointed person must verify the actual outrigger spread, stability/J-rating, boom length, hook/accessory allowance and manufacturer chart before approval.",
      }),
      curve("spx532-jib1000-j5", "SPX532 JIB1000.2H1MX J5", JEKKO_SPX532_JIB1000_J5_51, {
        jibLengthM: 5.1, boomLengthM: 10.8, source: "SPX532 page 14: JIB1000.2H1MX J5 chart, LJ 5.1 m", setupAdvice: "Use only if the selected outrigger/stability area gives J5 crane performance.",
      }),
      curve("spx532-jib500gr", "SPX532 JIB500GR planning curve", JEKKO_SPX532_JIB500GR, {
        jibLengthM: 0.5, boomLengthM: 10.8, source: "SPX532 page 18: JIB500GR working-range chart", setupAdvice: "Verify the exact JIB500GR chart before approval.",
      }),
    ],
    notes: "SPX532 duties depend heavily on the outrigger/stability J-rating. The CRM can advise from structured J7/J6/J5 curves, but the selected stability rating must be confirmed before approval.",
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
    planningWeightKg: 32000,
    planningWeightSource: "HK 40 spec: total weight up to 32 t depending chassis/options",
    estimatedBearingFactor: 0.75,
    profileOptions: [
      profile("hk40-main-10_5-45t", "Main boom 10.5 m — 4.5 t counterweight chart", 10.5, 10.5, 32, 10.5, "HK 40 load chart: 10.5 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-15_4-45t", "Main boom 15.4 m — 4.5 t counterweight chart", 15.4, 15.4, 32, 15.4, "HK 40 load chart: 15.4 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-20_4-45t", "Main boom 20.4 m — 4.5 t counterweight chart", 20.4, 20.4, 32, 20.4, "HK 40 load chart: 20.4 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-25_3-45t", "Main boom 25.3 m — 4.5 t counterweight chart", 25.3, 25.3, 32, 25.3, "HK 40 load chart: 25.3 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-30_3-45t", "Main boom 30.3 m — 4.5 t counterweight chart", 30.3, 30.3, 32, 30.3, "HK 40 load chart: 30.3 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-32_7-45t", "Main boom 32.7 m — 4.5 t counterweight chart", 32.7, 32.7, 32, 32.7, "HK 40 load chart: 32.7 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-35_2-45t", "Main boom 35.2 m — 4.5 t counterweight chart", 35.2, 35.2, 32, 35.2, "HK 40 load chart: 35.2 m main boom, 360°, 4.5 t counterweight"),
      profile("hk40-main-10_5-21t", "Main boom 10.5 m — 2.1 t counterweight chart", 10.5, 10.5, 32, 10.5, "HK 40 load chart: 10.5 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-15_4-21t", "Main boom 15.4 m — 2.1 t counterweight chart", 15.4, 15.4, 32, 15.4, "HK 40 load chart: 15.4 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-20_4-21t", "Main boom 20.4 m — 2.1 t counterweight chart", 20.4, 20.4, 32, 20.4, "HK 40 load chart: 20.4 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-25_3-21t", "Main boom 25.3 m — 2.1 t counterweight chart", 25.3, 25.3, 32, 25.3, "HK 40 load chart: 25.3 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-30_3-21t", "Main boom 30.3 m — 2.1 t counterweight chart", 30.3, 30.3, 32, 30.3, "HK 40 load chart: 30.3 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-32_7-21t", "Main boom 32.7 m — 2.1 t counterweight chart", 32.7, 32.7, 32, 32.7, "HK 40 load chart: 32.7 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-35_2-21t", "Main boom 35.2 m — 2.1 t counterweight chart", 35.2, 35.2, 32, 35.2, "HK 40 load chart: 35.2 m main boom, 360°, 2.1 t counterweight"),
      profile("hk40-main-10_5-14t", "Main boom 10.5 m — 1.4 t counterweight chart", 10.5, 10.5, 32, 10.5, "HK 40 load chart: 10.5 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-15_4-14t", "Main boom 15.4 m — 1.4 t counterweight chart", 15.4, 15.4, 32, 15.4, "HK 40 load chart: 15.4 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-20_4-14t", "Main boom 20.4 m — 1.4 t counterweight chart", 20.4, 20.4, 32, 20.4, "HK 40 load chart: 20.4 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-25_3-14t", "Main boom 25.3 m — 1.4 t counterweight chart", 25.3, 25.3, 32, 25.3, "HK 40 load chart: 25.3 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-30_3-14t", "Main boom 30.3 m — 1.4 t counterweight chart", 30.3, 30.3, 32, 30.3, "HK 40 load chart: 30.3 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-32_7-14t", "Main boom 32.7 m — 1.4 t counterweight chart", 32.7, 32.7, 32, 32.7, "HK 40 load chart: 32.7 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-35_2-14t", "Main boom 35.2 m — 1.4 t counterweight chart", 35.2, 35.2, 32, 35.2, "HK 40 load chart: 35.2 m main boom, 360°, 1.4 t counterweight"),
      profile("hk40-main-10_5-0t", "Main boom 10.5 m — 0 t counterweight chart", 10.5, 10.5, 32, 10.5, "HK 40 load chart: 10.5 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-15_4-0t", "Main boom 15.4 m — 0 t counterweight chart", 15.4, 15.4, 32, 15.4, "HK 40 load chart: 15.4 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-20_4-0t", "Main boom 20.4 m — 0 t counterweight chart", 20.4, 20.4, 32, 20.4, "HK 40 load chart: 20.4 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-25_3-0t", "Main boom 25.3 m — 0 t counterweight chart", 25.3, 25.3, 32, 25.3, "HK 40 load chart: 25.3 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-30_3-0t", "Main boom 30.3 m — 0 t counterweight chart", 30.3, 30.3, 32, 30.3, "HK 40 load chart: 30.3 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-32_7-0t", "Main boom 32.7 m — 0 t counterweight chart", 32.7, 32.7, 32, 32.7, "HK 40 load chart: 32.7 m main boom, 360°, 0 t counterweight"),
      profile("hk40-main-35_2-0t", "Main boom 35.2 m — 0 t counterweight chart", 35.2, 35.2, 32, 35.2, "HK 40 load chart: 35.2 m main boom, 360°, 0 t counterweight"),
    ],
    jibOptions: [jib("none", "No jib / main boom only", 0), jib("hk40-extension-9", "9 m boom extension", 9, null, 44.2, "HK 40 spec: 9 m boom extension")],
    capacitySource: "HK 40 uploaded load charts. Select the correct counterweight chart and verify exact boom length/radius before approval.",
    capacityCurves: [
      curve("hk40-main-10_5-45t", "HK40 10.5 m main boom, 4.5 t counterweight", HK40_MAIN_10_5_45T, { boomLengthM: 10.5, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 10.5 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 10.5 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-15_4-45t", "HK40 15.4 m main boom, 4.5 t counterweight", HK40_MAIN_15_4_45T, { boomLengthM: 15.4, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 15.4 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 15.4 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-20_4-45t", "HK40 20.4 m main boom, 4.5 t counterweight", HK40_MAIN_20_4_45T, { boomLengthM: 20.4, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 20.4 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 20.4 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-25_3-45t", "HK40 25.3 m main boom, 4.5 t counterweight", HK40_MAIN_25_3_45T, { boomLengthM: 25.3, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 25.3 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 25.3 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-30_3-45t", "HK40 30.3 m main boom, 4.5 t counterweight", HK40_MAIN_30_3_45T, { boomLengthM: 30.3, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 30.3 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 30.3 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-32_7-45t", "HK40 32.7 m main boom, 4.5 t counterweight", HK40_MAIN_32_7_45T, { boomLengthM: 32.7, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 32.7 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 32.7 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-35_2-45t", "HK40 35.2 m main boom, 4.5 t counterweight", HK40_MAIN_35_2_45T, { boomLengthM: 35.2, jibLengthM: 0, counterweightT: 4.5, source: "HK 40 load chart: 35.2 m main boom, 360°, 4.5 t counterweight", setupAdvice: "Selected HK40 35.2 m boom / 4.5 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-10_5-21t", "HK40 10.5 m main boom, 2.1 t counterweight", HK40_MAIN_10_5_21T, { boomLengthM: 10.5, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 10.5 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 10.5 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-15_4-21t", "HK40 15.4 m main boom, 2.1 t counterweight", HK40_MAIN_15_4_21T, { boomLengthM: 15.4, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 15.4 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 15.4 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-20_4-21t", "HK40 20.4 m main boom, 2.1 t counterweight", HK40_MAIN_20_4_21T, { boomLengthM: 20.4, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 20.4 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 20.4 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-25_3-21t", "HK40 25.3 m main boom, 2.1 t counterweight", HK40_MAIN_25_3_21T, { boomLengthM: 25.3, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 25.3 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 25.3 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-30_3-21t", "HK40 30.3 m main boom, 2.1 t counterweight", HK40_MAIN_30_3_21T, { boomLengthM: 30.3, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 30.3 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 30.3 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-32_7-21t", "HK40 32.7 m main boom, 2.1 t counterweight", HK40_MAIN_32_7_21T, { boomLengthM: 32.7, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 32.7 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 32.7 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-35_2-21t", "HK40 35.2 m main boom, 2.1 t counterweight", HK40_MAIN_35_2_21T, { boomLengthM: 35.2, jibLengthM: 0, counterweightT: 2.1, source: "HK 40 load chart: 35.2 m main boom, 360°, 2.1 t counterweight", setupAdvice: "Selected HK40 35.2 m boom / 2.1 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-10_5-14t", "HK40 10.5 m main boom, 1.4 t counterweight", HK40_MAIN_10_5_14T, { boomLengthM: 10.5, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 10.5 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 10.5 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-15_4-14t", "HK40 15.4 m main boom, 1.4 t counterweight", HK40_MAIN_15_4_14T, { boomLengthM: 15.4, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 15.4 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 15.4 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-20_4-14t", "HK40 20.4 m main boom, 1.4 t counterweight", HK40_MAIN_20_4_14T, { boomLengthM: 20.4, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 20.4 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 20.4 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-25_3-14t", "HK40 25.3 m main boom, 1.4 t counterweight", HK40_MAIN_25_3_14T, { boomLengthM: 25.3, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 25.3 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 25.3 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-30_3-14t", "HK40 30.3 m main boom, 1.4 t counterweight", HK40_MAIN_30_3_14T, { boomLengthM: 30.3, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 30.3 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 30.3 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-32_7-14t", "HK40 32.7 m main boom, 1.4 t counterweight", HK40_MAIN_32_7_14T, { boomLengthM: 32.7, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 32.7 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 32.7 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-35_2-14t", "HK40 35.2 m main boom, 1.4 t counterweight", HK40_MAIN_35_2_14T, { boomLengthM: 35.2, jibLengthM: 0, counterweightT: 1.4, source: "HK 40 load chart: 35.2 m main boom, 360°, 1.4 t counterweight", setupAdvice: "Selected HK40 35.2 m boom / 1.4 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-10_5-0t", "HK40 10.5 m main boom, 0 t counterweight", HK40_MAIN_10_5_0T, { boomLengthM: 10.5, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 10.5 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 10.5 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-15_4-0t", "HK40 15.4 m main boom, 0 t counterweight", HK40_MAIN_15_4_0T, { boomLengthM: 15.4, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 15.4 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 15.4 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-20_4-0t", "HK40 20.4 m main boom, 0 t counterweight", HK40_MAIN_20_4_0T, { boomLengthM: 20.4, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 20.4 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 20.4 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-25_3-0t", "HK40 25.3 m main boom, 0 t counterweight", HK40_MAIN_25_3_0T, { boomLengthM: 25.3, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 25.3 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 25.3 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-30_3-0t", "HK40 30.3 m main boom, 0 t counterweight", HK40_MAIN_30_3_0T, { boomLengthM: 30.3, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 30.3 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 30.3 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-32_7-0t", "HK40 32.7 m main boom, 0 t counterweight", HK40_MAIN_32_7_0T, { boomLengthM: 32.7, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 32.7 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 32.7 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
      curve("hk40-main-35_2-0t", "HK40 35.2 m main boom, 0 t counterweight", HK40_MAIN_35_2_0T, { boomLengthM: 35.2, jibLengthM: 0, counterweightT: 0, source: "HK 40 load chart: 35.2 m main boom, 360°, 0 t counterweight", setupAdvice: "Selected HK40 35.2 m boom / 0 t counterweight chart. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval." }),
    ],
    notes: "HK40 structured data now covers main boom chart columns from 10.5 m to 35.2 m for the uploaded 4.5 t, 2.1 t, 1.4 t and 0 t counterweight tables. Final chart/LMI verification is still required.",
  },
  {
    id: "mtk35",
    title: "Marchetti MTK 35",
    match: [/\bmtk\s*35\b/i, /\bmarchetti\b.*\b35\b/i, /\bmkt\s*35\b/i],
    maxCapacityKg: 35000,
    maxBoomLengthM: 32,
    maxPhysicalJibLengthM: 14.5,
    maxRadiusM: 40,
    maxTipHeightM: 52,
    planningWeightKg: 26000,
    planningWeightSource: "MTK35 spec: total vehicle weight 26 t",
    estimatedBearingFactor: 0.75,
    profileOptions: [
      profile("mtk35-main-10", "Main boom 10.0 m", 10.0, 10.0, 7, 40, "MTK35 load chart: 10.0 m main boom column"),
      profile("mtk35-main-13_3", "Main boom 13.3 m", 13.3, 13.3, 10, 40, "MTK35 load chart: 13.3 m main boom column"),
      profile("mtk35-main-16_6", "Main boom 16.6 m", 16.6, 16.6, 14, 40, "MTK35 load chart: 16.6 m main boom column"),
      profile("mtk35-main-19_9", "Main boom 19.9 m", 19.9, 19.9, 16, 40, "MTK35 load chart: 19.9 m main boom column"),
      profile("mtk35-main-23_2", "Main boom 23.2 m", 23.2, 23.2, 20, 40, "MTK35 load chart: 23.2 m main boom column"),
      profile("mtk35-main-26_5", "Main boom 26.5 m", 26.5, 26.5, 22, 40, "MTK35 load chart: 26.5 m main boom column"),
      profile("mtk35-main-29_8", "Main boom 29.8 m", 29.8, 29.8, 26, 40, "MTK35 load chart: 29.8 m main boom column"),
      profile("mtk35-main-32", "Main boom 32.0 m", 32, 32, 28, 40, "MTK35 load chart: 32.0 m main boom column"),
    ],

    jibOptions: [
      jib("none", "No jib / main boom only", 0),
      jib("mtk35-extension-8", "8 m lattice extension", 8, 34, 45, "MTK35: 8 m extension, offsets 0°/20°/40°"),
      jib("mtk35-extension-14-5", "14.5 m lattice extension", 14.5, 32, 52, "MTK35: 14.5 m extension, offsets 0°/20°/40°"),
    ],
    capacitySource: "MTK35 uploaded load chart: main boom 10-32 m and 32 m + 8/14.5 m extensions.",
    capacityCurves: [
      curve("mtk35-main-10", "MTK35 10.0 m main boom", MTK35_MAIN_10, { boomLengthM: 10.0, jibLengthM: 0, source: "MTK35 load chart: 10.0 m main boom column", setupAdvice: "Selected MTK35 10.0 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-13_3", "MTK35 13.3 m main boom", MTK35_MAIN_13_3, { boomLengthM: 13.3, jibLengthM: 0, source: "MTK35 load chart: 13.3 m main boom column", setupAdvice: "Selected MTK35 13.3 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-16_6", "MTK35 16.6 m main boom", MTK35_MAIN_16_6, { boomLengthM: 16.6, jibLengthM: 0, source: "MTK35 load chart: 16.6 m main boom column", setupAdvice: "Selected MTK35 16.6 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-19_9", "MTK35 19.9 m main boom", MTK35_MAIN_19_9, { boomLengthM: 19.9, jibLengthM: 0, source: "MTK35 load chart: 19.9 m main boom column", setupAdvice: "Selected MTK35 19.9 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-23_2", "MTK35 23.2 m main boom", MTK35_MAIN_23_2, { boomLengthM: 23.2, jibLengthM: 0, source: "MTK35 load chart: 23.2 m main boom column", setupAdvice: "Selected MTK35 23.2 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-26_5", "MTK35 26.5 m main boom", MTK35_MAIN_26_5, { boomLengthM: 26.5, jibLengthM: 0, source: "MTK35 load chart: 26.5 m main boom column", setupAdvice: "Selected MTK35 26.5 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-29_8", "MTK35 29.8 m main boom", MTK35_MAIN_29_8, { boomLengthM: 29.8, jibLengthM: 0, source: "MTK35 load chart: 29.8 m main boom column", setupAdvice: "Selected MTK35 29.8 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-main-32", "MTK35 32.0 m main boom", MTK35_MAIN_32, { boomLengthM: 32, jibLengthM: 0, source: "MTK35 load chart: 32.0 m main boom column", setupAdvice: "Selected MTK35 32.0 m main-boom chart. Verify exact LMI, hook block/accessories and ground setup before approval." }),
      curve("mtk35-ext8-0", "MTK35 32 m + 8 m extension at 0°", MTK35_EXTENSION_8_0, { boomLengthM: 32, jibLengthM: 8, jibAngleMinDeg: 0, jibAngleMaxDeg: 5, source: "MTK35 extension chart: 8 m extension, 0°", setupAdvice: "Use 8 m extension only where the main boom does not achieve the required height/reach." }),
      curve("mtk35-ext8-20", "MTK35 32 m + 8 m extension at 20°", MTK35_EXTENSION_8_20, { boomLengthM: 32, jibLengthM: 8, jibAngleMinDeg: 15, jibAngleMaxDeg: 25, source: "MTK35 extension chart: 8 m extension, 20°", setupAdvice: "Use 20° offset only if needed for clearance/reach; check chart before approval." }),
      curve("mtk35-ext8-40", "MTK35 32 m + 8 m extension at 40°", MTK35_EXTENSION_8_40, { boomLengthM: 32, jibLengthM: 8, jibAngleMinDeg: 35, jibAngleMaxDeg: 45, source: "MTK35 extension chart: 8 m extension, 40°", setupAdvice: "Use 40° offset only if needed for clearance/reach; check chart before approval." }),
      curve("mtk35-ext145-0", "MTK35 32 m + 14.5 m extension at 0°", MTK35_EXTENSION_14_5_0, { boomLengthM: 32, jibLengthM: 14.5, jibAngleMinDeg: 0, jibAngleMaxDeg: 5, source: "MTK35 extension chart: 14.5 m extension, 0°", setupAdvice: "Use 14.5 m extension only where required; capacity is much lower than main boom." }),
      curve("mtk35-ext145-20", "MTK35 32 m + 14.5 m extension at 20°", MTK35_EXTENSION_14_5_20, { boomLengthM: 32, jibLengthM: 14.5, jibAngleMinDeg: 15, jibAngleMaxDeg: 25, source: "MTK35 extension chart: 14.5 m extension, 20°", setupAdvice: "Use 20° offset only if needed; check chart before approval." }),
      curve("mtk35-ext145-40", "MTK35 32 m + 14.5 m extension at 40°", MTK35_EXTENSION_14_5_40, { boomLengthM: 32, jibLengthM: 14.5, jibAngleMinDeg: 35, jibAngleMaxDeg: 45, source: "MTK35 extension chart: 14.5 m extension, 40°", setupAdvice: "Use 40° offset only if needed; check chart before approval." }),
    ],

    notes: "MTK35 structured data now covers all main-boom chart columns visible on the uploaded spec sheet (10.0 m, 13.3 m, 16.6 m, 19.9 m, 23.2 m, 26.5 m, 29.8 m and 32.0 m) plus 8 m / 14.5 m extension offsets. Final chart/LMI verification is still required.",
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

function closeTo(value: number | null | undefined, target: number | null | undefined, tolerance: number) {
  if (value === null || value === undefined || target === null || target === undefined) return true;
  if (!Number.isFinite(value) || !Number.isFinite(target)) return true;
  return Math.abs(value - target) <= tolerance;
}

function jibMatches(curve: RangeChartCapacityCurve, jibLengthM?: number | null, jibAngleDeg?: number | null) {
  const effectiveJib = Math.max(0, jibLengthM ?? 0);
  if (curve.jibLengthM !== null && curve.jibLengthM !== undefined && !closeTo(effectiveJib, curve.jibLengthM, curve.jibLengthM === 0 ? 0.25 : 0.85)) return false;
  if (curve.jibAngleMinDeg !== null && curve.jibAngleMinDeg !== undefined && jibAngleDeg !== null && jibAngleDeg !== undefined && Number.isFinite(jibAngleDeg)) {
    if (jibAngleDeg < curve.jibAngleMinDeg - 0.01) return false;
  }
  if (curve.jibAngleMaxDeg !== null && curve.jibAngleMaxDeg !== undefined && jibAngleDeg !== null && jibAngleDeg !== undefined && Number.isFinite(jibAngleDeg)) {
    if (jibAngleDeg > curve.jibAngleMaxDeg + 0.01) return false;
  }
  return true;
}

function boomCurveScore(curve: RangeChartCapacityCurve, boomLengthM?: number | null) {
  if (curve.boomLengthM === null || curve.boomLengthM === undefined || boomLengthM === null || boomLengthM === undefined || !Number.isFinite(boomLengthM)) return 0;
  return Math.abs(curve.boomLengthM - boomLengthM);
}

function textHasCounterweightSelection(text: string, counterweightT: number | null | undefined) {
  if (counterweightT === null || counterweightT === undefined) return true;
  const value = Number(counterweightT);
  if (!Number.isFinite(value)) return true;

  // The all-terrain/truck-crane charts must not auto-fill from a stronger chart unless that chart has been
  // deliberately selected. Match common labels such as "19.3 t counterweight", "8.5t", "0 t counterweight",
  // or the profile/curve key itself.
  const escaped = String(value).replace(".", "\\.");
  const patterns = [
    new RegExp(`\\b${escaped}\\s*t(?:onne|onnes)?\\b`, "i"),
    new RegExp(`\\b${escaped}t\\b`, "i"),
    new RegExp(`\\b${escaped}\\s*ton(?:ne|nes)?\\b`, "i"),
  ];
  if (value === 0) patterns.push(/\b0\s*t\s*counterweight\b/i, /\bwithout\s+counterweight\b/i);
  return patterns.some((pattern) => pattern.test(text));
}

function hasJekkoExactStabilityOrAttachmentSelection(text: string) {
  return /\bj[567]\b|full[-\s]?stability|jib500gr|grabber|jib1000/i.test(text);
}

function isJekkoPendingMainBoomCurve(curve: RangeChartCapacityCurve) {
  return curve.key === "spx532-main-pending-j-rating";
}

function textHasJekkoStabilitySelection(text: string, curve: RangeChartCapacityCurve) {
  if (!/spx532|jekko|jib500gr|jib1000|main boom/i.test(`${curve.key} ${curve.label}`)) return true;
  if (isJekkoPendingMainBoomCurve(curve)) {
    // Allow a useful preliminary main-boom capacity when the dropdown/text only says "Main boom".
    // Exact J7/J6/J5 selections are still preferred because those curves appear earlier and match first.
    return !hasJekkoExactStabilityOrAttachmentSelection(text) || /main\s*boom|spx532|jekko/i.test(text);
  }
  if (/j7/i.test(curve.key)) return /\bj7\b|full[-\s]?stability/i.test(text);
  if (/j6/i.test(curve.key)) return /\bj6\b/i.test(text);
  if (/j5/i.test(curve.key)) return /\bj5\b/i.test(text);
  // The grabber chart is a specific attachment chart, so only auto-fill when the attachment was selected.
  if (/jib500gr/i.test(curve.key)) return /jib500gr|grabber/i.test(text);
  return true;
}

function selectedCurveAllowed(rule: RangeChartSpecRule, curve: RangeChartCapacityCurve, setupLabel?: string | null, sourceLabel?: string | null) {
  const text = lower(`${setupLabel ?? ""} ${sourceLabel ?? ""}`);
  if ((rule.id === "gmk4080-1" || rule.id === "hk40") && !textHasCounterweightSelection(text, curve.counterweightT)) {
    return false;
  }
  if (rule.id === "spx532" && !textHasJekkoStabilitySelection(text, curve)) {
    return false;
  }
  return true;
}

function curveMatches({
  rule,
  curve,
  boomLengthM,
  jibLengthM,
  jibAngleDeg,
  setupLabel,
  sourceLabel,
}: {
  rule: RangeChartSpecRule;
  curve: RangeChartCapacityCurve;
  boomLengthM?: number | null;
  jibLengthM?: number | null;
  jibAngleDeg?: number | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
}) {
  if (!selectedCurveAllowed(rule, curve, setupLabel, sourceLabel)) return false;
  if (!jibMatches(curve, jibLengthM, jibAngleDeg)) return false;
  if (curve.boomLengthM !== null && curve.boomLengthM !== undefined && boomLengthM !== null && boomLengthM !== undefined && Number.isFinite(boomLengthM)) {
    // Do not silently use a longer boom chart for a shorter telescopic boom. That was making some
    // lifts show over capacity when the correct shorter-boom chart was within capacity.
    // Auto capacity is now only allowed when the selected/entered boom length matches the structured
    // manufacturer chart column. Intermediate boom lengths must be manually verified against the LMI/spec.
    if (Math.abs(boomLengthM - curve.boomLengthM) > 0.35) return false;
  }
  return true;
}

function matchingCapacityCurves(rule: RangeChartSpecRule, args: { boomLengthM?: number | null; jibLengthM?: number | null; jibAngleDeg?: number | null; radiusM: number; setupLabel?: string | null; sourceLabel?: string | null }) {
  return (rule.capacityCurves ?? [])
    .filter((item) => curveMatches({ rule, curve: item, boomLengthM: args.boomLengthM, jibLengthM: args.jibLengthM, jibAngleDeg: args.jibAngleDeg, setupLabel: args.setupLabel, sourceLabel: args.sourceLabel }))
    .sort((a, b) => boomCurveScore(a, args.boomLengthM) - boomCurveScore(b, args.boomLengthM));
}

function bestMatchingCapacityCurve(rule: RangeChartSpecRule, args: { boomLengthM?: number | null; jibLengthM?: number | null; jibAngleDeg?: number | null; radiusM: number; setupLabel?: string | null; sourceLabel?: string | null }) {
  const matches = matchingCapacityCurves(rule, args)
    .filter((item) => conservativeCapacityFromCurve(item.points, args.radiusM) !== null);
  return matches[0] ?? null;
}

function structuredManualWarning(rule: RangeChartSpecRule, args: { radiusM: number; setupLabel?: string | null; sourceLabel?: string | null; boomLengthM?: number | null; jibLengthM?: number | null; jibAngleDeg?: number | null }) {
  const selectorText = lower(`${args.setupLabel ?? ""} ${args.sourceLabel ?? ""}`);
  if (rule.id === "spx532" && !hasJekkoExactStabilityOrAttachmentSelection(selectorText)) {
    return "Jekko SPX532 recognised, but the exact J-rating/stability/attachment chart has not been selected. Do not use the crane's maximum capacity as capacity at radius. Select the correct SPX532 J7/J6/J5/attachment chart or check manually against the manufacturer chart.";
  }
  if (rule.id === "gmk4080-1" && !/\b19\.3\s*t\b|\b19\.3t\b|counterweight/i.test(selectorText)) {
    return "Grove GMK4080-1 recognised, but the exact counterweight/load chart has not been selected. Do not use the crane's maximum capacity as capacity at radius. Select the correct counterweight chart or check manually against the manufacturer chart.";
  }
  if (rule.id === "hk40" && !/\b(?:8\.5|4\.5|2\.1|1\.4|0)\s*t\b|counterweight/i.test(selectorText)) {
    return "HK40 recognised, but the exact counterweight/load chart has not been selected. Do not use the crane's maximum capacity as capacity at radius. Select the correct counterweight chart or check manually against the manufacturer chart.";
  }
  const curvesForSetup = matchingCapacityCurves(rule, args);
  if (curvesForSetup.length) {
    const maxRadius = Math.max(...curvesForSetup.flatMap((curve) => curve.points.map((point) => point.radiusM)));
    if (Number.isFinite(maxRadius) && args.radiusM > maxRadius) {
      return `${rule.title} recognised, but ${args.radiusM.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m radius is outside the structured curve selected in the CRM (max structured point ${maxRadius.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m). Check the exact manufacturer/supplier chart manually before approval.`;
    }
  }
  return `${rule.title} recognised, but the exact selected boom/jib/counterweight/outrigger setup cannot be auto-matched to a structured load chart at this radius. Do not use crane maximum capacity as capacity at radius; check the exact manufacturer/supplier chart manually before approval.`;
}


function applyPayloadCap(
  rule: RangeChartSpecRule,
  capacityKg: number | null,
  source: string,
  warning: string | undefined,
  setupAdvice: string | undefined,
  args: { setupLabel?: string | null; sourceLabel?: string | null; jibLengthM?: number | null; totalLiftedWeightKg?: number | null },
): { capacityKg: number | null; source: string; warning?: string; setupAdvice?: string } {
  // Important AK46 correction:
  // The Böcker AK46/6000 spec gives crane-operation capacity by radius:
  // 6t @ 8m, 4t @ 11m, 2t @ 17.7m, 1t @ 26m, 500kg @ 34.5m, 250kg @ 38-39m.
  // The 5.3m / 8.1m / 11.0m hydraulic extension is included within the 44 m / optional
  // 46 m total extension length. It must NOT be added as a separate physical jib on top
  // of 46 m, and its 3000kg / 1500kg / 800kg labels must NOT be treated as hard global
  // caps where the crane-operation table gives the applicable capacity by radius.
  void rule;
  void args;
  return { capacityKg, source, warning, setupAdvice };
}

function selectedCurveVerificationWarning(
  rule: RangeChartSpecRule,
  curve: RangeChartCapacityCurve,
  setupLabel?: string | null,
  sourceLabel?: string | null,
) {
  const selectorText = lower(`${setupLabel ?? ""} ${sourceLabel ?? ""}`);
  if (rule.id === "spx532") {
    if (isJekkoPendingMainBoomCurve(curve) || !hasJekkoExactStabilityOrAttachmentSelection(selectorText)) {
      return "Preliminary SPX532 capacity only: verify the exact outrigger/stability J-rating, boom length, hook block/accessories and manufacturer chart before approving the lift.";
    }
    return "SPX532 capacity is still subject to appointed-person verification of the actual outrigger/stability J-rating, boom length, attachment, hook block/accessories and manufacturer chart before approval.";
  }
  return undefined;
}

function viableSetupAdvice(
  rule: RangeChartSpecRule,
  radiusM: number,
  totalLiftedWeightKg: number | null | undefined,
  selectedCurve?: RangeChartCapacityCurve | null,
  setupLabel?: string | null,
  sourceLabel?: string | null,
  boomLengthM?: number | null,
  jibLengthM?: number | null,
  jibAngleDeg?: number | null,
) {
  if (!totalLiftedWeightKg || !(rule.capacityCurves?.length)) return "";
  const selectorText = lower(`${setupLabel ?? ""} ${sourceLabel ?? ""}`);

  if (rule.id === "gmk4080-1" && !/\b19\.3\s*t\b|\b19\.3t\b|counterweight/i.test(selectorText)) {
    return "Select the exact GMK4080-1 counterweight/load-chart setup before the CRM auto-fills capacity. The uploaded structured curve is for the 19.3 t counterweight chart and must not be used silently.";
  }
  if (rule.id === "hk40" && !/\b(?:8\.5|4\.5|2\.1|1\.4|0)\s*t\b|counterweight/i.test(selectorText)) {
    return "Select the exact HK40 counterweight chart before the CRM auto-fills capacity. HK40 capacity changes by counterweight.";
  }
  if (rule.id === "spx532" && !hasJekkoExactStabilityOrAttachmentSelection(selectorText) && !selectedCurve) {
    return "Select the exact Jekko SPX532 J-rating/stability or attachment chart, or use the conservative main-boom planning curve with AP verification. SPX532 capacity depends on outrigger/stability setup.";
  }

  const selectedCapacity = selectedCurve ? conservativeCapacityFromCurve(selectedCurve.points, radiusM) : null;
  if (selectedCurve && selectedCapacity !== null && selectedCapacity >= totalLiftedWeightKg) {
    return `Selected setup advice: ${selectedCurve.label} gives approximately ${Math.round(selectedCapacity).toLocaleString("en-GB")} kg at this radius. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval.`;
  }
  const viable = rule.capacityCurves
    .filter((item) => curveMatches({ rule, curve: item, boomLengthM, jibLengthM, jibAngleDeg, setupLabel, sourceLabel }))
    .map((item) => ({ curve: item, capacityKg: conservativeCapacityFromCurve(item.points, radiusM) }))
    .filter((item) => item.capacityKg !== null && item.capacityKg >= totalLiftedWeightKg)
    .sort((a, b) => (a.capacityKg ?? 0) - (b.capacityKg ?? 0));
  if (!viable.length) return `No structured ${rule.title} setup in the CRM rules covers ${Math.round(totalLiftedWeightKg).toLocaleString("en-GB")} kg at ${radiusM.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m with the selected boom/jib/counterweight/stability setup. Reduce radius, reduce load, select a different duty/counterweight/stability chart, or choose another crane.`;
  const first = viable[0];
  return `Structured setup advice: ${first.curve.label} gives approximately ${Math.round(first.capacityKg ?? 0).toLocaleString("en-GB")} kg at this radius. Verify exact boom length, counterweight, outrigger setup, hook block/accessories and LMI before approval.`;
}


function approximateRequiredBoomLength(radiusM: number, tipHeightM?: number | null) {
  const radius = Number(radiusM);
  const height = Number(tipHeightM ?? 0);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  if (!Number.isFinite(height) || height <= 0) return null;
  return Math.sqrt((radius * radius) + (height * height));
}

function approximateBoomAngle(radiusM: number, tipHeightM?: number | null) {
  const radius = Number(radiusM);
  const height = Number(tipHeightM ?? 0);
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return (Math.atan2(height, radius) * 180) / Math.PI;
}

function profileForCapacityCurve(rule: RangeChartSpecRule, curve: RangeChartCapacityCurve) {
  const profiles = rule.profileOptions ?? [];
  if (!profiles.length) return null;
  const exactByLabel = profiles.find((item) => lower(item.label) === lower(curve.label));
  if (exactByLabel) return exactByLabel;
  const candidates = profiles
    .map((item) => {
      const boom = item.defaultBoomLengthM ?? item.maxBoomLengthM ?? null;
      const boomDiff = boom !== null && curve.boomLengthM !== null && curve.boomLengthM !== undefined
        ? Math.abs(boom - curve.boomLengthM)
        : 999;
      const counterweight = curve.counterweightT;
      const text = lower(`${item.key} ${item.label} ${item.source ?? ""}`);
      const counterweightOk = counterweight === null || counterweight === undefined || textHasCounterweightSelection(text, counterweight);
      return { item, boomDiff, counterweightOk };
    })
    .filter((item) => item.counterweightOk)
    .sort((a, b) => a.boomDiff - b.boomDiff);
  return candidates[0]?.boomDiff <= 0.75 ? candidates[0].item : null;
}

function jibOptionForCapacityCurve(rule: RangeChartSpecRule, curve: RangeChartCapacityCurve) {
  const options = rule.jibOptions ?? [];
  const target = curve.jibLengthM ?? 0;
  if (!options.length) return null;
  const exact = options.find((item) => Math.abs((item.lengthM ?? 0) - target) <= (target ? 0.85 : 0.25));
  if (exact) return exact;
  return target <= 0.25 ? options.find((item) => item.key === "none") ?? null : null;
}

export function suggestRangeChartSetups({
  craneName,
  radiusM,
  tipHeightM,
  totalLiftedWeightKg,
}: {
  craneName?: string | null;
  radiusM: number;
  tipHeightM?: number | null;
  totalLiftedWeightKg?: number | null;
}): RangeChartSetupSuggestion[] {
  const rule = findRangeChartSpecRule(craneName);
  const lifted = Number(totalLiftedWeightKg ?? 0);
  const radius = Number(radiusM);
  if (!rule?.capacityCurves?.length || !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(lifted) || lifted <= 0) return [];

  const requiredBoom = approximateRequiredBoomLength(radius, tipHeightM);
  const boomAngleDeg = approximateBoomAngle(radius, tipHeightM);

  const suggestions = rule.capacityCurves
    .filter((curve) => !isJekkoPendingMainBoomCurve(curve))
    .map<RangeChartSetupSuggestion | null>((curve) => {
      const capacityKg = conservativeCapacityFromCurve(curve.points, radius);
      if (capacityKg === null || capacityKg < lifted) return null;

      const physicalLength = (curve.boomLengthM ?? 0) + Math.max(0, curve.jibLengthM ?? 0);
      if (requiredBoom !== null && physicalLength > 0 && physicalLength + 0.5 < requiredBoom) return null;

      const profile = profileForCapacityCurve(rule, curve);
      const jib = jibOptionForCapacityCurve(rule, curve);
      const utilisationPercent = capacityKg > 0 ? (lifted / capacityKg) * 100 : null;
      const profileText = profile?.label ?? curve.label;
      const jibText = jib?.label ?? (curve.jibLengthM && curve.jibLengthM > 0 ? `${curve.jibLengthM} m extension/jib` : "No jib / main boom only");
      const heightText = requiredBoom !== null ? ` Required boom length from radius/height is approximately ${requiredBoom.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m.` : "";
      return {
        key: curve.key,
        label: `${profileText}${curve.jibLengthM && curve.jibLengthM > 0 ? ` / ${jibText}` : ""}`,
        capacityKg,
        utilisationPercent,
        boomLengthM: curve.boomLengthM ?? null,
        jibLengthM: curve.jibLengthM ?? 0,
        counterweightT: curve.counterweightT ?? null,
        profileKey: profile?.key ?? null,
        profileLabel: profile?.label ?? null,
        jibOptionKey: jib?.key ?? null,
        jibOptionLabel: jib?.label ?? null,
        boomAngleDeg,
        source: curve.source,
        advice: `Suggested from the structured ${rule.title} load chart for ${Math.round(lifted).toLocaleString("en-GB")} kg at ${radius.toLocaleString("en-GB", { maximumFractionDigits: 2 })} m radius.${heightText} Verify exact manufacturer/supplier chart, LMI, counterweight, outrigger setup, hook block and accessories before approval.`,
      };
    })
    .filter((item): item is RangeChartSetupSuggestion => Boolean(item));

  return suggestions.sort((a, b) => {
    const aJibPenalty = (a.jibLengthM ?? 0) > 0 ? 1 : 0;
    const bJibPenalty = (b.jibLengthM ?? 0) > 0 ? 1 : 0;
    if (aJibPenalty !== bJibPenalty) return aJibPenalty - bJibPenalty;
    const aLength = (a.boomLengthM ?? 999) + Math.max(0, a.jibLengthM ?? 0);
    const bLength = (b.boomLengthM ?? 999) + Math.max(0, b.jibLengthM ?? 0);
    if (Math.abs(aLength - bLength) > 0.01) return aLength - bLength;
    const aCounterweight = a.counterweightT ?? 999;
    const bCounterweight = b.counterweightT ?? 999;
    if (Math.abs(aCounterweight - bCounterweight) > 0.01) return aCounterweight - bCounterweight;
    return a.capacityKg - b.capacityKg;
  }).slice(0, 5);
}

export function calculateRangeChartCapacity({
  craneName,
  setupLabel,
  sourceLabel,
  radiusM,
  boomLengthM,
  jibLengthM,
  jibAngleDeg,
  totalLiftedWeightKg,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
  radiusM: number;
  boomLengthM?: number | null;
  jibLengthM?: number | null;
  jibAngleDeg?: number | null;
  totalLiftedWeightKg?: number | null;
}): RangeChartCapacityResult {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  if (!rule) {
    return {
      capacityKg: null,
      method: "manual",
      source: "No recognised structured crane capacity rule found. Enter/check the capacity against the manufacturer/supplier chart.",
      warning: "Chart capacity cannot be auto-calculated until this crane/spec sheet has structured load-chart data.",
      allowManualCapacityFallback: true,
      recognisedRuleId: null,
    };
  }

  const limits = getRangeChartLimits({ craneName, setupLabel, sourceLabel });
  const boomLimitExceeded = Boolean(limits.maxBoomLengthM && boomLengthM && boomLengthM > limits.maxBoomLengthM + 0.1);
  const radiusLimitExceeded = Boolean(limits.maxRadiusM && radiusM > limits.maxRadiusM + 0.1);
  if (boomLimitExceeded || radiusLimitExceeded) {
    const parts = [
      boomLimitExceeded ? `required boom length ${Number(boomLengthM).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m exceeds the structured limit ${Number(limits.maxBoomLengthM).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m` : "",
      radiusLimitExceeded ? `radius ${Number(radiusM).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m exceeds the structured limit ${Number(limits.maxRadiusM).toLocaleString("en-GB", { maximumFractionDigits: 2 })} m` : "",
    ].filter(Boolean).join(" and ");
    return {
      capacityKg: null,
      method: "manual",
      source: rule.capacitySource || `${rule.title} load chart`,
      warning: `${rule.title} cannot be auto-cleared because ${parts}. Check the exact manufacturer/supplier chart and crane configuration manually before approval.`,
      setupAdvice: viableSetupAdvice(rule, radiusM, totalLiftedWeightKg, null, setupLabel, sourceLabel, boomLengthM, jibLengthM, jibAngleDeg),
      allowManualCapacityFallback: false,
      recognisedRuleId: rule.id,
    };
  }

  const selectedCurve = bestMatchingCapacityCurve(rule, { radiusM, boomLengthM, jibLengthM, jibAngleDeg, setupLabel, sourceLabel });
  if (selectedCurve) {
    const capacityKg = conservativeCapacityFromCurve(selectedCurve.points, radiusM);
    const advice = viableSetupAdvice(rule, radiusM, totalLiftedWeightKg, selectedCurve, setupLabel, sourceLabel, boomLengthM, jibLengthM, jibAngleDeg) || selectedCurve.setupAdvice;
    return {
      ...(() => {
        const overloadWarning = capacityKg !== null && totalLiftedWeightKg && totalLiftedWeightKg > capacityKg
          ? `${rule.title} selected setup is over the structured chart capacity at this radius. ${advice}`
          : undefined;
        const capped = applyPayloadCap(
          rule,
          capacityKg,
          selectedCurve.source,
          overloadWarning || selectedCurveVerificationWarning(rule, selectedCurve, setupLabel, sourceLabel),
          advice,
          { setupLabel, sourceLabel, jibLengthM, totalLiftedWeightKg }
        );
        return {
          capacityKg: capped.capacityKg,
          method: "automatic" as const,
          source: capped.source,
          setupAdvice: capped.setupAdvice,
          warning: capped.warning,
          allowManualCapacityFallback: false,
          recognisedRuleId: rule.id,
        };
      })(),
    };
  }

  const capacityKg = conservativeCapacityFromCurve(rule.capacityPoints, radiusM);
  if (capacityKg !== null) {
    return {
      ...(() => {
        const advice = viableSetupAdvice(rule, radiusM, totalLiftedWeightKg, null, setupLabel, sourceLabel, boomLengthM, jibLengthM, jibAngleDeg);
        const capped = applyPayloadCap(
          rule,
          capacityKg,
          rule.capacitySource || `${rule.title} structured capacity rule`,
          capacityKg !== null && totalLiftedWeightKg && totalLiftedWeightKg > capacityKg
            ? `${rule.title} selected setup is over the structured chart capacity at this radius.`
            : undefined,
          advice,
          { setupLabel, sourceLabel, jibLengthM, totalLiftedWeightKg }
        );
        return {
          capacityKg: capped.capacityKg,
          method: "automatic" as const,
          source: capped.source,
          setupAdvice: capped.setupAdvice,
          warning: capped.warning,
          allowManualCapacityFallback: false,
          recognisedRuleId: rule.id,
        };
      })(),
    };
  }

  return {
    capacityKg: null,
    method: "manual",
    source: rule.capacitySource || `${rule.title} load chart`,
    warning: structuredManualWarning(rule, { radiusM, setupLabel, sourceLabel, boomLengthM, jibLengthM, jibAngleDeg }),
    setupAdvice: viableSetupAdvice(rule, radiusM, totalLiftedWeightKg, null, setupLabel, sourceLabel, boomLengthM, jibLengthM, jibAngleDeg),
    allowManualCapacityFallback: false,
    recognisedRuleId: rule.id,
  };
}

export function calculateRangeChartBearingLoad({
  craneName,
  setupLabel,
  sourceLabel,
  totalLiftedWeightKg,
}: {
  craneName?: string | null;
  setupLabel?: string | null;
  sourceLabel?: string | null;
  totalLiftedWeightKg?: number | null;
}): RangeChartBearingResult {
  const rule = findRangeChartSpecRule(craneName, setupLabel, sourceLabel);
  if (rule?.defaultBearingLoadKg) {
    return {
      bearingLoadKg: rule.defaultBearingLoadKg,
      method: "automatic",
      source: rule.bearingLoadSource || `${rule.title} published outrigger/load reaction`,
    };
  }

  const lifted = totalLiftedWeightKg && Number.isFinite(totalLiftedWeightKg) ? totalLiftedWeightKg : null;
  const planningWeight = rule?.planningWeightKg && Number.isFinite(rule.planningWeightKg) ? rule.planningWeightKg : null;
  if (rule && planningWeight && lifted !== null) {
    const factor = rule.estimatedBearingFactor ?? 0.75;
    const bearingLoadKg = (planningWeight + lifted) * factor;
    return {
      bearingLoadKg,
      method: "automatic",
      source: `Planning estimate using appointed-person mat calculation: (${rule.planningWeightSource || `${rule.title} planning/gross weight`} + gross lifted load) × ${factor}. Use exact outrigger reaction chart if available.`,
    };
  }

  return {
    bearingLoadKg: null,
    method: "manual",
    source: rule
      ? `${rule.title} needs the total lifted weight to estimate bearing load, or an exact outrigger reaction can be entered manually.`
      : "No recognised crane bearing reaction rule found. Use the exact outrigger reaction chart/manual value.",
    warning: "Bearing load/reaction cannot be auto-calculated until the crane is recognised and the load/accessory weight is entered, or an exact outrigger reaction is entered.",
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
    planningWeightKg: rule?.planningWeightKg ?? null,
    planningWeightSource: rule?.planningWeightSource ?? null,
    estimatedBearingFactor: rule?.estimatedBearingFactor ?? null,
    defaultBearingLoadKg: rule?.defaultBearingLoadKg ?? null,
    bearingLoadSource: rule?.bearingLoadSource ?? null,
    maxBoomLengthM: setupMaxBoomLengthM ?? rule?.maxBoomLengthM ?? null,
    maxPhysicalJibLengthM: setupMaxPhysicalJibLengthM ?? rule?.maxPhysicalJibLengthM ?? null,
    maxRadiusM: setupMaxRadiusM ?? rule?.maxRadiusM ?? null,
    maxTipHeightM: setupMaxTipHeightM ?? rule?.maxTipHeightM ?? null,
  };
}
