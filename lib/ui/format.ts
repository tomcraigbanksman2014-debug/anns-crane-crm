export function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

export function fmtMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

export function prettyJobStatus(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();

  if (v === "draft") return "Draft";
  if (v === "planned") return "Planned";
  if (v === "confirmed") return "Confirmed";
  if (v === "in_progress") return "In Progress";
  if (v === "completed") return "Completed";
  if (v === "cancelled") return "Cancelled";

  return value ?? "—";
}

export function prettyTransportJobType(value: string | null | undefined) {
  const v = String(value ?? "").toLowerCase();

  if (v === "crane_support") return "Crane Support";
  if (v === "haulage") return "Haulage";
  if (v === "delivery") return "Delivery";
  if (v === "collection") return "Collection";
  if (v === "ballast") return "Ballast";

  return value ?? "—";
}

export function hasText(value: any) {
  return String(value ?? "").trim().length > 0;
}
