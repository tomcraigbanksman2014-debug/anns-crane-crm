import type { CSSProperties } from "react";
import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import CopyTextButton from "./CopyTextButton";

type ToneValue = "professional" | "sales" | "friendly";
type ModeValue = "all" | "availability" | "asset" | "services" | "short_notice";
type AssetType = "crane" | "vehicle" | null;
type ProviderType = "openai" | "fallback";

type SearchParams = {
  tone?: string | string[];
  mode?: string | string[];
  days?: string | string[];
  asset?: string | string[];
  generate?: string | string[];
};

type SocialCard = {
  key: "availability" | "asset" | "services" | "short_notice";
  title: string;
  body: string;
  hashtags: string;
  imageTip: string;
  provider: ProviderType;
};

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dateOnly(value: string | null | undefined) {
  return String(value ?? "").slice(0, 10);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
}

function overlapsWindow(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
  windowStart: string,
  windowEnd: string
) {
  const start = dateOnly(startValue);
  const end = dateOnly(endValue || startValue);

  if (!start) return false;

  return start <= windowEnd && (end || start) >= windowStart;
}

function validCraneJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "draft" && status !== "cancelled" && status !== "late_cancelled";
}

function validTransportJob(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status !== "cancelled";
}

function craneStart(row: any) {
  return row?.start_date || row?.job_date || row?.end_date || null;
}

function craneEnd(row: any) {
  return row?.end_date || row?.start_date || row?.job_date || null;
}

function transportStart(row: any) {
  return row?.transport_date || row?.delivery_date || null;
}

function transportEnd(row: any) {
  return row?.delivery_date || row?.transport_date || null;
}

function craneEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function vehicleEligibleStatus(status: string | null | undefined) {
  const s = String(status ?? "").toLowerCase();
  if (!s) return true;
  return !s.includes("maintenance") && !s.includes("repair") && !s.includes("inactive");
}

function clean(value: unknown) {
  const s = String(value ?? "").trim();
  return s.length ? s : "";
}

function compactSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(input: string) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getToneValue(value: string | string[] | undefined): ToneValue {
  const v = Array.isArray(value) ? value[0] : value;
  const safe = String(v ?? "professional").toLowerCase();
  if (safe === "sales" || safe === "friendly") return safe as ToneValue;
  return "professional";
}

function getModeValue(value: string | string[] | undefined): ModeValue {
  const v = Array.isArray(value) ? value[0] : value;
  const safe = String(v ?? "all").toLowerCase();
  if (
    safe === "availability" ||
    safe === "asset" ||
    safe === "services" ||
    safe === "short_notice"
  ) {
    return safe as ModeValue;
  }
  return "all";
}

function getDaysValue(value: string | string[] | undefined) {
  const v = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(14, v));
}

function getGenerateValue(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value;
  return String(v ?? "").toLowerCase() === "yes";
}

function hashtagsForPost(
  type: "availability" | "asset" | "services" | "short_notice",
  assetType?: "crane" | "vehicle"
) {
  const tags = ["#AnnSCraneHire", "#CraneHire", "#HIAB", "#Transport", "#UKWide"];

  if (type === "availability") tags.push("#Availability", "#ShortNotice");
  if (type === "asset") tags.push("#Fleet", "#Lifting");
  if (type === "services") tags.push("#ContractLift", "#HeavyHaulage");
  if (type === "short_notice") tags.push("#ShortNotice", "#RescueService");

  if (assetType === "crane") tags.push("#MobileCrane");
  if (assetType === "vehicle") tags.push("#MachineryMoves");

  return Array.from(new Set(tags)).join(" ");
}

function availabilityPost(args: {
  tone: ToneValue;
  days: number;
  freeCrane: any | null;
  freeVehicle: any | null;
}): SocialCard {
  const windowText = args.days === 1 ? "tomorrow" : `over the next ${args.days} days`;

  const craneLine = args.freeCrane
    ? `We currently have ${args.freeCrane.name}${args.freeCrane.capacity ? ` (${args.freeCrane.capacity})` : ""} available ${windowText}.`
    : "";

  const vehicleLine = args.freeVehicle
    ? `We also have ${args.freeVehicle.name}${args.freeVehicle.vehicle_type ? ` (${args.freeVehicle.vehicle_type})` : ""} available for transport support ${windowText}.`
    : "";

  let intro =
    "Looking for crane hire or transport support at short notice? AnnS Crane Hire can help.";

  if (args.tone === "sales") {
    intro =
      "Availability update from AnnS Crane Hire — if you have upcoming lifting or transport requirements, now is a good time to speak to us.";
  }

  if (args.tone === "friendly") {
    intro =
      "A quick availability update from us at AnnS Crane Hire in case it helps anyone planning work.";
  }

  const body = [
    intro,
    "",
    craneLine,
    vehicleLine,
    "",
    "We cover cranes, transport and wider lifting support with a professional but personal service, and we are not limited to just local work.",
    "",
    "If you have anything coming up, message us and we will be happy to discuss the best option.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    key: "availability",
    title: "Availability Post",
    body,
    hashtags: hashtagsForPost("availability"),
    imageTip: "Use a clean yard or on-site photo of the available crane or vehicle.",
    provider: "fallback",
  };
}

function assetSpotlightPost(args: {
  tone: ToneValue;
  asset: any | null;
  assetType: AssetType;
}): SocialCard {
  if (!args.asset || !args.assetType) {
    return {
      key: "asset",
      title: "Asset Spotlight",
      body: "Select a crane or vehicle above to generate an asset spotlight post.",
      hashtags: hashtagsForPost("asset"),
      imageTip: "Use a strong photo of the selected asset on a clean site or in the yard.",
      provider: "fallback",
    };
  }

  const assetName =
    clean(args.asset.name) || (args.assetType === "crane" ? "our crane" : "our vehicle");
  const detailBits = [
    args.asset.capacity ? args.asset.capacity : "",
    args.asset.vehicle_type ? args.asset.vehicle_type : "",
    args.asset.reg_number ? `Reg ${args.asset.reg_number}` : "",
  ].filter(Boolean);

  let intro = `Fleet spotlight: ${assetName}.`;
  if (args.tone === "sales") intro = `Available from the AnnS Crane Hire fleet: ${assetName}.`;
  if (args.tone === "friendly") {
    intro = `A quick spotlight on ${assetName} from the AnnS Crane Hire fleet.`;
  }

  const supportLine =
    args.assetType === "crane"
      ? "Ideal for crane hire, lifting support, contract lift work and planned or short-notice jobs."
      : "Ideal for transport support, machinery moves, HIAB work and site deliveries where a practical service matters.";

  const body = [
    intro,
    "",
    detailBits.length ? `Key details: ${detailBits.join(" • ")}.` : "",
    supportLine,
    "",
    "At AnnS Crane Hire we support customers across cranes, transport and wider lifting requirements, with a professional but personal approach.",
    "",
    "If this could help on an upcoming project, get in touch.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    key: "asset",
    title: "Asset Spotlight",
    body,
    hashtags: hashtagsForPost("asset", args.assetType),
    imageTip: "Use a strong branded shot of the selected asset working on site.",
    provider: "fallback",
  };
}

function servicesPost(args: { tone: ToneValue }): SocialCard {
  let intro =
    "AnnS Crane Hire is not just a one-trick pony and not just a small local firm.";

  if (args.tone === "sales") {
    intro =
      "If you are looking for a supplier that can support more than one part of a job, AnnS Crane Hire is worth a conversation.";
  }

  if (args.tone === "friendly") {
    intro =
      "A reminder that at AnnS Crane Hire we do far more than just turn up with a crane.";
  }

  const body = [
    intro,
    "",
    "We support crane hire, HIAB transport, contract lifts, machinery moves, container work, heavy haulage and wider lifting and transport requirements.",
    "",
    "That means customers can come to us for more of the job, not just one part of it.",
    "",
    "We cover work across the UK and pride ourselves on being professional, responsive and easy to deal with.",
    "",
    "If you have an upcoming requirement and want a practical team behind it, message us.",
  ].join("\n");

  return {
    key: "services",
    title: "Full Service Promo",
    body,
    hashtags: hashtagsForPost("services"),
    imageTip: "Use a collage or photo showing crane + transport together.",
    provider: "fallback",
  };
}

function shortNoticePost(args: {
  tone: ToneValue;
  asset: any | null;
  assetType: AssetType;
}): SocialCard {
  const assetName = args.asset ? clean(args.asset.name) : "";
  const specificLine = assetName
    ? `We currently have ${assetName} ready to go if a job needs picking up quickly.`
    : "We have fleet availability ready to go if a job needs picking up quickly.";

  let intro =
    "When plans change, timings move or something gets missed, AnnS Crane Hire can often help at short notice.";

  if (args.tone === "sales") {
    intro =
      "Deadlines move, suppliers let people down and plans change — that is where AnnS Crane Hire can step in.";
  }

  if (args.tone === "friendly") {
    intro =
      "We all know jobs do not always go to plan, which is why short-notice support matters.";
  }

  const body = [
    intro,
    "",
    specificLine,
    "",
    "Whether it is crane hire, transport support or a wider lifting requirement, we work hard to be the call people make when the pressure is on.",
    "",
    "If you need help on a job that has changed at the last minute, message us and we will do our best to assist.",
  ].join("\n");

  return {
    key: "short_notice",
    title: "Short-Notice / Rescue Style Post",
    body,
    hashtags: hashtagsForPost("short_notice", args.assetType ?? undefined),
    imageTip: "Use a live working photo and keep the caption direct.",
    provider: "fallback",
  };
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function extractJsonObject(value: string) {
  const cleaned = stripCodeFence(value);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain JSON.");
  }
  return cleaned.slice(start, end + 1);
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (!Array.isArray(item?.content)) continue;

    for (const content of item.content) {
      const text =
        typeof content?.text === "string"
          ? content.text
          : typeof content?.output_text === "string"
          ? content.output_text
          : "";
      if (text) chunks.push(text);
    }
  }

  return chunks.join("\n").trim();
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
      temperature: 0.8,
      max_output_tokens: maxOutputTokens,
      input,
    }),
    cache: "no-store",
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

async function generateAiCards(args: {
  tone: ToneValue;
  days: number;
  windowStart: string;
  windowEnd: string;
  freeCraneCount: number;
  freeVehicleCount: number;
  freeCrane: any | null;
  freeVehicle: any | null;
  selectedAsset: any | null;
  selectedAssetType: AssetType;
  requestedKeys: Array<SocialCard["key"]>;
}) {
  const selectedAssetName = args.selectedAsset ? clean(args.selectedAsset.name) : "";
  const selectedAssetBits = [
    args.selectedAsset?.capacity ? String(args.selectedAsset.capacity) : "",
    args.selectedAsset?.vehicle_type ? String(args.selectedAsset.vehicle_type) : "",
    args.selectedAsset?.reg_number ? `Reg ${args.selectedAsset.reg_number}` : "",
    args.selectedAsset?.fleet_number ? `Fleet ${args.selectedAsset.fleet_number}` : "",
  ]
    .filter(Boolean)
    .join(" • ");

  const prompt = [
    "You are writing high-quality LinkedIn-ready social media posts for AnnS Crane Hire in the UK.",
    "Write commercially strong posts that sound human, practical and sales-focused without sounding robotic.",
    "Do not use markdown. Do not use emojis. Do not use quotation marks around the whole response.",
    "Return only valid JSON in this exact format:",
    '{"posts":[{"key":"availability","title":"string","body":"string","hashtags":"string","imageTip":"string"}]}',
    "Use only the keys requested.",
    "Each body should be a ready-to-post caption with short paragraphs.",
    "Put hashtags only in the hashtags field, not in the body.",
    "",
    `Tone: ${args.tone}`,
    `Availability window: ${fmtDate(args.windowStart)} to ${fmtDate(args.windowEnd)} (${args.days} day window)`,
    `Free cranes count: ${args.freeCraneCount}`,
    `Free vehicles count: ${args.freeVehicleCount}`,
    `Example free crane: ${
      args.freeCrane
        ? `${clean(args.freeCrane.name)}${args.freeCrane.capacity ? ` (${args.freeCrane.capacity})` : ""}`
        : "None"
    }`,
    `Example free vehicle: ${
      args.freeVehicle
        ? `${clean(args.freeVehicle.name)}${args.freeVehicle.vehicle_type ? ` (${args.freeVehicle.vehicle_type})` : ""}`
        : "None"
    }`,
    `Selected asset type: ${args.selectedAssetType || "None"}`,
    `Selected asset name: ${selectedAssetName || "None"}`,
    `Selected asset details: ${selectedAssetBits || "None"}`,
    "Business context: AnnS Crane Hire supports crane hire, HIAB transport, contract lifts, machinery moves, container work, heavy haulage and wider lifting and transport requirements across the UK.",
    "Brand position: professional but personal service, responsive, not just a small local firm, UK-wide support.",
    `Requested keys: ${args.requestedKeys.join(", ")}`,
    "",
    "Post intent guidance:",
    "- availability: promote near-term free fleet availability",
    "- asset: spotlight the selected asset and what it can support",
    "- services: promote the wider range of services, not just one offering",
    "- short_notice: urgent rescue-style post for late changes and short-notice support",
  ].join("\n");

  const text = await callOpenAI(prompt, 2200);
  const parsed = JSON.parse(extractJsonObject(text)) as {
    posts?: Array<{
      key?: string;
      title?: string;
      body?: string;
      hashtags?: string;
      imageTip?: string;
    }>;
  };

  const rows = Array.isArray(parsed?.posts) ? parsed.posts : [];

  const mapped: Array<SocialCard | null> = rows.map((row) => {
    const key = String(row?.key ?? "").trim() as SocialCard["key"];
    if (!["availability", "asset", "services", "short_notice"].includes(key)) return null;

    return {
      key,
      title: compactSpaces(String(row?.title ?? "")) || "Generated Post",
      body: String(row?.body ?? "").trim(),
      hashtags: compactSpaces(String(row?.hashtags ?? "")),
      imageTip: compactSpaces(String(row?.imageTip ?? "")) || "Use a strong relevant image.",
      provider: "openai",
    };
  });

  return mapped.filter((row): row is SocialCard => Boolean(row && row.body));
}

function mergeCards(
  fallbackCards: SocialCard[],
  aiCards: SocialCard[] | null,
  requestedKeys: Array<SocialCard["key"]>
) {
  if (!aiCards || !aiCards.length) {
    return fallbackCards.filter((card) => requestedKeys.includes(card.key));
  }

  const aiMap = new Map(aiCards.map((card) => [card.key, card]));
  return fallbackCards
    .filter((card) => requestedKeys.includes(card.key))
    .map((card) => aiMap.get(card.key) || card);
}

function providerLabel(cards: SocialCard[], shouldUseAI: boolean) {
  if (!shouldUseAI) return "Preview";
  const openAiCount = cards.filter((card) => card.provider === "openai").length;
  if (openAiCount === 0) return "Fallback";
  if (openAiCount === cards.length) return "AI";
  return "Mixed";
}

export default async function SocialMediaContentPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createSupabaseServerClient();

  const tone = getToneValue(searchParams?.tone);
  const mode = getModeValue(searchParams?.mode);
  const days = getDaysValue(searchParams?.days);
  const shouldUseAI = getGenerateValue(searchParams?.generate);
  const assetParam = String(
    Array.isArray(searchParams?.asset) ? searchParams?.asset[0] : searchParams?.asset ?? ""
  );

  const tomorrow = addDays(new Date(), 1);
  const endDate = addDays(tomorrow, days - 1);
  const windowStart = tomorrow.toISOString().slice(0, 10);
  const windowEnd = endDate.toISOString().slice(0, 10);

  const [
    { data: cranes, error: cranesError },
    { data: vehicles, error: vehiclesError },
    { data: jobs, error: jobsError },
    { data: transportJobs, error: transportError },
  ] = await Promise.all([
    supabase
      .from("cranes")
      .select("id, name, reg_number, fleet_number, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("vehicles")
      .select("id, name, reg_number, vehicle_type, capacity, status, archived")
      .eq("archived", false)
      .order("name", { ascending: true }),
    supabase
      .from("jobs")
      .select("id, crane_id, job_date, start_date, end_date, status")
      .not("crane_id", "is", null),
    supabase
      .from("transport_jobs")
      .select("id, vehicle_id, transport_date, delivery_date, status")
      .not("vehicle_id", "is", null),
  ]);

  const activeCraneJobs = (jobs ?? []).filter(
    (row: any) =>
      validCraneJob(row) &&
      row.crane_id &&
      overlapsWindow(craneStart(row), craneEnd(row), windowStart, windowEnd)
  );

  const activeTransportJobs = (transportJobs ?? []).filter(
    (row: any) =>
      validTransportJob(row) &&
      row.vehicle_id &&
      overlapsWindow(transportStart(row), transportEnd(row), windowStart, windowEnd)
  );

  const bookedCraneIds = new Set(activeCraneJobs.map((row: any) => String(row.crane_id)));
  const bookedVehicleIds = new Set(activeTransportJobs.map((row: any) => String(row.vehicle_id)));

  const freeCranes = (cranes ?? [])
    .filter((crane: any) => craneEligibleStatus(crane.status))
    .filter((crane: any) => !bookedCraneIds.has(String(crane.id)));

  const freeVehicles = (vehicles ?? [])
    .filter((vehicle: any) => vehicleEligibleStatus(vehicle.status))
    .filter((vehicle: any) => !bookedVehicleIds.has(String(vehicle.id)));

  const allAssets = [
    ...(cranes ?? []).map((item: any) => ({
      key: `crane:${item.id}`,
      label: `${item.name || "Crane"}${item.capacity ? ` • ${item.capacity}` : ""}`,
      assetType: "crane" as const,
      asset: item,
    })),
    ...(vehicles ?? []).map((item: any) => ({
      key: `vehicle:${item.id}`,
      label: `${item.name || "Vehicle"}${item.vehicle_type ? ` • ${item.vehicle_type}` : ""}`,
      assetType: "vehicle" as const,
      asset: item,
    })),
  ];

  let selectedAsset: any | null = null;
  let selectedAssetType: AssetType = null;

  if (assetParam) {
    const found = allAssets.find((item) => item.key === assetParam);
    if (found) {
      selectedAsset = found.asset;
      selectedAssetType = found.assetType;
    }
  }

  if (!selectedAsset) {
    if (freeCranes[0]) {
      selectedAsset = freeCranes[0];
      selectedAssetType = "crane";
    } else if (freeVehicles[0]) {
      selectedAsset = freeVehicles[0];
      selectedAssetType = "vehicle";
    } else if ((cranes ?? [])[0]) {
      selectedAsset = cranes?.[0];
      selectedAssetType = "crane";
    } else if ((vehicles ?? [])[0]) {
      selectedAsset = vehicles?.[0];
      selectedAssetType = "vehicle";
    }
  }

  const fallbackCards: SocialCard[] = [
    availabilityPost({
      tone,
      days,
      freeCrane: freeCranes[0] ?? null,
      freeVehicle: freeVehicles[0] ?? null,
    }),
    assetSpotlightPost({
      tone,
      asset: selectedAsset,
      assetType: selectedAssetType,
    }),
    servicesPost({ tone }),
    shortNoticePost({
      tone,
      asset: selectedAsset,
      assetType: selectedAssetType,
    }),
  ];

  const requestedKeys: Array<SocialCard["key"]> =
    mode === "all"
      ? ["availability", "asset", "services", "short_notice"]
      : [mode];

  let aiCards: SocialCard[] | null = null;

  if (shouldUseAI) {
    try {
      aiCards = await generateAiCards({
        tone,
        days,
        windowStart,
        windowEnd,
        freeCraneCount: freeCranes.length,
        freeVehicleCount: freeVehicles.length,
        freeCrane: freeCranes[0] ?? null,
        freeVehicle: freeVehicles[0] ?? null,
        selectedAsset,
        selectedAssetType,
        requestedKeys,
      });
    } catch {
      aiCards = null;
    }
  }

  const cards = mergeCards(fallbackCards, aiCards, requestedKeys);
  const generationMode = providerLabel(cards, shouldUseAI);

  return (
    <ClientShell>
      <div style={{ width: "min(1280px, 95vw)", margin: "0 auto" }}>
        <div style={topBar}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>Social Media Content Studio</h1>
            <p style={{ marginTop: 6, opacity: 0.8 }}>
              Generate ready-to-post social captions from your fleet and current availability.
            </p>
          </div>

          <a href="/sales-hub" style={secondaryBtn}>
            ← Sales Hub
          </a>
        </div>

        {cranesError ? <div style={errorCard}>{cranesError.message}</div> : null}
        {vehiclesError ? <div style={errorCard}>{vehiclesError.message}</div> : null}
        {jobsError ? <div style={errorCard}>{jobsError.message}</div> : null}
        {transportError ? <div style={errorCard}>{transportError.message}</div> : null}

        {shouldUseAI ? (
          <div
            style={
              generationMode === "AI" || generationMode === "Mixed"
                ? successCard
                : warningCard
            }
          >
            Generation mode: <strong>{generationMode}</strong>
            {generationMode === "Fallback"
              ? " — AI was unavailable, so the built-in fallback copy was used."
              : generationMode === "Mixed"
              ? " — some posts used AI and some used fallback copy."
              : " — posts generated using AI."}
          </div>
        ) : null}

        <div style={statsGrid}>
          <StatCard label="Free cranes" value={String(freeCranes.length)} />
          <StatCard label="Free vehicles" value={String(freeVehicles.length)} />
          <StatCard label="Window" value={`${fmtDate(windowStart)} → ${fmtDate(windowEnd)}`} />
          <StatCard label="Tone" value={titleCase(tone)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/social-media-content" style={filterGrid}>
            <input type="hidden" name="generate" value="yes" />

            <div>
              <label style={labelStyle}>Post type</label>
              <select name="mode" defaultValue={mode} style={inputStyle}>
                <option value="all">All post types</option>
                <option value="availability">Availability only</option>
                <option value="asset">Asset spotlight only</option>
                <option value="services">Full service promo only</option>
                <option value="short_notice">Short-notice only</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <select name="tone" defaultValue={tone} style={inputStyle}>
                <option value="professional">Professional</option>
                <option value="sales">Sales</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Availability window</label>
              <select name="days" defaultValue={String(days)} style={inputStyle}>
                <option value="1">Tomorrow only</option>
                <option value="3">Next 3 days</option>
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Asset for spotlight</label>
              <select
                name="asset"
                defaultValue={
                  selectedAsset && selectedAssetType
                    ? `${selectedAssetType === "crane" ? "crane" : "vehicle"}:${selectedAsset.id}`
                    : ""
                }
                style={inputStyle}
              >
                {allAssets.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "end",
                gap: 10,
                flexWrap: "wrap" as const,
              }}
            >
              <button type="submit" style={primaryBtn}>
                Generate
              </button>
              <a href="/sales-hub/social-media-content" style={secondaryBtn}>
                Reset
              </a>
            </div>
          </form>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>Ready-to-use posts</h2>

          <div style={{ display: "grid", gap: 14 }}>
            {cards.map((card) => {
              const fullText = `${card.body}\n\n${card.hashtags}`;

              return (
                <div key={card.key} style={postCard}>
                  <div style={postHeader}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900 }}>{card.title}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.74 }}>
                        Suggested image angle: {card.imageTip}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap" as const,
                      }}
                    >
                      <CopyTextButton text={fullText} label="Copy full post" />
                      <CopyTextButton text={card.body} label="Copy caption only" />
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div style={miniLabel}>Caption</div>
                    <textarea readOnly value={card.body} style={textareaStyle} />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={miniLabel}>Hashtags</div>
                    <div style={hashBox}>{card.hashtags}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h2 style={sectionTitle}>How to use it</h2>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={tipRow}>1. Use availability posts when a crane or vehicle is free soon.</div>
            <div style={tipRow}>2. Use asset spotlight posts when you want to push one key unit.</div>
            <div style={tipRow}>3. Use full service promo posts to remind people you cover more than one part of the job.</div>
            <div style={tipRow}>4. Use short-notice posts when you want a more urgent sales angle.</div>
          </div>
        </section>
      </div>
    </ClientShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.68, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

const topBar: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap" as const,
  marginBottom: 16,
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const statCard: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const panelStyle: CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box" as const,
};

const postCard: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const postHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap" as const,
};

const sectionTitle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const miniLabel: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
  marginBottom: 6,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 210,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box" as const,
  resize: "vertical" as const,
  whiteSpace: "pre-wrap" as const,
};

const hashBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const primaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const successCard: CSSProperties = {
  background: "rgba(0,160,80,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(0,160,80,0.18)",
  marginBottom: 12,
};

const warningCard: CSSProperties = {
  background: "rgba(180,120,0,0.14)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,120,0,0.18)",
  marginBottom: 12,
};

const errorCard: CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const tipRow: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 600,
};
