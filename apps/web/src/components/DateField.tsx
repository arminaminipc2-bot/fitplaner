import { useMemo } from "react";
import { cx } from "./ui";
import { fromJalali, toJalaliParts, todayJalali, JALALI_MONTH_NAMES } from "../lib/jalali";
import { faNum } from "../lib/format";

/**
 * Persian date entry as three selects. A free-text Jalali field would accept
 * «۱۴۰۵/۱۳/۱» and silently mean nothing; these controls can only produce a real
 * day, and every label and digit on screen stays Persian.
 */
export function DateField({
  label,
  value,
  onChange,
  years,
  hint,
  disabled,
  className,
}: {
  label: string;
  /** Any moment of the chosen day; only its Tehran date is used. */
  value: Date | null;
  onChange: (date: Date | null) => void;
  /** Ascending year list; defaults to a window around the current Persian year. */
  years?: number[];
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const chosen = value ? toJalaliParts(value) : null;
  const now = todayJalali();
  // an unset field still shows a coherent day so the three selects can never
  // combine into an impossible date; nothing is written until the user touches one
  const parts = chosen ?? { jy: now.jy, jm: now.jm, jd: 1 };
  const yearList = useMemo(
    () => years ?? Array.from({ length: 90 }, (_, i) => now.jy - i),
    [years, now.jy],
  );
  const dayList = useMemo(() => {
    // Esfand is 29 or 30 days depending on the year; ask the calendar, don't guess.
    for (let jd = 31; jd >= 28; jd -= 1) if (fromJalali(parts.jy, parts.jm, jd)) return Array.from({ length: jd }, (_, i) => i + 1);
    return Array.from({ length: 31 }, (_, i) => i + 1);
  }, [parts.jy, parts.jm]);

  const selectClass = cx(
    "h-11 w-full min-w-0 rounded-full border border-line bg-card-2 px-4 text-base text-ink",
    "focus:border-ink focus:outline-none disabled:opacity-40",
  );

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <select
          aria-label={`${label} — سال`}
          className={selectClass}
          disabled={disabled}
          value={parts.jy}
          onChange={(e) => onChange(fromJalali(Number(e.target.value), parts.jm, parts.jd))}
        >
          {yearList.map((y) => (
            <option key={y} value={y}>
              {faNum(y)}
            </option>
          ))}
        </select>

        <select
          aria-label={`${label} — ماه`}
          className={selectClass}
          disabled={disabled}
          value={parts.jm}
          onChange={(e) => onChange(fromJalali(parts.jy, Number(e.target.value), Math.min(parts.jd, dayList.length)))}
        >
          {JALALI_MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          aria-label={`${label} — روز`}
          className={selectClass}
          disabled={disabled}
          value={parts.jd}
          onChange={(e) => onChange(fromJalali(parts.jy, parts.jm, Number(e.target.value)))}
        >
          {dayList.map((d) => (
            <option key={d} value={d}>
              {faNum(d)}
            </option>
          ))}
        </select>
      </div>
      {hint ? <p className="text-2xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
