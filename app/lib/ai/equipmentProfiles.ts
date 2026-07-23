export type CraneSetupOption = {
  key: string;
  label: string;
  boomConfiguration?: string | null;
  boomLengthM?: number | null;
  hydraulicOutreachM?: number | null;
  jibOutreachM?: number | null;
  maxRadiusM?: number | null;
  maxTipHeightM?: number | null;
  sourceDocumentTitle?: string | null;
  sourcePage?: number | null;
  sourceLabel?: string | null;
  chartNote?: string | null;
  configurationNote?: string | null;
  outriggerNote?: string | null;
};

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
  configurationNote?: string | null;
  weatherNote?: string | null;
  capabilities: string[];
  warnings: string[];
  sourceLabel: string;
  setupOptions?: CraneSetupOption[];
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
    configurationNote: "Use the GMK4080-1 in the planned configuration only after confirming boom length, counterweight, duty and setup against the current chart. The product guide shows a 6-section 11.0 m to 51.0 m boom and a hydraulic levelling / outrigger system on the carrier.",
    outriggersNote: "Deploy all outriggers on suitable pads / mats, level the crane and confirm the exact extension / setup before lifting. Automatic levelling assistance does not remove the need for a full ground and chart check.",
    weatherNote: "Do not proceed in unsafe wind or weather. Final wind and duty limits must be checked against the current chart, boom / jib arrangement, counterweight and site conditions.",
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
    configurationNote: "The MTK 35 sheet shows a 10 m to 32 m telescopic boom with jib options, and states the published capacities are with fully extended outriggers.",
    outriggersNote: "Use fully extended outriggers unless a separately checked reduced-outrigger duty is available. Ground must be firm, level and suitable for outrigger loading.",
    weatherNote: "The MTK 35 sheet notes operation permissible up to Beaufort 5 or 7 depending on boom length. Final wind limit must be checked against the actual boom / jib configuration before lifting.",
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
    configurationNote: "Use the AK 46/6000 in the planned boom / jib arrangement only after checking the working range chart for the intended radius and load. The spec sheet shows up to 44.0 m extension length and approximately 39.0 m radius at 250 kg.",
    outriggersNote: "Set up on suitable support with the truck crane level, using pads / mats as required by ground conditions and site layout, especially in tight spaces.",
    weatherNote: "Do not proceed in wind, lightning or visibility conditions that make long-radius or light-load work unsafe. Final operating limit must be checked against the current chart and site conditions.",
    sourceLabel: "AK46-6000 spec",
  },
  {
    id: "spx532",
    title: "Jekko SPX532",
    machineType: "spider",
    manufacturer: "Jekko",
    model: "SPX532",
    aliases: ["spx532", "jekko 532", "jekko spx532", "spx 532"],
    summary: "Spider crane with 2.5 m to 10.8 m boom, 3.2 t max capacity, main boom chart to 9.7 m radius, and Jekko jib charts including JIB1000.2H1MX up to 14.8 m max outreach.",
    maxCapacityKg: 3200,
    maxCapacityTonnes: 3.2,
    maxBoomLengthM: 10.8,
    maxRadiusM: 9.7,
    maxTipHeightM: 17.3,
    maxHydraulicOutreachM: 9.7,
    maxJibOutreachM: 14.8,
    capabilities: [
      "Spider crane",
      "Multiple outrigger positions",
      "Main boom chart to 9.7 m radius",
      "JIB1000.2H1MX / fly-jib chart up to 14.8 m max outreach",
      "JIB1200GX and JIB500GR attachment charts",
      "Compact access lifting",
    ],
    setupOptions: [
      {
        key: "jekko-spx532-main-boom",
        label: "Main boom – 10.8 m boom – 9.7 m radius / outreach",
        boomConfiguration: "Main boom",
        boomLengthM: 10.8,
        hydraulicOutreachM: 9.7,
        jibOutreachM: null,
        maxRadiusM: 9.7,
        maxTipHeightM: 12.1,
        sourceDocumentTitle: "Jekko SPX532 specsheet",
        sourcePage: 9,
        sourceLabel: "Jekko SPX532 specsheet – main boom chart page 9",
        chartNote:
          "Jekko SPX532 main boom chart: maximum boom 10.8 m, Rmax 9.7 m and Hmax 12.1 m. Verify radius, outrigger/stability zone, hook block/accessory deductions and chart capacity before approval.",
        configurationNote:
          "Main boom setup selected from the Jekko SPX532 specification / load chart.",
        outriggerNote:
          "Select the correct SPX532 outrigger/stability position before lifting; reduced/asymmetric outrigger setups change the available duty.",
      },
      {
        key: "jekko-spx532-jib1000-2h1mx",
        label: "Main boom + JIB1000.2H1MX / fly jib – 14.8 m max outreach",
        boomConfiguration: "Main boom + JIB1000.2H1MX / fly jib",
        boomLengthM: 10.5,
        hydraulicOutreachM: 9.7,
        jibOutreachM: 14.8,
        maxRadiusM: 14.8,
        maxTipHeightM: 17.3,
        sourceDocumentTitle: "Jekko SPX532 specsheet",
        sourcePage: 12,
        sourceLabel: "Jekko SPX532 specsheet – JIB1000.2H1MX chart pages 12-14",
        chartNote:
          "Jekko SPX532 JIB1000.2H1MX chart: Rmax 14.8 m and Hmax 17.3 m. Verify the exact jib length/angle, duty chart, outrigger/stability zone, hook/winch configuration and all deductions before approval.",
        configurationNote:
          "Main boom with JIB1000.2H1MX / fly-jib setup selected from the Jekko SPX532 specification / load chart.",
        outriggerNote:
          "Use the correct SPX532 stability area and outrigger setup for the selected JIB1000.2H1MX chart before lifting.",
      },
      {
        key: "jekko-spx532-jib1200gx",
        label: "Main boom + JIB1200GX – 10.6 m max radius",
        boomConfiguration: "Main boom + JIB1200GX",
        boomLengthM: 10.3,
        hydraulicOutreachM: 9.7,
        jibOutreachM: 10.6,
        maxRadiusM: 10.6,
        maxTipHeightM: 13.1,
        sourceDocumentTitle: "Jekko SPX532 specsheet",
        sourcePage: 15,
        sourceLabel: "Jekko SPX532 specsheet – JIB1200GX chart pages 15-17",
        chartNote:
          "Jekko SPX532 JIB1200GX chart: Rmax 10.6 m and Hmax 13.1 m. Verify the exact chart, jib position/angle, outrigger/stability zone and lifting accessory deductions before approval.",
        configurationNote:
          "Main boom with JIB1200GX setup selected from the Jekko SPX532 specification / load chart.",
        outriggerNote:
          "Confirm the required SPX532 outrigger/stability position and ground support for the selected JIB1200GX chart before lifting.",
      },
      {
        key: "jekko-spx532-jib500gr",
        label: "Main boom + JIB500GR / grabber jib – 10.6 m max radius",
        boomConfiguration: "Main boom + JIB500GR / grabber jib",
        boomLengthM: 10.3,
        hydraulicOutreachM: 9.7,
        jibOutreachM: 10.6,
        maxRadiusM: 10.6,
        maxTipHeightM: 12.1,
        sourceDocumentTitle: "Jekko SPX532 specsheet",
        sourcePage: 18,
        sourceLabel: "Jekko SPX532 specsheet – JIB500GR chart pages 18-20",
        chartNote:
          "Jekko SPX532 JIB500GR chart: Rmax 10.6 m and Hmax 12.1 m. Verify the exact chart, attachment setup, outrigger/stability zone and all deductions before approval.",
        configurationNote:
          "Main boom with JIB500GR / grabber jib setup selected from the Jekko SPX532 specification / load chart.",
        outriggerNote:
          "Confirm SPX532 outrigger/stability zone and suitable mats/spreaders for the JIB500GR configuration before lifting.",
      },
    ],
    warnings: [
      "Capacity depends on exact outrigger position and stability zone.",
      "Close outrigger setups can reduce or eliminate lifting capacity in some zones.",
      "Hook block, rope, jib and accessories form part of the load and must be accounted for.",
    ],
    configurationNote: "The SPX532 has multiple stability / outrigger positions and the effective duty changes with the chosen geometry. Use the correct stability zone and boom chart for the planned lift.",
    outriggersNote: "Select and confirm the correct outrigger position before lifting. Reduced or asymmetric outrigger setups can significantly reduce capacity or remove lifting capacity in some zones.",
    weatherNote: "Do not proceed in wind, lightning or poor visibility. Final duty must be checked against the selected outrigger position, boom chart, hook block and accessories.",
    sourceLabel: "Jekko 532 specsheet",
  },
  {
    id: "palfinger-pk65002-sh",
    title: "Palfinger PK 65002 SH E",
    machineType: "hiab",
    manufacturer: "Palfinger",
    model: "PK 65002 SH E",
    aliases: [
      "pk 65002 sh e",
      "pk65002 sh e",
      "palfinger pk 65002 sh e",
      "sf25 xnb",
      "sf25xnb",
    ],
    summary: "AnnS rigid HIAB on SF25 XNB: Palfinger PK 65002 SH E, main boom only, seven hydraulic extensions and 15.7 m maximum charted hydraulic outreach.",
    maxCapacityKg: 20000,
    maxCapacityTonnes: 20,
    maxHydraulicOutreachM: 15.7,
    maxJibOutreachM: null,
    maxRadiusM: 15.7,
    capabilities: [
      "Rigid loader crane / HIAB",
      "PK 65002 SH E hydraulic-extension configuration",
      "Seven hydraulic extensions",
      "Main boom only — no fly jib fitted",
      "HPSC stabiliser control",
      "Continuous slewing system",
    ],
    setupOptions: [
      {
        key: "pk65002-sh-e-main-boom",
        label: "PK 65002 SH E — main boom only — 15.7 m hydraulic outreach",
        boomConfiguration: "Main boom only",
        hydraulicOutreachM: 15.7,
        jibOutreachM: null,
        maxRadiusM: 15.7,
        sourceDocumentTitle: "Palfinger PK6",
        sourcePage: 8,
        sourceLabel: "Palfinger PK 65002 SH E load chart — page 8",
        chartNote: "Use the PK 65002 SH E main-boom chart only. The charted duties are 13,400 kg at 4.2 m, 9,300 kg at 5.9 m, 7,000 kg at 7.6 m, 5,400 kg at 9.5 m, 4,350 kg at 11.5 m, 3,600 kg at 13.6 m and 3,100 kg at 15.7 m.",
        configurationNote: "SF25 XNB is fitted with the PK 65002 SH E main-boom configuration. No fly jib is fitted.",
        outriggerNote: "Use the exact HPSC stabiliser position selected for the lift, on suitable pads / mats, with the vehicle level. Reduced stabiliser deployment changes the available duty.",
      },
    ],
    warnings: [
      "Use this profile for AnnS rigid HIAB SF25 XNB.",
      "Capacity changes with hydraulic extension stage, operating sector and HPSC stabiliser position.",
      "The fitted AnnS configuration is main boom only; do not use fly-jib charts.",
      "Hook, slings and lifting accessories form part of the gross suspended load.",
    ],
    configurationNote: "Use SF25 XNB only as Palfinger PK 65002 SH E, main boom only, against the exact E-configuration chart and selected HPSC stabiliser duty.",
    outriggersNote: "Set stabilisers to the required HPSC-supported position on suitable pads / mats, keep the vehicle level and confirm the exact working sector and support arrangement before taking the load.",
    weatherNote: "Do not proceed in unsafe wind, lightning or poor visibility. Final operating limits must be checked against the PK 65002 SH E chart, extension stage, working sector and stabiliser position.",
    sourceLabel: "Palfinger PK6 — PK 65002 SH E",
  },
  {
    id: "hiab-x-hipro-858",
    title: "HIAB X-HIPRO 858 EP-6",
    machineType: "hiab",
    manufacturer: "HIAB",
    model: "X-HIPRO 858 EP-6",
    aliases: [
      "x-hipro 858 ep-6",
      "x hipro 858 ep 6",
      "858 ep-6",
      "858 ep6",
      "sn74 xpx",
      "sn74xpx",
    ],
    summary: "AnnS artic HIAB on SN74 XPX: HIAB X-HIPRO 858 EP-6, main boom only, six hydraulic extensions and 16.4 m maximum hydraulic outreach.",
    maxCapacityKg: 18000,
    maxCapacityTonnes: 18,
    maxHydraulicOutreachM: 16.4,
    maxJibOutreachM: null,
    maxRadiusM: 16.3,
    capabilities: [
      "Artic loader crane / HIAB",
      "X-HIPRO 858 EP-6 configuration",
      "Six hydraulic extensions",
      "Main boom only — no jib fitted",
      "Endless slewing",
    ],
    setupOptions: [
      {
        key: "x-hipro-858-ep6-main-boom",
        label: "X-HIPRO 858 EP-6 — main boom only — 16.4 m hydraulic outreach",
        boomConfiguration: "Main boom only",
        hydraulicOutreachM: 16.4,
        jibOutreachM: null,
        maxRadiusM: 16.3,
        sourceDocumentTitle: "HIAB X-HIPRO 858 specification",
        sourcePage: 2,
        sourceLabel: "HIAB X-HIPRO 858 EP-6 technical data — page 2",
        chartNote: "Use the X-HIPRO 858 EP-6 main-boom duties only: 18,000 kg at 3.9 m, 15,700 kg at 4.7 m, 11,700 kg at 6.2 m, 8,800 kg at 8.0 m, 7,000 kg at 9.9 m, 5,700 kg at 11.9 m, 4,750 kg at 14.1 m and 4,100 kg at 16.3 m.",
        configurationNote: "SN74 XPX is fitted with the X-HIPRO 858 EP-6 main-boom configuration. No jib is fitted.",
        outriggerNote: "Deploy the supports to the charted working position on suitable pads / mats, keep the vehicle level and confirm the permitted working sector before taking the load.",
      },
    ],
    warnings: [
      "Use this profile for AnnS artic HIAB SN74 XPX.",
      "Capacity changes with hydraulic extension stage, working sector and support position.",
      "The fitted AnnS configuration is EP-6 main boom only; do not use E-10 or jib charts.",
      "Hook, slings and lifting accessories form part of the gross suspended load.",
    ],
    configurationNote: "Use SN74 XPX only as HIAB X-HIPRO 858 EP-6, main boom only, against the EP-6 duty data and selected support position.",
    outriggersNote: "Deploy supports / stabilisers to the required working position on suitable pads / mats, keep the vehicle level and confirm the working sector before lifting.",
    weatherNote: "Do not proceed in unsafe wind, lightning or poor visibility. Final limits must be checked against the X-HIPRO 858 EP-6 duty data, extension stage, support position and site conditions.",
    sourceLabel: "HIAB X-HIPRO 858 — EP-6",
  },
];

export function getEquipmentProfileById(id: string | null | undefined) {
  const key = String(id ?? "").trim().toLowerCase();
  if (!key) return null;
  return EQUIPMENT_PROFILES.find((profile) => profile.id === key) ?? null;
}
