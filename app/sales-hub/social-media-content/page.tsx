import ClientShell from "../../ClientShell";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import CopyTextButton from "./CopyTextButton";

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

function titleCase(input: string) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getToneValue(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value;
  const safe = String(v ?? "professional").toLowerCase();
  if (safe === "sales" || safe === "friendly") return safe;
  return "professional";
}

function getModeValue(value: string | string[] | undefined) {
  const v = Array.isArray(value) ? value[0] : value;
  const safe = String(v ?? "all").toLowerCase();
  if (safe === "availability" || safe === "asset" || safe === "services" || safe === "short_notice") {
    return safe;
  }
  return "all";
}

function getDaysValue(value: string | string[] | undefined) {
  const v = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(14, v));
}

function hashtagsForPost(type: "availability" | "asset" | "services" | "short_notice", assetType?: "crane" | "vehicle") {
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
  tone: string;
  days: number;
  freeCrane: any | null;
  freeVehicle: any | null;
}) {
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
    title: "Availability Post",
    body,
    hashtags: hashtagsForPost("availability"),
    imageTip: "Use a clean yard or on-site photo of the available crane or vehicle.",
  };
}

function assetSpotlightPost(args: {
  tone: string;
  asset: any | null;
  assetType: "crane" | "vehicle" | null;
}) {
  if (!args.asset || !args.assetType) {
    return {
      title: "Asset Spotlight",
      body:
        "Select a crane or vehicle above to generate an asset spotlight post.",
      hashtags: hashtagsForPost("asset"),
      imageTip: "Use a strong photo of the selected asset on a clean site or in the yard.",
    };
  }

  const assetName = clean(args.asset.name) || (args.assetType === "crane" ? "our crane" : "our vehicle");
  const detailBits = [
    args.asset.capacity ? args.asset.capacity : "",
    args.asset.vehicle_type ? args.asset.vehicle_type : "",
    args.asset.reg_number ? `Reg ${args.asset.reg_number}` : "",
  ].filter(Boolean);

  let intro = `Fleet spotlight: ${assetName}.`;
  if (args.tone === "sales") intro = `Available from the AnnS Crane Hire fleet: ${assetName}.`;
  if (args.tone === "friendly") intro = `A quick spotlight on ${assetName} from the AnnS Crane Hire fleet.`;

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
    title: "Asset Spotlight",
    body,
    hashtags: hashtagsForPost("asset", args.assetType),
    imageTip: "Use a strong branded shot of the selected asset working on site.",
  };
}

function servicesPost(args: { tone: string }) {
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
    title: "Full Service Promo",
    body,
    hashtags: hashtagsForPost("services"),
    imageTip: "Use a collage or photo showing crane + transport together.",
  };
}

function shortNoticePost(args: {
  tone: string;
  asset: any | null;
  assetType: "crane" | "vehicle" | null;
}) {
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
    title: "Short-Notice / Rescue Style Post",
    body,
    hashtags: hashtagsForPost("short_notice", args.assetType ?? undefined),
    imageTip: "Use a live working photo and keep the caption direct.",
  };
}

type SearchParams = {
  tone?: string | string[];
  mode?: string | string[];
  days?: string | string[];
  asset?: string | string[];
};

export default async function SocialMediaContentPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createSupabaseServerClient();

  const tone = getToneValue(searchParams?.tone);
  const mode = getModeValue(searchParams?.mode);
  const days = getDaysValue(searchParams?.days);
  const assetParam = String(Array.isArray(searchParams?.asset) ? searchParams?.asset[0] : searchParams?.asset ?? "");

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
  let selectedAssetType: "crane" | "vehicle" | null = null;

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

  const cards = [
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
  ].filter((card, index) => {
    if (mode === "all") return true;
    if (mode === "availability") return index === 0;
    if (mode === "asset") return index === 1;
    if (mode === "services") return index === 2;
    if (mode === "short_notice") return index === 3;
    return true;
  });

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

        <div style={statsGrid}>
          <StatCard label="Free cranes" value={String(freeCranes.length)} />
          <StatCard label="Free vehicles" value={String(freeVehicles.length)} />
          <StatCard label="Window" value={`${fmtDate(windowStart)} → ${fmtDate(windowEnd)}`} />
          <StatCard label="Tone" value={titleCase(tone)} />
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <form method="get" action="/sales-hub/social-media-content" style={filterGrid}>
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

            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
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
                <div key={card.title} style={postCard}>
                  <div style={postHeader}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900 }}>{card.title}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.74 }}>
                        Suggested image angle: {card.imageTip}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

const topBar: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const statCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 16,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)",
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.4)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
};

const filterGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 6,
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.85)",
  boxSizing: "border-box",
};

const postCard: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
};

const postHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const miniLabel: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  fontWeight: 800,
  marginBottom: 6,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 210,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.15)",
  outline: "none",
  fontSize: 15,
  background: "rgba(255,255,255,0.9)",
  boxSizing: "border-box",
  resize: "vertical",
  whiteSpace: "pre-wrap",
};

const hashBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 700,
};

const primaryBtn: React.CSSProperties = {
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

const secondaryBtn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.82)",
  color: "#111",
  fontWeight: 800,
  textDecoration: "none",
  border: "1px solid rgba(0,0,0,0.10)",
};

const errorCard: React.CSSProperties = {
  background: "rgba(180,0,0,0.12)",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(180,0,0,0.18)",
  marginBottom: 12,
};

const tipRow: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  fontWeight: 600,
};
