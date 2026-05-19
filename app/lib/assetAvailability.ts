export type AssetType = "crane" | "vehicle";

export type AssetAvailabilityStatus =
  | "maintenance"
  | "mot"
  | "service"
  | "inspection"
  | "repair"
  | "breakdown"
  | "unavailable"
  | "other";

export type AssetAvailabilityRow = {
  id: string;
  asset_type: AssetType;
  asset_id: string;
  start_date: string;
  end_date: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: AssetAvailabilityStatus | string;
  notes?: string | null;
  blocks_assignment?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const ASSET_AVAILABILITY_STATUS_OPTIONS: Array<{
  value: AssetAvailabilityStatus;
  label: string;
}> = [
  { value: "maintenance", label: "Maintenance" },
  { value: "mot", label: "MOT" },
  { value: "service", label: "Service" },
  { value: "inspection", label: "Inspection" },
  { value: "repair", label: "Repair" },
  { value: "breakdown", label: "Breakdown" },
  { value: "unavailable", label: "Unavailable" },
  { value: "other", label: "Other" },
];

export function assetAvailabilityStatusLabel(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  const found = ASSET_AVAILABILITY_STATUS_OPTIONS.find((item) => item.value === raw);
  if (found) return found.label;
  if (!raw) return "Unavailable";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export function normaliseAssetAvailabilityRow(row: any): AssetAvailabilityRow {
  const startDate = clean(row?.start_date) ?? "";
  const endDate = clean(row?.end_date) ?? startDate;
  return {
    id: String(row?.id ?? ""),
    asset_type: String(row?.asset_type ?? "") === "vehicle" ? "vehicle" : "crane",
    asset_id: String(row?.asset_id ?? ""),
    start_date: startDate,
    end_date: endDate,
    start_time: clean(row?.start_time),
    end_time: clean(row?.end_time),
    status: clean(row?.status) ?? "maintenance",
    notes: clean(row?.notes),
    blocks_assignment: row?.blocks_assignment !== false,
    created_at: clean(row?.created_at),
    updated_at: clean(row?.updated_at),
  };
}

export function assetAvailabilityOverlapsDay(entry: AssetAvailabilityRow, dayIso: string) {
  const start = clean(entry.start_date);
  const end = clean(entry.end_date) ?? start;
  return Boolean(start && end && start <= dayIso && end >= dayIso);
}

export function assetAvailabilityOverlapsRange(
  entry: AssetAvailabilityRow,
  rangeStart: string,
  rangeEnd: string
) {
  const start = clean(entry.start_date);
  const end = clean(entry.end_date) ?? start;
  return Boolean(start && end && start <= rangeEnd && end >= rangeStart);
}

export function formatAssetAvailabilityDate(entry: AssetAvailabilityRow) {
  const start = clean(entry.start_date) ?? "";
  const end = clean(entry.end_date) ?? start;
  const dateText = start && end && start !== end ? `${start} to ${end}` : start || "No date";
  const startTime = clean(entry.start_time);
  const endTime = clean(entry.end_time);
  const timeText = startTime && endTime ? ` ${startTime}-${endTime}` : "";
  return `${dateText}${timeText}`;
}

export async function getAssetAvailabilityForAsset(
  supabase: any,
  assetType: AssetType,
  assetId: string
): Promise<AssetAvailabilityRow[]> {
  const id = clean(assetId);
  if (!id) return [];

  const { data, error } = await supabase
    .from("asset_availability")
    .select("id, asset_type, asset_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
    .eq("asset_type", assetType)
    .eq("asset_id", id)
    .order("start_date", { ascending: false });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("asset_availability") || message.includes("does not exist") || message.includes("schema cache")) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map(normaliseAssetAvailabilityRow);
}

export async function getAssetAvailabilityForRange(
  supabase: any,
  assetType: AssetType,
  rangeStart: string,
  rangeEnd: string
): Promise<AssetAvailabilityRow[]> {
  const start = clean(rangeStart);
  const end = clean(rangeEnd) ?? start;
  if (!start || !end) return [];

  const { data, error } = await supabase
    .from("asset_availability")
    .select("id, asset_type, asset_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
    .eq("asset_type", assetType)
    .lte("start_date", end)
    .or(`end_date.gte.${start},end_date.is.null`)
    .order("start_date", { ascending: true });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("asset_availability") || message.includes("does not exist") || message.includes("schema cache")) {
      return [];
    }
    throw error;
  }

  return (data ?? [])
    .map(normaliseAssetAvailabilityRow)
    .filter((entry) => assetAvailabilityOverlapsRange(entry, start, end));
}


export async function getAssetAvailabilityConflict(
  supabase: any,
  input: {
    assetType: AssetType;
    assetId: string | null | undefined;
    startDate: string | null | undefined;
    endDate?: string | null | undefined;
  }
): Promise<AssetAvailabilityRow | null> {
  const assetType = input.assetType;
  const assetId = clean(input.assetId);
  const startDate = clean(input.startDate);
  const endDate = clean(input.endDate) ?? startDate;

  if (!assetId || !startDate || !endDate) return null;

  const { data, error } = await supabase
    .from("asset_availability")
    .select("id, asset_type, asset_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment, created_at, updated_at")
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .eq("blocks_assignment", true)
    .lte("start_date", endDate)
    .or(`end_date.gte.${startDate},end_date.is.null`)
    .order("start_date", { ascending: true })
    .limit(1);

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("asset_availability") || message.includes("does not exist") || message.includes("schema cache")) {
      return null;
    }
    throw error;
  }

  const row = (data ?? [])[0];
  return row ? normaliseAssetAvailabilityRow(row) : null;
}

export async function assertAssetAvailable(
  supabase: any,
  input: {
    assetType: AssetType;
    assetId: string | null | undefined;
    startDate: string | null | undefined;
    endDate?: string | null | undefined;
  }
) {
  const conflict = await getAssetAvailabilityConflict(supabase, input);
  if (!conflict) return;

  const assetLabel = input.assetType === "vehicle" ? "vehicle" : "crane";
  const label = assetAvailabilityStatusLabel(conflict.status);
  const dateText = formatAssetAvailabilityDate(conflict);
  const notes = clean(conflict.notes);

  throw new Error(
    `${assetLabel.charAt(0).toUpperCase()}${assetLabel.slice(1)} is not available: ${label} booked for ${dateText}${notes ? `. ${notes}` : ""}`
  );
}
