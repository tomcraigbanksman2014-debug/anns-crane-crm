export function normaliseDateOnly(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 10);
}

export function countWorkingDaysInclusive(startDate: string | null | undefined, endDate: string | null | undefined) {
  const startText = normaliseDateOnly(startDate);
  const endText = normaliseDateOnly(endDate) ?? startText;

  if (!startText || !endText) return 0;

  const start = new Date(`${startText}T00:00:00`);
  const end = new Date(`${endText}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let total = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}
