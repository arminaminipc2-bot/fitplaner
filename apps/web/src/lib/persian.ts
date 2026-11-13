/**
 * Persian calendar arithmetic. The week starts on Saturday (شنبه) and the
 * displayed calendar is Jalali; both are handled here so components never
 * re-derive them.
 */

export const FA_WEEKDAY_LONG = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
] as const;

/** Single-letter column headings, same Saturday-first order. */
export const FA_WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

/** JS getDay() is Sunday-first; map it onto the Saturday-first Persian week. */
export function persianWeekIndex(d: Date): number {
  return (d.getDay() + 1) % 7;
}

export const startOfDay = (d: Date): Date => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const addDays = (d: Date, days: number): Date => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

export const sameDay = (a: Date, b: Date): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime();

/** The seven Date objects of the Persian week that contains `d`. */
export function weekOf(d: Date): Date[] {
  const s = startOfDay(d);
  const start = addDays(s, -persianWeekIndex(s));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** `weeks` trailing Persian weeks, oldest first, each a 7-day array. */
export function weekGrid(end: Date, weeks: number): Date[][] {
  const thisWeek = weekOf(end);
  const lastSaturday = thisWeek[0];
  return Array.from({ length: weeks }, (_, w) => {
    const rowStart = addDays(lastSaturday, -(weeks - 1 - w) * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(rowStart, i));
  });
}

const jalaliMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" });
const jalaliYear = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" });

/** «آبان ۱۴۰۵» */
export function faMonthYear(d: Date): string {
  return `${jalaliMonth.format(d)} ${jalaliYear.format(d)}`;
}
