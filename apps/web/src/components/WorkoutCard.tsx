import { Check, ChevronLeft } from "lucide-react";
import { Card, Chip, Meter, cx } from "./ui";
import { KindIcon } from "./KindIcon";
import { WORKOUT_KIND_FA, WORKOUT_STATUS_FA, INTENSITY_FA, type Workout } from "../lib/domain";
import { faCount, faDayLabel, faDuration } from "../lib/format";

/** Home-screen workout card: identity, schedule, and how far along it is. */
export function WorkoutCard({
  workout,
  onOpen,
  onToggleDone,
  className,
}: {
  workout: Workout;
  onOpen: (workout: Workout) => void;
  onToggleDone?: (workout: Workout) => void;
  className?: string;
}) {
  const scheduled = workout.scheduledDate ? faDayLabel(workout.scheduledDate) : "بدون زمان‌بندی";

  return (
    <Card
      className={cx(
        "flex flex-col gap-4 transition-colors hover:border-ink-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-xl border",
            workout.done
              ? "border-ink bg-fill-strong text-canvas"
              : "border-line bg-card-2 text-ink-2",
          )}
          aria-hidden
        >
          <KindIcon kind={workout.kind} size={18} />
        </span>

        {/* the name is the primary affordance — no full-card overlay, which would
            swallow the completion toggle underneath it */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpen(workout)}
            className="flex w-full items-center gap-2 text-start"
          >
            <h3 className="min-w-0 line-clamp-2 text-base font-semibold hover:underline">
              {workout.name}
            </h3>
            {workout.done ? (
              <span className="flex shrink-0 items-center gap-1 text-2xs text-ink-2">
                <Check size={12} strokeWidth={2.5} aria-hidden />
                انجام شد
              </span>
            ) : null}
          </button>
          <p className="mt-1 truncate text-2xs text-ink-3">
            {WORKOUT_KIND_FA[workout.kind]} · {scheduled}
          </p>
        </div>

        {onToggleDone ? (
          <button
            type="button"
            onClick={() => onToggleDone(workout)}
            aria-pressed={workout.done}
            aria-label={workout.done ? `لغو تکمیل ${workout.name}` : `تکمیل ${workout.name}`}
            className={cx(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 active:scale-90",
              workout.done
                ? "border-ink bg-fill-strong text-canvas"
                : "border-line text-transparent hover:border-ink-2 hover:text-ink-3",
            )}
          >
            <Check size={14} strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
      </div>

      {workout.muscleGroups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {workout.muscleGroups.map((m) => (
            <Chip key={m}>{m}</Chip>
          ))}
        </div>
      ) : null}

      {workout.sessions ? (
        <Meter
          label={`${faCount(workout.sessions.completed)} از ${faCount(workout.sessions.total)} جلسه`}
          valueLabel={INTENSITY_FA[workout.intensity]}
          value={workout.sessions.completed}
          max={Math.max(1, workout.sessions.total)}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs text-ink-2">{WORKOUT_STATUS_FA[workout.status]}</span>
          <Chip tone="outline">{INTENSITY_FA[workout.intensity]}</Chip>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-2xs text-ink-3">
        <span className="num">
          {workout.estimatedMinutes ? faDuration(workout.estimatedMinutes) : "مدت نامشخص"}
          {workout.exerciseCount ? ` · ${faCount(workout.exerciseCount)} حرکت` : ""}
        </span>
        <button
          type="button"
          onClick={() => onOpen(workout)}
          className="flex items-center gap-1 text-ink-2 hover:text-ink"
        >
          جزئیات
          {/* RTL: "forward" points left */}
          <ChevronLeft size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </Card>
  );
}
