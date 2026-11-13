import { ChevronDown, ChevronUp, GripVertical, Pencil, Trash2 } from "lucide-react";
import { IconButton, cx } from "./ui";
import type { Exercise } from "../lib/domain";
import { faNum } from "../lib/format";

/**
 * A single exercise row inside workout details (§7.3) and the editor (§7.4).
 * Reorder, edit and delete are real controls — they are only rendered when the
 * caller actually passes the handler.
 */
export function ExerciseCard({
  exercise,
  index,
  total,
  editable,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onRecord,
  className,
}: {
  exercise: Exercise;
  index: number;
  total: number;
  editable?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Opens the "what actually happened" capture. */
  onRecord?: () => void;
  className?: string;
}) {
  return (
    <li
      className={cx(
        "flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-divider bg-card-2 px-3 py-3",
        className,
      )}
    >
      <span className="num w-5 shrink-0 text-2xs text-ink-3">{faNum(index + 1)}</span>

      {/* basis-40: at phone width the four control buttons cannot share a line
          with a Persian exercise name, so they wrap below it instead of
          truncating the name */}
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium">{exercise.name}</p>
        <p className="num mt-1 truncate text-2xs text-ink-3">
          {faNum(exercise.sets)} ست × {exercise.reps} · استراحت {faNum(exercise.restSeconds)} ثانیه
        </p>
        {exercise.performedWeightKg !== undefined ? (
          <p className="num mt-1 text-2xs text-ink-2">
            ثبت شما: {faNum(exercise.performedWeightKg, 1)} کیلوگرم × {faNum(exercise.performedReps ?? 0)}
          </p>
        ) : null}
      </div>

      {editable ? (
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <IconButton
            label="انتقال به بالا"
            size="sm"
            disabled={index === 0}
            onClick={onMoveUp}
          >
            {/* reorder arrows read against the axis, not the text direction */}
            <ChevronUp size={14} strokeWidth={2} aria-hidden />
          </IconButton>
          <IconButton
            label="انتقال به پایین"
            size="sm"
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ChevronDown size={14} strokeWidth={2} aria-hidden />
          </IconButton>
          <IconButton label={`ویرایش ${exercise.name}`} size="sm" onClick={onEdit}>
            <Pencil size={14} strokeWidth={2} aria-hidden />
          </IconButton>
          <IconButton label={`حذف ${exercise.name}`} size="sm" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={2} aria-hidden />
          </IconButton>
        </div>
      ) : onRecord ? (
        <button
          type="button"
          onClick={onRecord}
          className="shrink-0 rounded-xl border border-line px-3.5 py-1.5 text-2xs text-ink-2 transition-all active:scale-95 hover:border-ink-3 hover:text-ink"
        >
          ثبت عملکرد
        </button>
      ) : (
        <GripVertical size={14} className="shrink-0 text-ink-4" aria-hidden />
      )}
    </li>
  );
}
