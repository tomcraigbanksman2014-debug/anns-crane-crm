export type EquipmentProfile = {
  id: string;
  title: string;
  machineType: "crane" | "hiab" | "spider" | "truck_crane";
  manufacturer?: string;
  model?: string;
  aliases: string[];
  summary: string;
  maxCapacityKg?: number | null;
  maxCapacityTonnes?: number | null;
  maxBoomLengthM?: number | null;
  maxTipHeightM?: number | null;
  maxHydraulicOutreachM?: number | null;
  maxJibOutreachM?: number | null;
  maxRadiusM?: number | null;
  outriggersNote?: string | null;
  capabilities: string[];
  warnings: string[];
  sourceLabel: string;
};

export const EQUIPMENT_PROFILES: EquipmentProfile[] = [
  {
    id: "gmk4080-1",
    title: "Grove GMK4080-1",
    machineType: "crane",
    manufacturer: "Grove / Manitowoc",
    model: "GMK4080-1",
    aliases: ["gmk4080", "gmk4080-1", "grove 80t", "grove gmk4080-1", "80t grove"],
    summary: "80 t all-terrain crane with 11.0 m to 51.0 m six-section boom and 54.0 m maximum tip height.",
    maxCapacityKg: 80000,
    maxCapacityTonnes: 80,
    maxBoomLengthM: 51,
    maxTipHeightM: 54,
    maxHydraulicOutreachM: 51,
    capabilities: [
      "All-terrain crane",
      "6-section TWIN-LOCK boom",
      "Optional swingaway and lattice extension",
      "Hydraulic outriggers with levelling system",
    ],
    warnings: [
      "Final lift must be checked against the correct load chart, boom length, counterweight and setup.",
      "Outrigger extension, level condition, tyre / road mode and accessories can materially affect capacity.",
      "Hook block, slings and accessories must be deducted from available capacity.",
    ],
    sourceLabel: "GMK4080-1 lifting specs",
  },
  {
    id: "mtk-35",
    title: "Marchetti MTK 35",
    machineType: "crane",
    manufacturer: "Marchetti",
    model: "MTK 35",
    aliases: ["mtk35", "mtk 35", "marchetti mtk35", "marchetti mtk 35"],
    summary: "35 t truck mounted telescopic crane with 10 m to 32 m main boom and charted jib options.",
    maxCapacityKg: 35000,
    maxCapacityTonnes: 35,
    maxBoomLengthM: 32,
    maxHydraulicOutreachM: 32,
    capabilities: [
      "Truck mounted telescopic crane",
      "Boom telescopes 10 m to 32 m",
      "Jib options shown at 8 m and 14.5 m",
      "Fully extended outrigger chart basis",
    ],
    warnings: [
      "Charted capacities shown in the sheet are based on fully extended outriggers.",
      "Weight of hook blocks and slings forms part of the load and must be deducted.",
      "Wind limits and boom / jib configuration must be checked before approving the lift.",
    ],
    sourceLabel: "MTK35 specs",
  },
  {
    id: "ak46-6000",
    title: "Böcker AK 46/6000",
    machineType: "truck_crane",
    manufacturer: "Böcker",
    model: "AK 46/6000",
    aliases: ["ak46", "ak 46", "ak46/6000", "ak 46/6000", "bocker ak46", "böcker ak46"],
    summary: "Truck crane rated to 6 t with 44.0 m max extension length and approx. 39 m radius at 250 kg.",
    maxCapacityKg: 6000,
    maxCapacityTonnes: 6,
    maxBoomLengthM: 44,
    maxRadiusM: 39,
    capabilities: [
      "Truck crane",
      "Optional fly jib",
      "Compact setup in tight spaces",
      "Platform / basket operation shown on spec sheet",
    ],
    warnings: [
      "Working range varies heavily with load and jib configuration.",
      "Basket / MEWP mode is not the same as crane lifting mode and must not be mixed in planning.",
      "Final radius, load and support setup must be checked against the current chart and site layout.",
    ],
    sourceLabel: "AK46-6000 spec",
  },
  {
    id: "spx532",
    title: "Jekko SPX532",
    machineType: "spider",
    manufacturer: "Jekko",
    model: "SPX532",
    aliases: ["spx532", "jekko 532", "jekko spx532", "spx 532"],
    summary: "Spider crane with 2.5 m to 10.8 m boom, 3.2 t max capacity and charted outriggers / stability positions.",
    maxCapacityKg: 3200,
    maxCapacityTonnes: 3.2,
    maxBoomLengthM: 10.8,
    maxRadiusM: 9.7,
    capabilities: [
      "Spider crane",
      "Multiple outrigger positions",
      "Main boom chart to 9.7 m radius",
      "Compact access lifting",
    ],
    warnings: [
      "Capacity depends on exact outrigger position and stability zone.",
      "Close outrigger setups can reduce or eliminate lifting capacity in some zones.",
      "Hook block, rope, jib and accessories form part of the load and must be accounted for.",
    ],
    sourceLabel: "Jekko 532 specsheet",
  },
  {
    id: "palfinger-pk65002-sh",
    title: "Palfinger PK 65002 SH",
    machineType: "hiab",
    manufacturer: "Palfinger",
    model: "PK 65002 SH",
    aliases: [
      "pk65002",
      "pk 65002",
      "pk65002 sh",
      "pk 65002 sh",
      "palfinger pk65002",
      "palfinger pk 65002 sh",
      "artic hiab",
      "artic",
    ],
    summary: "HIAB / loader crane with up to 22,000 kg max lifting capacity, hydraulic outreach around 20.4 m and up to 32.6 m with fly-jib.",
    maxCapacityKg: 22000,
    maxCapacityTonnes: 22,
    maxHydraulicOutreachM: 20.4,
    maxJibOutreachM: 32.6,
    capabilities: [
      "Loader crane / HIAB",
      "HPSC stabiliser control",
      "Continuous slewing system",
      "Assigned artic HIAB profile",
    ],
    warnings: [
      "Use this profile for the artic HIAB unless a more specific vehicle / asset match is found.",
      "Capacity changes with extension stage, fly-jib use, stabiliser position and setup.",
      "Final lift must be checked against the exact Palfinger chart and configuration before approval.",
    ],
    sourceLabel: "Palfinger PK6",
  },
  {
    id: "hiab-x-hipro-858",
    title: "HIAB X-HIPRO 858",
    machineType: "hiab",
    manufacturer: "HIAB",
    model: "X-HIPRO 858",
    aliases: ["x-hipro 858", "x hipro 858", "858", "hiab 858", "x-hipro858", "rigid hiab", "rigid"],
    summary: "HIAB / loader crane family with up to 18,000 kg at short radius and up to 34.8 m outreach depending on jib and extension setup.",
    maxCapacityKg: 18000,
    maxCapacityTonnes: 18,
    maxHydraulicOutreachM: 24,
    maxJibOutreachM: 34.8,
    capabilities: [
      "Loader crane / HIAB",
      "Hydraulic outreach to 24 m on E-10 example",
      "Jib outreach beyond 31 m",
      "Endless slewing",
    ],
    warnings: [
      "Use this profile for the rigid HIAB unless a more specific vehicle / asset match is found.",
      "Capacity depends on exact EP / E / JIB variant and support position.",
      "Hook, slings, jib and extension accessories must be deducted from available load.",
    ],
    sourceLabel: "HIAB X-HIPRO 858 spec",
  },
];

export function getEquipmentProfileById(id: string | null | undefined) {
  const key = String(id ?? "").trim().toLowerCase();
  if (!key) return null;
  return EQUIPMENT_PROFILES.find((profile) => profile.id === key) ?? null;
}
