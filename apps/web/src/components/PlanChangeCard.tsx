import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { Button, Card, CardHead, Chip, Divider } from "./ui";
import { PLAN_CHANGE_STATUS_FA, WORKOUT_KIND_FA, type PlanChangeStatus } from "../lib/domain";
import { faJalaliDay, faNum } from "../lib/format";
import type { PlanChangeDto } from "../lib/api";

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const kindLabel = (value: unknown): string | undefined => {
  const raw = text(value);
  if (!raw) return undefined;
  return WORKOUT_KIND_FA[raw as keyof typeof WORKOUT_KIND_FA] ?? raw;
};

/**
 * Persian description of one write the user is being asked to approve.
 * PlanChange rows are stored JSON and can predate the current operation
 * schema, so this reads defensively and never throws on an old row.
 */
export function describeOperation(raw: unknown): { title: string; detail: string | null; destructive: boolean } {
  const op = asRecord(raw);
  const kind = text(op.kind) ?? text(op.op) ?? "";
  const workout = asRecord(op.workout);
  const patch = asRecord(op.patch);
  const set = asRecord(op.set);
  const target = asRecord(op.target);
  const meal = asRecord(op.meal);

  switch (kind) {
    case "workout.create": {
      const title = text(workout.title);
      const date = text(workout.date);
      if (title) {
        return {
          title: `افزودن تمرین «${title}»`,
          detail: date
            ? `${faJalaliDay(new Date(`${date}T00:00:00Z`))} · ${faNum(count(workout.estimatedMinutes) ?? 0)} دقیقه`
            : null,
          destructive: false,
        };
      }
      break;
    }
    case "workout.update": {
      const patchTitle = text(patch.title);
      const patchDate = text(patch.date);
      const legacyFields = Object.entries(set);
      if (legacyFields.length > 0) {
        const detail = legacyFields
          .map(([key, value]) =>
            key === "kind" ? `نوع جدید: ${kindLabel(value) ?? String(value)}` : `${key}: ${String(value)}`,
          )
          .join(" · ");
        return {
          title: patchTitle ? `ویرایش تمرین «${patchTitle}»` : "ویرایش یک تمرین",
          detail,
          destructive: false,
        };
      }
      return {
        title: patchTitle ? `ویرایش تمرین «${patchTitle}»` : "ویرایش یک تمرین",
        detail: patchDate
          ? `تاریخ جدید: ${faJalaliDay(new Date(`${patchDate}T00:00:00Z`))}`
          : kindLabel(patch.kind)
            ? `نوع جدید: ${kindLabel(patch.kind)}`
            : null,
        destructive: false,
      };
    }
    case "workout.reschedule": {
      const date = text(op.date);
      if (date) {
        return {
          title: "جابه‌جایی تمرین",
          detail: `به ${faJalaliDay(new Date(`${date}T00:00:00Z`))}`,
          destructive: false,
        };
      }
      break;
    }
    case "workout.delete":
      return { title: "حذف یک تمرین", detail: "تمرین از تقویم حذف می‌شود.", destructive: true };
    case "targets.update": {
      const kcal = count(target.kcal);
      if (kcal !== undefined) {
        return {
          title: "تغییر هدف غذایی",
          detail: `${faNum(kcal)} کیلوکالری · پروتئین ${faNum(count(target.proteinG) ?? 0)} گرم · کربوهیدرات ${faNum(count(target.carbsG) ?? 0)} گرم · چربی ${faNum(count(target.fatG) ?? 0)} گرم`,
          destructive: false,
        };
      }
      break;
    }
    case "meal.create": {
      const name = text(meal.name);
      if (name) {
        return { title: `ثبت وعدهٔ «${name}»`, detail: "یک وعده به ثبت غذاها افزوده می‌شود.", destructive: false };
      }
      break;
    }
    case "meal.update":
      return { title: "ویرایش یک وعده", detail: "ارزش غذایی وعده به‌روزرسانی می‌شود.", destructive: false };
    case "meal.delete":
      return { title: "حذف یک وعده", detail: "وعده از ثبت غذاها حذف می‌شود.", destructive: true };
  }

  // Historical or malformed rows stay readable instead of white-screening the
  // whole conversation; they are not silently treated as a valid write.
  return {
    title: "تغییر برنامه",
    detail: "این پیشنهاد با نسخهٔ فعلی برنامه سازگار نیست؛ برای ادامه آن را رد کنید.",
    destructive: kind.endsWith(".delete"),
  };
}

export function toConfirmationChanges(change: PlanChangeDto) {
  return [
    {
      id: change.id,
      summary: change.summary,
      detail: change.operations.map((op) => describeOperation(op).title),
      destructive: change.operations.some((op) => describeOperation(op).destructive),
    },
  ];
}

const TONE: Record<PlanChangeStatus, "neutral" | "outline" | "solid"> = {
  pending: "solid",
  confirmed: "outline",
  applied: "outline",
  rejected: "neutral",
  reverted: "neutral",
};

/**
 * A proposal is a list of validated writes with an explicit approval gate.
 * Nothing here is an AI claim: the card reflects the stored PlanChange row.
 */
export function PlanChangeCard({
  change,
  busy,
  error,
  onApply,
  onReject,
  onRevert,
}: {
  change: PlanChangeDto;
  busy: boolean;
  error?: string | null;
  onApply: () => void;
  onReject: () => void;
  onRevert: () => void;
}) {
  const pending = change.status === "pending";
  const applied = change.status === "applied";

  return (
    <Card tone={pending ? "raised" : "sunken"} className="flex flex-col gap-3 border-ink-3">
      <CardHead
        title="پیشنهاد تغییر برنامه"
        meta={`${PLAN_CHANGE_STATUS_FA[change.status]} · ${new Intl.DateTimeFormat("fa-IR", { timeStyle: "short", dateStyle: "short" }).format(new Date(change.createdAt))}`}
        action={<Chip tone={TONE[change.status]}>{PLAN_CHANGE_STATUS_FA[change.status]}</Chip>}
      />

      <p className="text-sm leading-relaxed text-ink">{change.summary}</p>

      <ul className="flex flex-col gap-2">
        {change.operations.map((op, index) => {
          const described = describeOperation(op);
          return (
            <li key={`${op.kind}-${index}`} className="flex flex-col gap-1 rounded-md border border-divider bg-card-2 px-3 py-2">
              <span className="text-2xs font-semibold text-ink-2">{described.title}</span>
              {described.detail ? <span className="text-2xs text-ink-3">{described.detail}</span> : null}
              {described.destructive && pending ? (
                <span className="text-2xs text-ink-3">این مورد داده حذف می‌کند؛ بازگردانی ممکن است.</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-sm leading-relaxed text-ink-3">
        این تغییر پیش از تأیید شما هیچ داده‌ای را دست نمی‌زند. پس از اعمال، می‌توانید آن را بازگردانید.
      </p>

      {error ? (
        <p role="alert" className="text-sm leading-relaxed text-ink">
          {error}
        </p>
      ) : null}

      <Divider className="my-0" />

      <div className="flex flex-wrap items-center gap-2">
        {pending ? (
          <>
            <Button variant="primary" size="sm" leading={<Check size={14} aria-hidden />} loading={busy} onClick={onApply}>
              تأیید و اعمال
            </Button>
            <Button variant="ghost" size="sm" leading={<X size={14} aria-hidden />} disabled={busy} onClick={onReject}>
              رد پیشنهاد
            </Button>
          </>
        ) : applied ? (
          <Button variant="outline" size="sm" leading={<Undo2 size={14} aria-hidden />} loading={busy} onClick={onRevert}>
            بازگردانی این تغییر
          </Button>
        ) : (
          <span className="flex items-center gap-2 text-2xs text-ink-3">
            <RotateCcw size={12} aria-hidden />
            {change.status === "reverted"
              ? "این تغییر بازگردانده شده و داده‌ها به حالت پیشین برگشته‌اند."
              : "این پیشنهاد اعمال نشده است."}
          </span>
        )}
      </div>
    </Card>
  );
}
