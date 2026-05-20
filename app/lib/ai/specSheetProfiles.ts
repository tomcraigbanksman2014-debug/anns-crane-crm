import type { CraneSetupOption, EquipmentProfile } from "./equipmentProfiles";

export type StoredCraneSpecDocument = {
  id?: string | null;
  title?: string | null;
  document_type?: string | null;
  extracted_text?: string | null;
  extracted_profile?: Record<string, any> | null;
  uploaded_at?: string | null;
};

type CraneLike = {
  id?: string | null;
  name?: string | null;
  make?: string | null;
  model?: string | null;
  capacity?: string | number | null;
  crane_documents?: StoredCraneSpecDocument[] | null;
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCapacityKgFromText(...values: unknown[]) {
  const text = values.map((value) => String(value ?? "")).join(" ").toLowerCase();
  const candidates: number[] = [];

  const nearCapacity = [
    /(?:max(?:imum)?\s+)?(?:lifting\s+)?capacity[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /(?:rated\s+)?capacity[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /(?:load\s+moment|maximum\s+load)[^0-9]{0,40}(\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /\b(\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)\s+(?:capacity|crane|all[-\s]?terrain|truck[-\s]?mounted|mobile)\b/g,
  ];

  for (const re of nearCapacity) {
    for (const match of text.matchAll(re)) {
      const tonnes = Number(match[1]);
      if (Number.isFinite(tonnes) && tonnes >= 1 && tonnes <= 1500) {
        candidates.push(tonnes * 1000);
      }
    }
  }

  if (!candidates.length) {
    for (const match of text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:t|tonnes?|tons?)\b/g)) {
      const tonnes = Number(match[1]);
      if (Number.isFinite(tonnes) && tonnes >= 1 && tonnes <= 1500) {
        candidates.push(tonnes * 1000);
      }
    }
  }

  if (!candidates.length) {
    for (const match of text.matchAll(/\b(\d{3,}(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\b/g)) {
      const kg = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(kg) && kg >= 1000 && kg <= 1500000) {
        candidates.push(kg);
      }
    }
  }

  if (!candidates.length) return null;
  return Math.max(...candidates);
}

function parseLargestMetres(regexes: RegExp[], text: string, min = 1, max = 150) {
  const values: number[] = [];
  for (const re of regexes) {
    for (const match of text.matchAll(re)) {
      const raw = String(match[1] ?? "").replace(",", ".");
      const n = Number(raw);
      if (Number.isFinite(n) && n >= min && n <= max) values.push(n);
    }
  }
  if (!values.length) return null;
  return Number(Math.max(...values).toFixed(2));
}

function parseBoomLengthM(text: string) {
  return parseLargestMetres(
    [
      /(?:main\s+)?boom(?:\s+length)?[^0-9]{0,60}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /(?:telescopic\s+)?boom[^0-9]{0,60}(?:from\s+)?\d+(?:[.,]\d+)?\s*m\s*(?:to|-|–)\s*(\d+(?:[.,]\d+)?)\s*m\b/g,
      /\b(\d+(?:[.,]\d+)?)\s*m\s+(?:main\s+)?boom\b/g,
    ],
    text,
    3,
    120
  );
}

function parseRadiusM(text: string) {
  return parseLargestMetres(
    [
      /(?:max(?:imum)?\s+)?(?:working\s+)?radius[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /(?:max(?:imum)?\s+)?outreach[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /\b(\d+(?:[.,]\d+)?)\s*m\s+(?:radius|outreach)\b/g,
    ],
    text,
    2,
    120
  );
}

function parseTipHeightM(text: string) {
  return parseLargestMetres(
    [
      /(?:max(?:imum)?\s+)?(?:tip\s+)?height[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /\b(\d+(?:[.,]\d+)?)\s*m\s+(?:tip\s+)?height\b/g,
    ],
    text,
    3,
    150
  );
}

function slug(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "setup";
}

function parseJibLengthM(text: string) {
  return parseLargestMetres(
    [
      /(?:fly\s*)?jib(?:\s+length)?[^0-9]{0,60}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /(?:swingaway|swing-away|extension)[^0-9]{0,60}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /\b(\d+(?:[.,]\d+)?)\s*m\s+(?:fly\s*)?jib\b/g,
    ],
    text,
    1,
    80
  );
}

function parseJibOutreachM(text: string) {
  return parseLargestMetres(
    [
      /(?:fly\s*)?jib[^.\n\r]{0,120}(?:radius|outreach|reach|working\s+radius)[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /(?:radius|outreach|reach|working\s+radius)[^.\n\r]{0,120}(?:fly\s*)?jib[^0-9]{0,50}(\d+(?:[.,]\d+)?)\s*m\b/g,
      /(?:max(?:imum)?\s+)?(?:jib\s+)?(?:outreach|radius|reach)[^0-9]{0,60}(\d+(?:[.,]\d+)?)\s*m\b/g,
    ],
    text,
    2,
    160
  );
}

function numberFromProfile(profile: Record<string, any> | null, keys: string[]) {
  if (!profile) return null;
  for (const key of keys) {
    const value = numberOrNull(profile[key]);
    if (value !== null) return value;
  }
  return null;
}

function setupFromStoredItem(item: any, docTitle: string, index: number): CraneSetupOption | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const label = clean(item.label ?? item.name ?? item.title ?? item.configuration ?? item.boomConfiguration);
  const boomLengthM = numberOrNull(item.boomLengthM ?? item.maxBoomLengthM ?? item.boom_length_m);
  const hydraulicOutreachM = numberOrNull(item.hydraulicOutreachM ?? item.maxHydraulicOutreachM ?? item.hydraulic_outreach_m ?? item.outreachM ?? item.outreach_m);
  const jibOutreachM = numberOrNull(item.jibOutreachM ?? item.maxJibOutreachM ?? item.jib_outreach_m ?? item.max_outreach_m);
  const maxRadiusM = numberOrNull(item.maxRadiusM ?? item.radiusM ?? item.radius_m ?? item.max_radius_m);
  const maxTipHeightM = numberOrNull(item.maxTipHeightM ?? item.tipHeightM ?? item.tip_height_m);

  if (!label && !boomLengthM && !hydraulicOutreachM && !jibOutreachM && !maxRadiusM && !maxTipHeightM) return null;

  return {
    key: clean(item.key) || `${slug(docTitle)}-${index + 1}`,
    label:
      label ||
      [
        item.boomConfiguration || item.configuration || "Crane setup",
        boomLengthM ? `${boomLengthM} m boom` : null,
        jibOutreachM ? `${jibOutreachM} m jib / max outreach` : maxRadiusM ? `${maxRadiusM} m radius` : null,
      ]
        .filter(Boolean)
        .join(" – "),
    boomConfiguration: clean(item.boomConfiguration ?? item.configuration ?? item.boom_configuration) || null,
    boomLengthM,
    hydraulicOutreachM,
    jibOutreachM,
    maxRadiusM,
    maxTipHeightM,
    sourceDocumentTitle: docTitle || null,
    sourcePage: numberOrNull(item.sourcePage ?? item.page ?? item.page_number),
    sourceLabel: clean(item.sourceLabel ?? item.source_label) || docTitle || null,
    chartNote: clean(item.chartNote ?? item.chart_note ?? item.note) || null,
    configurationNote: clean(item.configurationNote ?? item.configuration_note) || null,
    outriggerNote: clean(item.outriggerNote ?? item.outrigger_note) || null,
  };
}

function setupOptionsFromStoredProfile(profile: Record<string, any> | null, docTitle: string) {
  if (!profile) return [] as CraneSetupOption[];
  const rawLists = [
    profile.setupOptions,
    profile.craneSetupOptions,
    profile.setups,
    profile.configurations,
    profile.chartConfigurations,
  ];

  const out: CraneSetupOption[] = [];
  for (const raw of rawLists) {
    if (!Array.isArray(raw)) continue;
    raw.forEach((item, index) => {
      const option = setupFromStoredItem(item, docTitle, index);
      if (option) out.push(option);
    });
  }
  return out;
}

function buildKnownModelSetupOptions({
  title,
  documentTitle,
  text,
}: {
  title: string;
  documentTitle: string;
  text: string;
}) {
  const combined = lower([title, documentTitle, text].filter(Boolean).join(" "));
  const isJekkoSpx532 =
    /\bspx\s*532\b/.test(combined) ||
    /\bspx532\b/.test(combined) ||
    (combined.includes("jekko") && combined.includes("532"));

  if (!isJekkoSpx532) return [] as CraneSetupOption[];

  const sourceDocumentTitle = documentTitle || "Jekko SPX532 specification / load chart";
  const options: CraneSetupOption[] = [
    {
      key: "jekko-spx532-main-boom",
      label: "Main boom – 10.8 m boom – 9.7 m radius / outreach",
      boomConfiguration: "Main boom",
      boomLengthM: 10.8,
      hydraulicOutreachM: 9.7,
      jibOutreachM: null,
      maxRadiusM: 9.7,
      maxTipHeightM: 12.1,
      sourceDocumentTitle,
      sourcePage: 9,
      sourceLabel: `${sourceDocumentTitle} – main boom chart page 9`,
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
      sourceDocumentTitle,
      sourcePage: 12,
      sourceLabel: `${sourceDocumentTitle} – JIB1000.2H1MX chart pages 12-14`,
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
      sourceDocumentTitle,
      sourcePage: 15,
      sourceLabel: `${sourceDocumentTitle} – JIB1200GX chart pages 15-17`,
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
      sourceDocumentTitle,
      sourcePage: 18,
      sourceLabel: `${sourceDocumentTitle} – JIB500GR chart pages 18-20`,
      chartNote:
        "Jekko SPX532 JIB500GR chart: Rmax 10.6 m and Hmax 12.1 m. Verify the exact chart, attachment setup, outrigger/stability zone and all deductions before approval.",
      configurationNote:
        "Main boom with JIB500GR / grabber jib setup selected from the Jekko SPX532 specification / load chart.",
      outriggerNote:
        "Confirm SPX532 outrigger/stability zone and suitable mats/spreaders for the JIB500GR configuration before lifting.",
    },
  ];

  return options;
}


function buildHeuristicSetupOptions({
  title,
  documentTitle,
  text,
  maxBoomLengthM,
  maxRadiusM,
  maxTipHeightM,
}: {
  title: string;
  documentTitle: string;
  text: string;
  maxBoomLengthM: number | null;
  maxRadiusM: number | null;
  maxTipHeightM: number | null;
}) {
  const low = lower(text);
  const hasJibText = /\b(jib|fly\s*jib|flyjib|swingaway|swing-away|extension)\b/i.test(low);
  const jibLengthM = parseJibLengthM(low);
  const parsedJibOutreachM = parseJibOutreachM(low);
  const estimatedJibOutreachM = parsedJibOutreachM ?? (maxBoomLengthM && jibLengthM ? Number((maxBoomLengthM + jibLengthM).toFixed(2)) : null);
  const mainHydraulicOutreachM = maxRadiusM ?? maxBoomLengthM ?? null;

  const options: CraneSetupOption[] = [
    ...buildKnownModelSetupOptions({ title, documentTitle, text }),
  ];

  if (maxBoomLengthM || maxRadiusM || maxTipHeightM) {
    options.push({
      key: `${slug(title)}-main-boom`,
      label: [
        "Main boom",
        maxBoomLengthM ? `${maxBoomLengthM} m boom` : null,
        maxRadiusM ? `${maxRadiusM} m radius / outreach` : null,
      ]
        .filter(Boolean)
        .join(" – "),
      boomConfiguration: "Main boom",
      boomLengthM: maxBoomLengthM,
      hydraulicOutreachM: mainHydraulicOutreachM,
      jibOutreachM: null,
      maxRadiusM,
      maxTipHeightM,
      sourceDocumentTitle: documentTitle || null,
      sourceLabel: documentTitle || "Uploaded crane specification",
      chartNote: `Setup values extracted from ${documentTitle || "the uploaded crane specification"}. The appointed person must verify the exact chart, radius, counterweight and outrigger setup before approval.`,
      configurationNote: "Main boom configuration selected from uploaded crane specification / load chart.",
      outriggerNote: "Confirm outrigger extension, mats/spreaders and ground conditions against the selected chart before lifting.",
    });
  }

  if ((hasJibText && (estimatedJibOutreachM || jibLengthM || maxRadiusM || maxBoomLengthM)) || estimatedJibOutreachM) {
    options.push({
      key: `${slug(title)}-main-boom-jib`,
      label: [
        "Main boom + jib / fly jib",
        maxBoomLengthM ? `${maxBoomLengthM} m boom` : null,
        jibLengthM ? `${jibLengthM} m jib` : null,
        estimatedJibOutreachM ? `${estimatedJibOutreachM} m max outreach` : maxRadiusM ? `${maxRadiusM} m radius` : null,
      ]
        .filter(Boolean)
        .join(" – "),
      boomConfiguration: "Main boom + jib / fly jib",
      boomLengthM: maxBoomLengthM,
      hydraulicOutreachM: mainHydraulicOutreachM,
      jibOutreachM: estimatedJibOutreachM,
      maxRadiusM: estimatedJibOutreachM ?? maxRadiusM,
      maxTipHeightM,
      sourceDocumentTitle: documentTitle || null,
      sourceLabel: documentTitle || "Uploaded crane specification",
      chartNote: `Jib / fly-jib setup detected from ${documentTitle || "the uploaded crane specification"}. Verify the exact jib length, offset, duty chart, radius and deductions before approval.`,
      configurationNote: "Main boom with jib / fly-jib configuration selected from uploaded crane specification / load chart.",
      outriggerNote: "Confirm outrigger extension, mats/spreaders and ground conditions against the selected jib chart before lifting.",
    });
  }

  return options;
}

function dedupeSetupOptions(options: CraneSetupOption[]) {
  const seen = new Set<string>();
  const out: CraneSetupOption[] = [];

  for (const option of options) {
    const key = option.key || slug(option.label);
    const signature = [
      key,
      option.label,
      option.boomLengthM ?? "",
      option.hydraulicOutreachM ?? "",
      option.jibOutreachM ?? "",
      option.maxRadiusM ?? "",
    ]
      .join("|")
      .toLowerCase();
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push({ ...option, key });
  }

  return out.slice(0, 12);
}

function parseStoredProfile(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

export function buildExtractedCraneProfileJson({
  crane,
  text,
  title,
}: {
  crane?: CraneLike | null;
  text: string;
  title?: string | null;
}) {
  const combined = clean([crane?.name, crane?.make, crane?.model, crane?.capacity, title, text].filter(Boolean).join(" \n "));
  if (!combined) return null;

  const low = combined.toLowerCase();
  const maxCapacityKg = parseCapacityKgFromText(crane?.capacity, combined);
  const maxCapacityTonnes = maxCapacityKg ? Number((maxCapacityKg / 1000).toFixed(2)) : null;
  const maxBoomLengthM = parseBoomLengthM(low);
  const maxRadiusM = parseRadiusM(low);
  const maxTipHeightM = parseTipHeightM(low);
  const maxJibOutreachM = parseJibOutreachM(low);
  const manufacturer = clean(crane?.make) || null;
  const model = clean(crane?.model) || null;
  const titleText = unique([clean(crane?.name), [manufacturer, model].filter(Boolean).join(" "), clean(title)]).join(" / ") || "Uploaded crane specification";

  return {
    title: titleText,
    manufacturer,
    model,
    maxCapacityKg,
    maxCapacityTonnes,
    maxBoomLengthM,
    maxRadiusM,
    maxTipHeightM,
    maxHydraulicOutreachM: maxRadiusM ?? maxBoomLengthM,
    maxJibOutreachM,
    setupOptions: buildHeuristicSetupOptions({
      title: titleText,
      documentTitle: title ? clean(title) : "Uploaded crane specification",
      text: combined,
      maxBoomLengthM,
      maxRadiusM,
      maxTipHeightM,
    }),
    sourceLabel: title ? `Uploaded specification: ${clean(title)}` : "Uploaded crane specification",
    extractedAt: new Date().toISOString(),
  };
}

export function buildSpecSheetEquipmentProfile(crane: CraneLike | null | undefined): EquipmentProfile | null {
  if (!crane) return null;

  const docs = Array.isArray(crane.crane_documents) ? crane.crane_documents : [];
  const usefulDocs = docs.filter((doc) => {
    const kind = lower(doc.document_type);
    return kind === "spec_sheet" || kind === "load_chart" || kind === "manual" || !!doc.extracted_profile || !!doc.extracted_text;
  });

  if (!usefulDocs.length) return null;

  const storedProfiles = usefulDocs
    .map((doc) => ({ doc, profile: parseStoredProfile(doc.extracted_profile) }))
    .filter((item) => item.profile);

  const firstStored = storedProfiles[0]?.profile ?? null;
  const allText = usefulDocs.map((doc) => doc.extracted_text || "").filter(Boolean).join(" \n ");
  const generated = firstStored ?? buildExtractedCraneProfileJson({ crane, text: allText, title: usefulDocs[0]?.title });

  if (!generated) return null;

  const title = clean(generated.title) || [crane.name, crane.make, crane.model].filter(Boolean).join(" ") || "Uploaded crane specification";
  const maxCapacityKg = numberOrNull(generated.maxCapacityKg) ?? parseCapacityKgFromText(crane.capacity, allText);
  const maxCapacityTonnes = numberOrNull(generated.maxCapacityTonnes) ?? (maxCapacityKg ? Number((maxCapacityKg / 1000).toFixed(2)) : null);
  const maxBoomLengthM = numberOrNull(generated.maxBoomLengthM) ?? parseBoomLengthM(lower(allText));
  const maxRadiusM = numberOrNull(generated.maxRadiusM) ?? parseRadiusM(lower(allText));
  const maxTipHeightM = numberOrNull(generated.maxTipHeightM) ?? parseTipHeightM(lower(allText));
  const maxHydraulicOutreachM =
    numberOrNull(generated.maxHydraulicOutreachM) ??
    numberOrNull((generated as any).hydraulicOutreachM) ??
    maxRadiusM ??
    maxBoomLengthM;
  const maxJibOutreachM =
    numberOrNull(generated.maxJibOutreachM) ??
    numberOrNull((generated as any).jibOutreachM) ??
    parseJibOutreachM(lower(allText));
  const manufacturer = clean(generated.manufacturer) || clean(crane.make) || undefined;
  const model = clean(generated.model) || clean(crane.model) || undefined;
  const sourceLabel = clean(generated.sourceLabel) || clean(usefulDocs[0]?.title) || "Uploaded crane specification";
  const setupOptions = dedupeSetupOptions([
    ...storedProfiles.flatMap((item) => setupOptionsFromStoredProfile(item.profile, clean(item.doc?.title) || sourceLabel)),
    ...(Array.isArray((generated as any).setupOptions) ? ((generated as any).setupOptions as CraneSetupOption[]) : []),
    ...buildHeuristicSetupOptions({
      title,
      documentTitle: sourceLabel,
      text: allText || [title, crane.name, crane.make, crane.model].filter(Boolean).join(" "),
      maxBoomLengthM: maxBoomLengthM ?? null,
      maxRadiusM: maxRadiusM ?? null,
      maxTipHeightM: maxTipHeightM ?? null,
    }),
  ]);

  const aliases = unique([
    title,
    clean(crane.name),
    clean(crane.make),
    clean(crane.model),
    [crane.make, crane.model].filter(Boolean).join(" "),
  ]).map((value) => value.toLowerCase());

  return {
    id: `spec-sheet-${String(crane.id ?? title).replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase()}`,
    title,
    machineType: "crane",
    manufacturer,
    model,
    aliases,
    summary: [
      title,
      maxCapacityTonnes ? `max capacity ${maxCapacityTonnes} t` : null,
      maxBoomLengthM ? `boom ${maxBoomLengthM} m` : null,
      maxRadiusM ? `radius / outreach ${maxRadiusM} m` : null,
      maxJibOutreachM ? `jib / max outreach ${maxJibOutreachM} m` : null,
    ]
      .filter(Boolean)
      .join(", ") || "Crane details taken from the uploaded specification / load chart.",
    maxCapacityKg: maxCapacityKg ?? null,
    maxCapacityTonnes: maxCapacityTonnes ?? null,
    maxBoomLengthM: maxBoomLengthM ?? null,
    maxTipHeightM: maxTipHeightM ?? null,
    maxHydraulicOutreachM: maxHydraulicOutreachM ?? null,
    maxJibOutreachM: maxJibOutreachM ?? null,
    maxRadiusM: maxRadiusM ?? null,
    outriggersNote:
      "Outrigger, support and mat arrangement must be checked against the uploaded specification / load chart and the actual ground conditions before lifting.",
    configurationNote:
      "Crane configuration, boom length, counterweight / ballast, radius and duties must be checked against the uploaded specification / load chart for the actual lift.",
    weatherNote:
      "Weather and wind limits must be checked against the uploaded manufacturer/supplier information for the selected crane configuration.",
    capabilities: [
      "Crane profile built from the uploaded specification / load chart",
      "Lift plan wording uses the latest uploaded crane document where available",
      "Appendix pages can still be pulled into the pack from the uploaded PDF",
    ],
    warnings: [
      "Treat extracted specification values as planning aids only; the appointed person must check the actual manufacturer/supplier chart before approval.",
      "Capacity changes with radius, boom length, counterweight / ballast, outrigger setup, ground conditions and accessories.",
      "Hook block, slings and lifting accessories must be included in the total lifted weight and deducted from available chart capacity.",
    ],
    sourceLabel,
    setupOptions,
  };
}
