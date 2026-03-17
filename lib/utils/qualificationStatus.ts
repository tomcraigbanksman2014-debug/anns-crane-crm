export type QualificationStatus = "expired" | "expiring" | "valid" | "none";

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function getQualificationStatus(
  expiryDate?: string | null,
  windowDays = 30
): QualificationStatus {
  const expiry = String(expiryDate ?? "").trim();
  if (!expiry) return "none";

  const today = new Date();
  const todayIso = toIsoDate(today);

  const soon = new Date(today);
  soon.setDate(soon.getDate() + windowDays);
  const soonIso = toIsoDate(soon);

  if (expiry < todayIso) return "expired";
  if (expiry <= soonIso) return "expiring";
  return "valid";
}

export function getQualificationSummary(
  rows: Array<{ expiry_date?: string | null }>,
  windowDays = 30
) {
  let expired = 0;
  let expiring = 0;
  let valid = 0;
  let none = 0;

  for (const row of rows) {
    const status = getQualificationStatus(row.expiry_date, windowDays);

    if (status === "expired") expired++;
    else if (status === "expiring") expiring++;
    else if (status === "valid") valid++;
    else none++;
  }

  return {
    total: rows.length,
    expired,
    expiring,
    valid,
    none,
  };
}

export function compareQualificationExpiryAsc(
  a: { expiry_date?: string | null },
  b: { expiry_date?: string | null }
) {
  const aExpiry = String(a.expiry_date ?? "9999-12-31");
  const bExpiry = String(b.expiry_date ?? "9999-12-31");
  return aExpiry.localeCompare(bExpiry);
}
