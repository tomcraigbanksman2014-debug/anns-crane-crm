export type BankHoliday = {
  date: string;
  label: string;
};

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atMidnight(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return atMidnight(d);
}

function firstMondayOfMonth(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex, 1);
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() + 1);
  }
  return atMidnight(d);
}

function lastMondayOfMonth(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex + 1, 0);
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() - 1);
  }
  return atMidnight(d);
}

function substituteWeekday(date: Date) {
  const day = date.getDay();
  if (day === 0) return addDays(date, 1);
  if (day === 6) return addDays(date, 2);
  return atMidnight(date);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getEnglandWalesBankHolidays(year: number): BankHoliday[] {
  const holidays: BankHoliday[] = [];

  holidays.push({
    date: isoDate(substituteWeekday(new Date(year, 0, 1))),
    label: "New Year’s Day",
  });

  const easter = easterSunday(year);
  holidays.push({
    date: isoDate(addDays(easter, -2)),
    label: "Good Friday",
  });
  holidays.push({
    date: isoDate(addDays(easter, 1)),
    label: "Easter Monday",
  });

  holidays.push({
    date: isoDate(firstMondayOfMonth(year, 4)),
    label: "Early May bank holiday",
  });

  holidays.push({
    date: isoDate(lastMondayOfMonth(year, 4)),
    label: "Spring bank holiday",
  });

  holidays.push({
    date: isoDate(lastMondayOfMonth(year, 7)),
    label: "Summer bank holiday",
  });

  const christmasDay = new Date(year, 11, 25);
  const boxingDay = new Date(year, 11, 26);
  const christmasDayDow = christmasDay.getDay();
  const boxingDayDow = boxingDay.getDay();

  let christmasObserved = atMidnight(christmasDay);
  let boxingObserved = atMidnight(boxingDay);

  if (christmasDayDow === 6) {
    christmasObserved = addDays(christmasDay, 2);
    boxingObserved = addDays(boxingDay, 2);
  } else if (christmasDayDow === 0) {
    christmasObserved = addDays(christmasDay, 2);
    boxingObserved = addDays(boxingDay, 2);
  } else if (boxingDayDow === 6) {
    boxingObserved = addDays(boxingDay, 2);
  } else if (boxingDayDow === 0) {
    boxingObserved = addDays(boxingDay, 2);
  }

  holidays.push({
    date: isoDate(christmasObserved),
    label: christmasObserved.getTime() === atMidnight(christmasDay).getTime() ? "Christmas Day" : "Christmas Day (substitute day)",
  });
  holidays.push({
    date: isoDate(boxingObserved),
    label: boxingObserved.getTime() === atMidnight(boxingDay).getTime() ? "Boxing Day" : "Boxing Day (substitute day)",
  });

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
