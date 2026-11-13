/**
 * Persian-first formatting. Every number, date and unit label that reaches the
 * screen goes through here, so no Latin digit or Gregorian date leaks into the UI.
 */

const faNumberCache = new Map<string, Intl.NumberFormat>();

function faNumber(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = faNumberCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("fa-IR", opts);
    faNumberCache.set(key, f);
  }
  return f;
}

/** 1234.5 → «۱٬۲۳۴٫۵» */
export function faNum(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return faNumber({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** Bare integer without thousands grouping, e.g. ring percentages. */
export function faCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return faNumber({ useGrouping: false }).format(Math.round(value));
}

/** Signed difference: 1.2 → «+۱٫۲» , -0.8 → «−۰٫۸» */
export function faDelta(value: number, digits = 1): string {
  const abs = faNum(Math.abs(value), digits);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function faPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${faNum(value, digits)}٪`;
}

const asDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

/** «۱۴ آبان ۱۴۰۵» */
export function faDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(asDate(value));
}

/** «۱۴۰۵/۰۸/۱۴» — the numeric Jalali form used in tables and inputs */
export function faDateNumeric(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(asDate(value))
    .replace(/\//g, "/");
}

/** «پنج‌شنبه» */
export function faWeekday(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(asDate(value));
}

/** «پنج‌شنبه ۱۴ آبان» — compact header label */
export function faDayLabel(value: string | number | Date): string {
  return `${faWeekday(value)} ${new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "long",
  }).format(asDate(value))}`;
}

/** «۱۴» — the Jalali day number of a date, already in Persian digits. */
export function faJalaliDay(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric" }).format(asDate(value));
}

/** «۱۴:۳۰» */
export function faTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(
    asDate(value),
  );
}

const rtf = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });

/** «امروز» / «دیروز» / «۳ روز پیش» / «۲ ساعت پیش» */
export function faRelative(value: string | number | Date, now: Date = new Date()): string {
  const then = asDate(value);
  const seconds = (then.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return "همین حالا";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 604800) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 2592000) return rtf.format(Math.round(seconds / 604800), "week");
  if (abs < 31536000) return rtf.format(Math.round(seconds / 2592000), "month");
  return rtf.format(Math.round(seconds / 31536000), "year");
}

/** «۴۵ دقیقه» — Persian nouns stay singular after a number. */
export function faDuration(minutes: number): string {
  if (minutes < 60) return `${faNum(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${faNum(hours)} ساعت` : `${faNum(hours)} ساعت و ${faNum(rest)} دقیقه`;
}

/** Units spelled out in Persian; the Latin abbreviation never reaches the UI. */
export type UnitFa = "kcal" | "g" | "kg" | "cm" | "mm" | "ml" | "min" | "percent";
const UNIT_FA: Record<UnitFa, string> = {
  kcal: "کیلوکالری",
  g: "گرم",
  kg: "کیلوگرم",
  cm: "سانتی‌متر",
  mm: "میلی‌متر",
  ml: "میلی‌لیتر",
  min: "دقیقه",
  percent: "درصد",
};

export function faUnit(value: number | null | undefined, unit: UnitFa, digits = 0): string {
  return `${faNum(value, digits)} ${UNIT_FA[unit]}`;
}

/** Compact inline form used inside cards: «۲٬۴۰۰ ک‌کال» stays readable at 11px. */
const UNIT_SHORT: Record<UnitFa, string> = {
  kcal: "کیلوکالری",
  g: "گ",
  kg: "کگ",
  cm: "سانتی‌متر",
  mm: "م‌م",
  ml: "م‌ل",
  min: "دقیقه",
  percent: "٪",
};

export function faUnitShort(value: number | null | undefined, unit: UnitFa, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${faNum(value, digits)}${UNIT_SHORT[unit]}`;
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * A number typed by a Persian keyboard: Persian or Arabic-Indic digits, the Persian
 * decimal separator and the Persian thousands separator are all accepted, because
 * rejecting them would blame the user for typing correctly.
 */
export function parseFaNumber(raw: string): number | null {
  let s = raw.trim();
  for (let i = 0; i < 10; i += 1) {
    s = s.split(FA_DIGITS[i]).join(String(i));
    s = s.split(AR_DIGITS[i]).join(String(i));
  }
  s = s.replace(/٫/g, ".").replace(/[٬,]/g, "");
  if (s === "" || /[^0-9.]/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
