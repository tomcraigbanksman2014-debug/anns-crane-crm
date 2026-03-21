export type TimeOption = {
  value: string;
  label: string;
};

export function buildQuarterHourOptions(): TimeOption[] {
  const options: TimeOption[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      const value = `${hh}:${mm}`;
      options.push({
        value,
        label: value,
      });
    }
  }

  return options;
}

export function normaliseTimeValue(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
