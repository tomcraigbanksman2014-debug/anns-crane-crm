export type ValidityUnit = "days" | "months" | "years";

export function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addValidityToDate(
  baseDate: string | null | undefined,
  validityValue?: number | null,
  validityUnit?: string | null
) {
  const raw = cleanText(baseDate);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const amount = Number(validityValue ?? 0);
  const unit = cleanText(validityUnit).toLowerCase() as ValidityUnit;

  if (!amount || !unit) return null;

  const next = new Date(date);

  if (unit === "days") {
    next.setDate(next.getDate() + amount);
    return toIsoDate(next);
  }

  if (unit === "months") {
    next.setMonth(next.getMonth() + amount);
    return toIsoDate(next);
  }

  if (unit === "years") {
    next.setFullYear(next.getFullYear() + amount);
    return toIsoDate(next);
  }

  return null;
}

export function prettyValidity(validityValue?: number | null, validityUnit?: string | null) {
  const amount = Number(validityValue ?? 0);
  const unit = cleanText(validityUnit).toLowerCase();

  if (!amount || !unit) return "Manual expiry";

  const label =
    amount === 1
      ? unit.replace(/s$/, "")
      : unit;

  return `${amount} ${label}`;
}
