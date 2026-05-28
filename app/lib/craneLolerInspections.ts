export type CraneLolerInspectionStatus =
  | "pending"
  | "planned"
  | "in_progress"
  | "passed"
  | "failed"
  | "deferred";

export type CraneLolerInspectionPlannerEntry = {
  id: string;
  run_id: string;
  crane_id: string;
  title: string;
  start_date: string;
  end_date: string;
  planned_date?: string | null;
  status: CraneLolerInspectionStatus | string;
  blocks_assignment?: boolean | null;
  notes?: string | null;
  inspector_company?: string | null;
  inspector_name?: string | null;
  certificate_reference?: string | null;
  next_loler_due_on?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  planned: "Planned",
  in_progress: "In progress",
  passed: "Passed / done",
  failed: "Failed / action required",
  deferred: "Deferred",
};

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isMissingLolerTable(error: any) {
  const message = String(error?.message ?? "").toLowerCase();
  return (
    message.includes("crane_loler_inspection") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

export function normaliseLolerStatus(value: unknown): CraneLolerInspectionStatus {
  const raw = String(value ?? "pending").trim().toLowerCase();
  if (
    raw === "pending" ||
    raw === "planned" ||
    raw === "in_progress" ||
    raw === "passed" ||
    raw === "failed" ||
    raw === "deferred"
  ) {
    return raw;
  }
  return "pending";
}

export function lolerStatusLabel(value: unknown) {
  const key = normaliseLolerStatus(value);
  return STATUS_LABELS[key] ?? "Pending";
}

export function lolerItemOverlapsDay(entry: CraneLolerInspectionPlannerEntry, dayIso: string) {
  const planned = clean(entry.planned_date);
  if (planned) return planned === dayIso;

  const start = clean(entry.start_date);
  const end = clean(entry.end_date) ?? start;
  return Boolean(start && end && start <= dayIso && end >= dayIso);
}

export function lolerItemBlocksAssignment(entry: CraneLolerInspectionPlannerEntry) {
  const status = normaliseLolerStatus(entry.status);
  if (status === "passed" || status === "deferred") return false;
  return entry.blocks_assignment === true;
}

export async function getCraneLolerInspectionItemsForRange(
  supabase: any,
  rangeStart: string,
  rangeEnd: string
): Promise<CraneLolerInspectionPlannerEntry[]> {
  const start = clean(rangeStart);
  const end = clean(rangeEnd) ?? start;
  if (!start || !end) return [];

  const { data: runs, error: runsError } = await supabase
    .from("crane_loler_inspection_runs")
    .select("id, title, start_date, end_date, inspector_company, inspector_name, notes, archived")
    .eq("archived", false)
    .lte("start_date", end)
    .gte("end_date", start)
    .order("start_date", { ascending: true });

  if (runsError) {
    if (isMissingLolerTable(runsError)) return [];
    throw runsError;
  }

  const runRows = runs ?? [];
  const runIds = runRows.map((row: any) => String(row?.id ?? "")).filter(Boolean);
  if (runIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("crane_loler_inspection_items")
    .select("id, run_id, crane_id, planned_date, status, blocks_assignment, notes, certificate_reference, next_loler_due_on")
    .in("run_id", runIds)
    .order("planned_date", { ascending: true });

  if (itemsError) {
    if (isMissingLolerTable(itemsError)) return [];
    throw itemsError;
  }

  const runById = new Map<string, any>(runRows.map((row: any) => [String(row.id), row]));

  return (items ?? [])
    .map((item: any) => {
      const run: any = runById.get(String(item?.run_id ?? ""));
      if (!run) return null;

      return {
        id: String(item?.id ?? ""),
        run_id: String(item?.run_id ?? ""),
        crane_id: String(item?.crane_id ?? ""),
        title: clean(run?.title) ?? "LOLER inspection",
        start_date: clean(run?.start_date) ?? "",
        end_date: clean(run?.end_date) ?? clean(run?.start_date) ?? "",
        planned_date: clean(item?.planned_date),
        status: normaliseLolerStatus(item?.status),
        blocks_assignment: item?.blocks_assignment === true,
        notes: clean(item?.notes),
        inspector_company: clean(run?.inspector_company),
        inspector_name: clean(run?.inspector_name),
        certificate_reference: clean(item?.certificate_reference),
        next_loler_due_on: clean(item?.next_loler_due_on),
      } satisfies CraneLolerInspectionPlannerEntry;
    })
    .filter(Boolean)
    .filter((entry: any) => {
      const planned = clean(entry.planned_date);
      if (planned) return planned >= start && planned <= end;
      return clean(entry.start_date)! <= end && clean(entry.end_date)! >= start;
    }) as CraneLolerInspectionPlannerEntry[];
}

export async function getBlockingCraneLolerInspection(
  supabase: any,
  input: {
    craneId: string | null | undefined;
    startDate: string | null | undefined;
    endDate?: string | null | undefined;
  }
): Promise<CraneLolerInspectionPlannerEntry | null> {
  const craneId = clean(input.craneId);
  const startDate = clean(input.startDate);
  const endDate = clean(input.endDate) ?? startDate;
  if (!craneId || !startDate || !endDate) return null;

  const entries = await getCraneLolerInspectionItemsForRange(supabase, startDate, endDate);
  return (
    entries.find((entry) => {
      if (String(entry.crane_id) !== craneId) return false;
      if (!lolerItemBlocksAssignment(entry)) return false;
      const planned = clean(entry.planned_date);
      if (planned) return planned >= startDate && planned <= endDate;
      return clean(entry.start_date)! <= endDate && clean(entry.end_date)! >= startDate;
    }) ?? null
  );
}

export async function assertCraneNotBlockedByLoler(
  supabase: any,
  input: {
    craneId: string | null | undefined;
    startDate: string | null | undefined;
    endDate?: string | null | undefined;
  }
) {
  const conflict = await getBlockingCraneLolerInspection(supabase, input);
  if (!conflict) return;

  const dateText = conflict.planned_date || `${conflict.start_date} to ${conflict.end_date}`;
  throw new Error(
    `Crane is blocked for LOLER inspection on ${dateText}. Mark the LOLER item as not blocking, deferred, or completed before assigning work.`
  );
}
