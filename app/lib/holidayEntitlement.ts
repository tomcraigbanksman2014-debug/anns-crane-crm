import { getEnglandWalesBankHolidays } from "./bankHolidays";
import { normaliseDateOnly } from "./workingDays";

export const DEFAULT_HOLIDAY_ENTITLEMENT_DAYS = 28;

export type HolidayEntitlementSummary = {
  entitlement_days: number;
  holiday_year_start: string;
  holiday_year_end: string;
  booked_holiday_days: number;
  bank_holiday_days: number;
  used_days: number;
  remaining_days: number;
  unpaid_days: number;
};

type HolidayEntryLike = {
  id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};

function parseDateOnly(value: string | null | undefined) {
  const text = normaliseDateOnly(value);
  if (!text) return null;
  const d = new Date(`${text}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDateFromLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function getHolidayYearForDate(value: string | null | undefined) {
  const base = parseDateOnly(value) ?? new Date();
  const year = base.getFullYear();
  const resetThisYear = new Date(`${year}-04-06T00:00:00`);
  const startYear = base >= resetThisYear ? year : year - 1;

  return {
    start: `${startYear}-04-06`,
    end: `${startYear + 1}-04-05`,
  };
}

export function countHolidayLeaveDaysInclusive(startDate: string | null | undefined, endDate: string | null | undefined) {
  const startText = normaliseDateOnly(startDate);
  const endText = normaliseDateOnly(endDate) ?? startText;
  const start = parseDateOnly(startText);
  const end = parseDateOnly(endText);

  if (!startText || !endText || !start || !end || end < start) return 0;

  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWeekday(cursor)) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function addWeekdayDatesToSet(target: Set<string>, startText: string | null | undefined, endText: string | null | undefined, minDate: string, maxDate: string) {
  const cleanStart = normaliseDateOnly(startText);
  const cleanEnd = normaliseDateOnly(endText) ?? cleanStart;
  if (!cleanStart || !cleanEnd) return;

  const clampedStartText = cleanStart < minDate ? minDate : cleanStart;
  const clampedEndText = cleanEnd > maxDate ? maxDate : cleanEnd;
  const start = parseDateOnly(clampedStartText);
  const end = parseDateOnly(clampedEndText);
  if (!start || !end || end < start) return;

  const cursor = new Date(start);
  while (cursor <= end) {
    if (isWeekday(cursor)) target.add(isoDateFromLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
}

function bankHolidayDatesForHolidayYear(yearStart: string, yearEnd: string) {
  const dates = new Set<string>();
  const startYear = Number(yearStart.slice(0, 4));
  const endYear = Number(yearEnd.slice(0, 4));

  for (let year = startYear; year <= endYear; year += 1) {
    getEnglandWalesBankHolidays(year).forEach((holiday) => {
      const holidayDate = normaliseDateOnly(holiday.date);
      const parsed = parseDateOnly(holidayDate);
      if (!holidayDate || !parsed) return;
      if (holidayDate < yearStart || holidayDate > yearEnd) return;
      if (!isWeekday(parsed)) return;
      dates.add(holidayDate);
    });
  }

  return dates;
}

export function buildHolidayEntitlementSummary(
  entries: HolidayEntryLike[],
  basisDate: string | null | undefined,
  entitlementDays = DEFAULT_HOLIDAY_ENTITLEMENT_DAYS
): HolidayEntitlementSummary {
  const holidayYear = getHolidayYearForDate(basisDate);
  const bookedDates = new Set<string>();

  entries
    .filter((entry) => String(entry.status ?? "").trim().toLowerCase() === "holiday")
    .forEach((entry) => {
      addWeekdayDatesToSet(bookedDates, entry.start_date, entry.end_date, holidayYear.start, holidayYear.end);
    });

  const bankHolidayDates = bankHolidayDatesForHolidayYear(holidayYear.start, holidayYear.end);
  const usedDates = new Set<string>([...bookedDates, ...bankHolidayDates]);
  const usedDays = usedDates.size;
  const remainingDays = Math.max(0, entitlementDays - usedDays);
  const unpaidDays = Math.max(0, usedDays - entitlementDays);

  return {
    entitlement_days: entitlementDays,
    holiday_year_start: holidayYear.start,
    holiday_year_end: holidayYear.end,
    booked_holiday_days: bookedDates.size,
    bank_holiday_days: bankHolidayDates.size,
    used_days: usedDays,
    remaining_days: remainingDays,
    unpaid_days: unpaidDays,
  };
}

export function holidayEntitlementWarning(summary: HolidayEntitlementSummary | null | undefined) {
  if (!summary || summary.unpaid_days <= 0) return null;
  return `This holiday booking takes this person ${summary.unpaid_days} day${summary.unpaid_days === 1 ? "" : "s"} over their ${summary.entitlement_days}-day holiday entitlement for ${summary.holiday_year_start} to ${summary.holiday_year_end}. The extra ${summary.unpaid_days} day${summary.unpaid_days === 1 ? "" : "s"} should be treated as unpaid unless approved otherwise.`;
}

export async function getPersonHolidayEntitlementSummary(
  supabase: any,
  person: { person_type?: string | null; operator_id?: string | null; staff_member_id?: string | null },
  basisDate: string | null | undefined,
  entitlementDays = DEFAULT_HOLIDAY_ENTITLEMENT_DAYS
): Promise<HolidayEntitlementSummary> {
  const holidayYear = getHolidayYearForDate(basisDate);
  const personType = String(person.person_type ?? (person.staff_member_id ? "office" : "operator")).trim().toLowerCase();
  const operatorId = String(person.operator_id ?? "").trim();
  const staffMemberId = String(person.staff_member_id ?? "").trim();

  let query = supabase
    .from("operator_availability")
    .select("id, operator_id, staff_member_id, person_type, start_date, end_date, status")
    .eq("status", "holiday")
    .lte("start_date", holidayYear.end)
    .or(`end_date.gte.${holidayYear.start},end_date.is.null`);

  if (personType === "office") {
    query = query.eq("staff_member_id", staffMemberId);
  } else {
    query = query.eq("operator_id", operatorId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return buildHolidayEntitlementSummary((data ?? []) as HolidayEntryLike[], basisDate, entitlementDays);
}
