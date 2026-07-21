export const SHAUN_DIARY_TYPES = [
  { value: "site_visit", label: "Site visit" },
  { value: "ap_work", label: "AP work" },
  { value: "crane_operation", label: "Crane operation" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "office", label: "Office" },
  { value: "personal", label: "Personal" },
  { value: "unavailable", label: "Unavailable" },
  { value: "other", label: "Other" },
] as const;

export type ShaunDiaryEntry = {
  id: string;
  title: string;
  entry_type: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string | null;
  notes?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  reminder_minutes?: number | null;
  linked_job_id?: string | null;
  linked_transport_job_id?: string | null;
  linked_lift_plan_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function diaryTypeLabel(value: string) {
  return SHAUN_DIARY_TYPES.find((item) => item.value === value)?.label || "Other";
}

export function cleanDiaryPayload(input: any) {
  const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
  const title = clean(input?.title, 180);
  const entryType = clean(input?.entry_type, 40) || "other";
  const startAt = clean(input?.start_at, 80);
  const endAt = clean(input?.end_at, 80);
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (!title) throw new Error("A diary title is required.");
  if (!startAt || Number.isNaN(start.getTime())) throw new Error("A valid start date and time is required.");
  if (!endAt || Number.isNaN(end.getTime())) throw new Error("A valid end date and time is required.");
  if (end <= start) throw new Error("The end time must be after the start time.");
  if (!SHAUN_DIARY_TYPES.some((item) => item.value === entryType)) throw new Error("Invalid diary type.");

  const reminderRaw = input?.reminder_minutes;
  const reminder = reminderRaw === "" || reminderRaw == null ? null : Number(reminderRaw);

  return {
    title,
    entry_type: entryType,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: Boolean(input?.all_day),
    location: clean(input?.location, 500) || null,
    notes: clean(input?.notes, 5000) || null,
    contact_name: clean(input?.contact_name, 180) || null,
    contact_phone: clean(input?.contact_phone, 80) || null,
    reminder_minutes: Number.isFinite(reminder) ? Math.max(0, Math.min(10080, reminder as number)) : null,
    linked_job_id: clean(input?.linked_job_id, 60) || null,
    linked_transport_job_id: clean(input?.linked_transport_job_id, 60) || null,
    linked_lift_plan_id: clean(input?.linked_lift_plan_id, 60) || null,
    updated_at: new Date().toISOString(),
  };
}

export function formatDiarySummary(entries: ShaunDiaryEntry[], heading: string) {
  const lines = entries.map((entry) => {
    const start = new Date(entry.start_at);
    const end = new Date(entry.end_at);
    const date = start.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
    const time = entry.all_day
      ? "All day"
      : `${start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    const location = entry.location ? ` — ${entry.location}` : "";
    return `${date} ${time} | ${entry.title}${location}`;
  });
  return [heading, "", ...(lines.length ? lines : ["No diary entries scheduled."]), "", "AnnS Crane Hire"].join("\n");
}
