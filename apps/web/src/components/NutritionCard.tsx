import { Droplets, Flame } from "lucide-react";
import { Card, CardHead, Meter, cx } from "./ui";
import type { MacroIntake, MacroTargets } from "../lib/domain";
import { faNum, faPercent, faUnitShort } from "../lib/format";

/**
 * Daily nutrition overview. The macros row is three-up on phones and stays
 * three-up on desktop rails, so each meter needs a 0 min-track floor or the
 * nowrap value would push its neighbour off the card (found in the prototype audit).
 */
export function NutritionCard({
  intake,
  targets,
  onAddMeal,
  className,
}: {
  intake: MacroIntake;
  /** Null until a target exists; the card then shows the intake without a percentage. */
  targets: MacroTargets | null;
  onAddMeal?: () => void;
  className?: string;
}) {
  const remaining = targets ? Math.max(0, targets.kcal - intake.kcal) : 0;
  const over = targets ? intake.kcal > targets.kcal : false;
  const waterPct = targets && targets.waterMl > 0 ? intake.waterMl / targets.waterMl : 0;

  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <CardHead
        title="تغذیه امروز"
        meta={
          !targets
            ? "هنوز هدف روزانه‌ای ثبت نشده"
            : over
              ? `${faNum(intake.kcal - targets.kcal)} کیلوکالری بیش از هدف`
              : `${faNum(remaining)} کیلوکالری تا هدف`
        }
        action={
          onAddMeal ? (
            <button
              type="button"
              onClick={onAddMeal}
              className="rounded-xl border border-line px-3.5 py-1.5 text-2xs text-ink-2 transition-all active:scale-95 hover:border-ink-3 hover:text-ink"
            >
              افزودن وعده
            </button>
          ) : null
        }
      />

      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card-2 text-ink">
          <Flame size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="num text-4xl font-bold tracking-tight">{faNum(intake.kcal)}</span>
            {targets ? <span className="num text-sm text-ink-3">/ {faNum(targets.kcal)}</span> : null}
            <span className="text-2xs text-ink-3">کیلوکالری</span>
          </div>
          {targets ? (
            <Meter
              className="mt-2"
              value={intake.kcal}
              max={Math.max(1, targets.kcal)}
              valueLabel={faPercent(targets.kcal > 0 ? (intake.kcal / targets.kcal) * 100 : 0)}
            />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        <Meter
          stacked
          label="پروتئین"
          value={intake.protein}
          max={Math.max(1, targets?.protein ?? intake.protein)}
          valueLabel={faUnitShort(intake.protein, "g")}
        />
        <Meter
          stacked
          label="کربوهیدرات"
          value={intake.carbs}
          max={Math.max(1, targets?.carbs ?? intake.carbs)}
          valueLabel={faUnitShort(intake.carbs, "g")}
        />
        <Meter
          stacked
          label="چربی"
          value={intake.fat}
          max={Math.max(1, targets?.fat ?? intake.fat)}
          valueLabel={faUnitShort(intake.fat, "g")}
        />
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-divider bg-card-2 p-3">
        <Droplets size={16} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-ink-2">آب</span>
            <span className="num text-sm">
              {faNum(intake.waterMl / 1000, 1)}
              {targets ? ` از ${faNum(targets.waterMl / 1000, 1)}` : ""} لیتر
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-line">
            <div
              className="h-full rounded-pill bg-fill-mid transition-[width] duration-300"
              style={{ width: `${Math.min(100, waterPct * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
