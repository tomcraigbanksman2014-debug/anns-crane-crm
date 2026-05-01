import { getEnglandWalesBankHolidays } from "./bankHolidays";

export function normaliseDateOnly(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 10);
}

function parseDateOnly(value: string) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateFromLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bankHolidayDateSetForRange(start: Date, end: Date) {
  const dates = new Set<string>();
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  for (let year = startYear; year <= endYear; year += 1) {
    getEnglandWalesBankHolidays(year).forEach((holiday) => {
      dates.add(holiday.date);
    });
  }

  return dates;
}

export function isEnglandWalesBankHolidayDate(value: string | null | undefined) {
  const text = normaliseDateOnly(value);
  if (!text) return false;

  const d = parseDateOnly(text);
  if (!d) return false;

  return getEnglandWalesBankHolidays(d.getFullYear()).some((holiday) => holiday.date === text);
}

export function countWorkingDaysInclusive(startDate: string | null | undefined, endDate: string | null | undefined) {
  const startText = normaliseDateOnly(startDate);
  const endText = normaliseDateOnly(endDate) ?? startText;

  if (!startText || !endText) return 0;

  const start = parseDateOnly(startText);
  const end = parseDateOnly(endText);

  if (!start || !end || end < start) return 0;

  const bankHolidayDates = bankHolidayDateSetForRange(start, end);
  let total = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const day = cursor.getDay();
    const iso = isoDateFromLocalDate(cursor);
    if (day !== 0 && day !== 6 && !bankHolidayDates.has(iso)) {
      total += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}
