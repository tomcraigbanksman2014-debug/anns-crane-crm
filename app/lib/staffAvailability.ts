export type StaffAvailabilityStatus =
  | "available"
  | "holiday"
  | "training"
  | "sick"
  | "day_off"
  | "unavailable"
  | "other";

export type OperatorAvailabilityRow = {
  id: string;
  operator_id: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  notes?: string | null;
  blocks_assignment?: boolean | null;
};

export type OperatorAvailabilityCheckInput = {
  operatorId: string | null | undefined;
  startDate: string | null | undefined;
  endDate?: string | null | undefined;
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
  ignoreAvailabilityId?: string | null | undefined;
};

export type OperatorAvailabilityConflict = {
  row: OperatorAvailabilityRow;
  message: string;
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function parseMinutes(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function statusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Unavailable";
  if (raw === "day_off") return "Day off";
  if (raw === "available") return "Available";
  if (raw === "holiday") return "Holiday";
  if (raw === "training") return "Training";
  if (raw === "sick") return "Sick";
  if (raw === "unavailable") return "Unavailable";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function timeRangesOverlap(
  startA: string | null | undefined,
  endA: string | null | undefined,
  startB: string | null | undefined,
  endB: string | null | undefined
) {
  const startMinutesA = parseMinutes(startA);
  const endMinutesA = parseMinutes(endA);
  const startMinutesB = parseMinutes(startB);
  const endMinutesB = parseMinutes(endB);

  if (
    startMinutesA === null ||
    endMinutesA === null ||
    startMinutesB === null ||
    endMinutesB === null
  ) {
    return true;
  }

  return startMinutesA < endMinutesB && endMinutesA > startMinutesB;
}

function rowBlocksAssignment(row: OperatorAvailabilityRow) {
  return Boolean(row.blocks_assignment);
}

function conflictMessage(row: OperatorAvailabilityRow) {
  const label = statusLabel(row.status);
  const dateText = row.start_date === row.end_date ? row.start_date : `${row.start_date} to ${row.end_date}`;
  const timeText = clean(row.start_time) && clean(row.end_time) ? ` (${row.start_time} to ${row.end_time})` : "";
  const notes = clean(row.notes);
  return notes
    ? `${label}: ${dateText}${timeText}. ${notes}`
    : `${label}: ${dateText}${timeText}.`;
}

export async function getOperatorAvailabilityConflict(
  supabase: any,
  input: OperatorAvailabilityCheckInput
): Promise<OperatorAvailabilityConflict | null> {
  const operatorId = clean(input.operatorId);
  const startDate = clean(input.startDate);
  const endDate = clean(input.endDate) ?? startDate;
  const ignoreAvailabilityId = clean(input.ignoreAvailabilityId);

  if (!operatorId || !startDate || !endDate) {
    return null;
  }

  let query = supabase
    .from("operator_availability")
    .select("id, operator_id, start_date, end_date, start_time, end_time, status, notes, blocks_assignment")
    .eq("operator_id", operatorId)
    .eq("blocks_assignment", true)
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (ignoreAvailabilityId) {
    query = query.neq("id", ignoreAvailabilityId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as OperatorAvailabilityRow[];
  const overlap = rows.find((row) => {
    if (!rowBlocksAssignment(row)) return false;
    if (!rangesOverlap(startDate, endDate, row.start_date, row.end_date)) return false;

    const singleDayAssignment = startDate === endDate;
    const singleDayAvailability = row.start_date === row.end_date;

    if (singleDayAssignment && singleDayAvailability && startDate === row.start_date) {
      return timeRangesOverlap(input.startTime, input.endTime, row.start_time, row.end_time);
    }

    return true;
  });

  if (!overlap) return null;

  return {
    row: overlap,
    message: conflictMessage(overlap),
  };
}

export async function assertOperatorAvailable(
  supabase: any,
  input: OperatorAvailabilityCheckInput
) {
  const conflict = await getOperatorAvailabilityConflict(supabase, input);
  if (!conflict) return;
  throw new Error(`Operator is not available for this period. ${conflict.message}`);
}

export function defaultBlocksAssignment(status: string | null | undefined) {
  const raw = String(status ?? "").trim().toLowerCase();
  if (raw === "available") return false;
  return true;
}
