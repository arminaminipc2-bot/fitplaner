/**
 * Jalali ↔ Gregorian. `Intl` can only read a Persian date out of a `Date`, never
 * build one, so the calendar arithmetic lives here. Everything works on UTC
 * midnight — a Jalali day is a whole day, and letting a local-timezone shift
 * move it by one is the classic way these pickers break.
 */

export type JalaliParts = { jy: number; jm: number; jd: number };

const asciiJalali = new Intl.DateTimeFormat("en-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const JALALI_MONTH_NAMES = PERSIAN_MONTHS;

export function toJalaliParts(date: Date): JalaliParts {
  const parts = asciiJalali.formatToParts(date);
  const pick = (type: "year" | "month" | "day") => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { jy: pick("year"), jm: pick("month"), jd: pick("day") };
}

const utcDay = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** Farvardin 1 of a Persian year: March 20 or 21, checked rather than formula-derived. */
function nowruz(jy: number): number {
  const gregorianYear = jy + 621;
  for (let day = 14; day <= 25; day += 1) {
    const ms = utcDay(gregorianYear, 3, day);
    const p = toJalaliParts(new Date(ms));
    if (p.jy === jy && p.jm === 1 && p.jd === 1) return ms;
  }
  throw new Error(`Nowruz of ${jy} not found — the environment has no Persian calendar support.`);
}

/** Months 1–6 are 31 days, 7–11 are 30; the twelfth absorbs the leap day. */
const dayOfYear = (jm: number, jd: number) => (jm <= 6 ? (jm - 1) * 31 : jm === 7 ? 186 : 186 + (jm - 7) * 30) + jd;

export function fromJalali(jy: number, jm: number, jd: number): Date | null {
  if (!Number.isFinite(jy) || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  const ms = nowruz(jy) + (dayOfYear(jm, jd) - 1) * 86_400_000;
  const check = toJalaliParts(new Date(ms));
  // a 30-day Esfand asked for day 30 in a 29-day year lands in next Farvardin
  if (check.jy !== jy || check.jm !== jm || check.jd !== jd) return null;
  return new Date(ms);
}

/** The `YYYY-MM-DD` form the API's date fields expect. */
export const toApiDate = (date: Date): string => date.toISOString().slice(0, 10);

/** `2026-04-10T00:00:00.000Z` → «۱۳۹۵/۰۱/۲۱» */
export function jalaliNumeric(date: Date | string): string {
  const { jy, jm, jd } = toJalaliParts(typeof date === "string" ? new Date(date) : date);
  const fa = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${jy}/${fa.format(jm)}/${fa.format(jd)}`;
}

/** `YYYY-MM-DD` for the Tehran day that contains `date` — the key every rollup uses. */
export const tehranDayKey = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/**
 * Today in the Persian calendar, taken from the Tehran day rather than the
 * browser clock: at 01:00 in Tehran the local `Date` is still yesterday in UTC.
 */
export function todayJalali(): JalaliParts {
  const [y, m, d] = tehranDayKey().split("-").map(Number);
  return toJalaliParts(new Date(Date.UTC(y, m - 1, d)));
}
