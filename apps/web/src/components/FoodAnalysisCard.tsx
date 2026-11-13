import { Camera, Pencil } from "lucide-react";
import { Button, Card, CardHead, Chip, Divider, Field, Meter, TextInput, cx } from "./ui";
import { DATA_QUALITY_FA, RECORD_SOURCE_FA, type RecordSource } from "../lib/domain";
import { faNum, faPercent, faUnitShort, parseFaNumber } from "../lib/format";

export type FoodDraft = {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/**
 * Result of an image/text/voice analysis (§10). The model's numbers arrive as an
 * estimate and stay editable: the save button commits the user's corrected
 * values, not the model's guesses.
 */
export function FoodAnalysisCard({
  draft,
  onDraftChange,
  items,
  portions,
  ingredients,
  explanation,
  confidence,
  source,
  photoPreview,
  onSave,
  onDiscard,
  saving,
  editing,
  onToggleEditing,
  className,
}: {
  draft: FoodDraft;
  onDraftChange: (patch: Partial<FoodDraft>) => void;
  /** What the model believes it saw, listed separately from the totals. */
  items: string[];
  portions: string[];
  ingredients: string[];
  explanation: string;
  /** 0–1. Low confidence must be visible, not smoothed over. */
  confidence?: number;
  source: RecordSource;
  photoPreview?: string;
  onSave: () => void;
  onDiscard?: () => void;
  saving?: boolean;
  editing: boolean;
  onToggleEditing: () => void;
  className?: string;
}) {
  const lowConfidence = confidence !== undefined && confidence < 0.6;

  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <CardHead
        title="تحلیل ارزش غذایی"
        meta={`منبع: ${RECORD_SOURCE_FA[source]} · ${DATA_QUALITY_FA.estimated}`}
        action={
          <Button size="sm" variant="ghost" leading={<Pencil size={13} />} onClick={onToggleEditing}>
            {editing ? "نمایش" : "ویرایش"}
          </Button>
        }
      />

      {photoPreview ? (
        <div className="relative overflow-hidden rounded-md border border-divider">
          <img
            src={photoPreview}
            alt="تصویر غذای تحلیل‌شده"
            className="aspect-4/3 w-full object-cover"
            style={{ direction: "ltr" }}
          />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-pill bg-canvas/80 px-2 py-1 text-2xs text-ink-2 backdrop-blur">
            <Camera size={11} aria-hidden />
            {faPercent((confidence ?? 0) * 100)}
          </span>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <Chip key={it} tone="outline">
              {it}
            </Chip>
          ))}
        </div>
      ) : null}

      {portions.length > 0 ? (
        <p className="text-2xs text-ink-3">
          برآورد حجم: {portions.join("، ")}
        </p>
      ) : null}

      {ingredients.length > 0 ? (
        <p className="text-2xs text-ink-3">مواد اولیه احتمالی: {ingredients.join("، ")}</p>
      ) : null}

      <div className={cx("rounded-md border p-3 text-sm leading-relaxed", lowConfidence ? "border-ink-2 bg-card-2" : "border-divider bg-card-2")}>
        {explanation}
      </div>

      {lowConfidence ? (
        <p className="text-2xs text-ink-2">
          اطمینان این تحلیل پایین است. حجم و مواد را خودتان اصلاح کنید؛ اعداد مدل تنها یک
          حدس مبتنی بر تصویرند.
        </p>
      ) : null}

      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="نام غذا" htmlFor="food-name" className="col-span-2">
            <TextInput
              id="food-name"
              value={draft.name}
              onChange={(e) => onDraftChange({ name: e.target.value })}
            />
          </Field>
          {(
            [
              ["kcal", "کیلوکالری", draft.kcal],
              ["protein", "پروتئین (گرم)", draft.protein],
              ["carbs", "کربوهیدرات (گرم)", draft.carbs],
              ["fat", "چربی (گرم)", draft.fat],
            ] as const
          ).map(([key, label, val]) => (
            <Field key={key} label={label} htmlFor={`food-${key}`}>
              <TextInput
                id={`food-${key}`}
                inputMode="decimal"
                value={String(val)}
                onChange={(e) => {
                  const parsed = parseFaNumber(e.target.value);
                  onDraftChange({ [key]: parsed ?? 0 } as Partial<FoodDraft>);
                }}
              />
            </Field>
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="num text-5xl font-bold tracking-tight">{faNum(draft.kcal)}</span>
            <span className="text-sm text-ink-3">کیلوکالری</span>
            {draft.name ? <span className="ms-auto truncate text-sm text-ink-2">{draft.name}</span> : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MacroStat label="پروتئین" value={draft.protein} kcal={draft.protein * 4} total={draft.kcal} />
            <MacroStat label="کربوهیدرات" value={draft.carbs} kcal={draft.carbs * 4} total={draft.kcal} />
            <MacroStat label="چربی" value={draft.fat} kcal={draft.fat * 9} total={draft.kcal} />
          </div>
        </>
      )}

      <Divider className="my-0" />

      <div className="flex items-center gap-2">
        <Button variant="primary" block loading={saving} onClick={onSave}>
          ذخیره در ثبت غذاها
        </Button>
        {onDiscard ? (
          <Button variant="ghost" onClick={onDiscard} disabled={saving}>
            انصراف
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function MacroStat({
  label,
  value,
  kcal,
  total,
}: {
  label: string;
  value: number;
  kcal: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs text-ink-2">{label}</span>
      <span className="num text-sm">{faUnitShort(value, "g")}</span>
      <Meter value={kcal} max={Math.max(1, total)} />
      <span className="num text-2xs text-ink-3">
        {faPercent(total > 0 ? (kcal / total) * 100 : 0)} از انرژی
      </span>
    </div>
  );
}
