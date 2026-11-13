/**
 * The product day is the Iranian day. Tehran has kept a fixed UTC+3:30 since
 * Iran stopped shifting clocks, so the offset is a constant rather than a
 * lookup — and a "day" in this app means 00:00–23:59 in Tehran, not in UTC.
 */
export const TEHRAN_OFFSET_MS = 3.5 * 3_600_000;

export function tehranDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** From a "YYYY-MM-DD" calendar day to the instant range it covers in UTC. */
export function tehranDayRange(day: Date | string) {
  const utcMidnight = typeof day === "string" ? new Date(`${day}T00:00:00.000Z`) : day;
  const start = new Date(utcMidnight.getTime() - TEHRAN_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Add n calendar days, keeping the UTC-midnight convention of zDate. */
export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86_400_000);
}
