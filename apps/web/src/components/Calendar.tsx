import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHead, Chip, IconButton, cx } from "./ui";
import { KindIcon } from "./KindIcon";
import {
  DAY_STATUS_FA,
  WORKOUT_KIND_FA,
  type DayStatus,
  type Workout,
  type WorkoutKind,
} from "../lib/domain";
import {
  FA_WEEKDAY_SHORT,
  faMonthYear,
  persianWeekIndex,
  sameDay,
  startOfDay,
  weekGrid,
} from "../lib/persian";
import { faJalaliDay, faNum, faTime } from "../lib/format";

/* ---------- activity calendar (home) ---------- */

const DOT: Record<DayStatus, string> = {
  completed: "bg-fill-strong",
  planned: "bg-fill-mid",
  missed: "bg-fill-weak",
  rest: "border border-line",
  today: "border-2 border-ink",
  future: "border border-divider",
};

export function ActivityCalendar({
  end,
  days,
  weeks = 5,
  title = "فعالیت تمرینی",
  onPrev,
  onNext,
  className,
}: {
  /** Rightmost (newest) column anchor of the grid. */
  end: Date;
  /** Status per calendar day, keyed by ISO yyyy-mm-dd. */
  days: Record<string, DayStatus>;
  weeks?: number;
  title?: string;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}) {
  const grid = weekGrid(end, weeks);
  const today = startOfDay(new Date());

  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <CardHead
        title={title}
        meta={faMonthYear(end)}
        action={
          onPrev || onNext ? (
            <div className="flex items-center gap-1">
              <IconButton label="هفته‌های قبلی" size="sm" onClick={onPrev} disabled={!onPrev}>
                {/* RTL: "earlier" is toward the right */}
                <ChevronRight size={15} strokeWidth={2} aria-hidden />
              </IconButton>
              <IconButton label="هفته‌های بعدی" size="sm" onClick={onNext} disabled={!onNext}>
                <ChevronLeft size={15} strokeWidth={2} aria-hidden />
              </IconButton>
            </div>
          ) : null
        }
      />

      {/* a Jalali week reads right-to-left: شنبه is the rightmost column, the
          way the reference calendar and printed Iranian calendars lay it out */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-7 gap-2">
          {grid.map((_, i) => (
            <span key={i} className="text-center text-2xs text-ink-3">
              {FA_WEEKDAY_SHORT[i]}
            </span>
          ))}
        </div>
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7 gap-2">
            {row.map((date) => {
              const key = isoKey(date);
              const status = statusFor(key, date, today, days);
              const label = `${FA_WEEKDAY_SHORT[persianWeekIndex(date)]} ${new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long" }).format(date)} — ${DAY_STATUS_FA[status]}`;
              return (
                <div
                  key={key}
                  role="img"
                  aria-label={label}
                  title={label}
                  className={cx(
                    "mx-auto aspect-square w-full max-w-6 rounded-full",
                    DOT[status],
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-2xs text-ink-3">
        <Legend tone="completed" label="انجام‌شده" />
        <Legend tone="planned" label="برنامه" />
        <Legend tone="missed" label="از‌دست‌رفته" />
        <Legend tone="rest" label="استراحت" />
      </div>
    </Card>
  );
}

function Legend({ tone, label }: { tone: DayStatus; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cx("size-2.5 rounded-full", DOT[tone])} aria-hidden />
      {label}
    </span>
  );
}

function statusFor(
  key: string,
  date: Date,
  today: Date,
  days: Record<string, DayStatus>,
): DayStatus {
  const explicit = days[key];
  if (explicit) return explicit;
  if (sameDay(date, today)) return "today";
  return date > today ? "future" : "rest";
}

const isoKey = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/* ---------- weekly plan schedule ---------- */

export type ScheduledDay = {
  date: string;
  kind: WorkoutKind;
  workout?: Workout;
  time?: string;
  status: "planned" | "completed" | "missed" | "rest" | "today";
};

export function WeeklyCalendar({
  week,
  onOpenDay,
  title = "برنامه هفتگی",
  className,
}: {
  week: ScheduledDay[];
  onOpenDay?: (day: ScheduledDay) => void;
  title?: string;
  className?: string;
}) {
  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <CardHead
        title={title}
        meta={`${FA_WEEKDAY_SHORT[0]} تا ${FA_WEEKDAY_SHORT[6]} · ${faNum(week.filter((d) => d.kind !== "rest").length)} جلسه`}
      />

      <ul className="flex flex-col gap-1">
        {week.map((day) => {
          const date = new Date(day.date);
          const inner = (
            <>
              <span className="w-10 shrink-0 text-2xs text-ink-3">
                {FA_WEEKDAY_SHORT[persianWeekIndex(date)]}
              </span>
              <span className="num w-8 shrink-0 text-sm text-ink-2">{faJalaliDay(date)}</span>
              <span
                className={cx(
                  "flex size-8 shrink-0 items-center justify-center rounded-xl border",
                  day.status === "completed"
                    ? "border-ink bg-fill-strong text-canvas"
                    : day.status === "missed"
                      ? "border-dashed border-fill-weak text-fill-weak"
                      : "border-line bg-card text-ink-2",
                )}
                aria-hidden
              >
                {day.status === "completed" ? (
                  <Check size={15} strokeWidth={2.5} />
                ) : (
                  <KindIcon kind={day.kind} size={15} />
                )}
              </span>
              <span className="min-w-0 flex-1 basis-40 max-tablet:order-4">
                <span className="block truncate text-sm font-medium">
                  {WORKOUT_KIND_FA[day.kind]}
                </span>
                {day.workout ? (
                  <span className="block truncate text-2xs text-ink-3">{day.workout.name}</span>
                ) : null}
              </span>
              {day.time ? (
                <span className="num ms-auto shrink-0 text-2xs text-ink-3 max-tablet:order-3">
                  {faTime(day.time)}
                </span>
              ) : null}
              {day.status === "missed" ? <Chip tone="outline" className="max-tablet:order-3">از دست رفته</Chip> : null}
            </>
          );

          const rowClass = cx(
            // flex-wrap: at phone width the name cannot share a line with the
            // weekday, date, icon and time columns, so it takes a line of its own
            "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2.5 py-2.5 text-start transition-colors",
            day.status === "today" && "bg-card-3",
          );

          return (
            <li key={day.date}>
              {onOpenDay ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className={cx(rowClass, "hover:bg-card-3")}
                >
                  {inner}
                </button>
              ) : (
                <div className={rowClass}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
