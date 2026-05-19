import type { EquipmentProfile } from "./equipmentProfiles";

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
    /(?:max(?:imum)?\s+)?(?:lifting\s+)?capacity[^0-9]{0,40}(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /(?:rated\s+)?capacity[^0-9]{0,40}(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /(?:load\s+moment|maximum\s+load)[^0-9]{0,40}(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\b/g,
    /\b(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\s+(?:capacity|crane|all[-\s]?terrain|truck[-\s]?mounted|mobile)\b/g,
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
    for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:t|tonnes?|tons?)\b/g)) {
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
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= min && n <= max) values.push(n);
    }
  }
  if (!values.length) return null;
  return Number(Math.max(...values).toFixed(2));
}

function parseBoomLengthM(text: string) {
  return parseLargestMetres(
    [
      /(?:main\s+)?boom(?:\s+length)?[^0-9]{0,60}(\d+(?:\.\d+)?)\s*m\b/g,
      /(?:telescopic\s+)?boom[^0-9]{0,60}(?:from\s+)?\d+(?:\.\d+)?\s*m\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*m\b/g,
      /\b(\d+(?:\.\d+)?)\s*m\s+(?:main\s+)?boom\b/g,
    ],
    text,
    3,
    120
  );
}

function parseRadiusM(text: string) {
  return parseLargestMetres(
    [
      /(?:max(?:imum)?\s+)?(?:working\s+)?radius[^0-9]{0,50}(\d+(?:\.\d+)?)\s*m\b/g,
      /(?:max(?:imum)?\s+)?outreach[^0-9]{0,50}(\d+(?:\.\d+)?)\s*m\b/g,
      /\b(\d+(?:\.\d+)?)\s*m\s+(?:radius|outreach)\b/g,
    ],
    text,
    2,
    120
  );
}

function parseTipHeightM(text: string) {
  return parseLargestMetres(
    [
      /(?:max(?:imum)?\s+)?(?:tip\s+)?height[^0-9]{0,50}(\d+(?:\.\d+)?)\s*m\b/g,
      /\b(\d+(?:\.\d+)?)\s*m\s+(?:tip\s+)?height\b/g,
    ],
    text,
    3,
    150
  );
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
  const manufacturer = clean(generated.manufacturer) || clean(crane.make) || undefined;
  const model = clean(generated.model) || clean(crane.model) || undefined;
  const sourceLabel = clean(generated.sourceLabel) || clean(usefulDocs[0]?.title) || "Uploaded crane specification";

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
    ]
      .filter(Boolean)
      .join(", ") || "Crane details taken from the uploaded specification / load chart.",
    maxCapacityKg: maxCapacityKg ?? null,
    maxCapacityTonnes: maxCapacityTonnes ?? null,
    maxBoomLengthM: maxBoomLengthM ?? null,
    maxTipHeightM: maxTipHeightM ?? null,
    maxHydraulicOutreachM: null,
    maxJibOutreachM: null,
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
  };
}
