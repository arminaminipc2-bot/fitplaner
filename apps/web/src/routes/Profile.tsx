import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Calculator, Check, LogOut, ShieldAlert } from "lucide-react";
import { Button, Card, CardHead, Chip, Choice, Field, SectionTitle, TextInput } from "../components/ui";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { SettingsSection } from "../components/SettingsSection";
import { DateField } from "../components/DateField";
import { MeasurementCard } from "../components/MeasurementCard";
import { MultiSelectChips } from "../components/MultiSelectChips";
import {
  DIET_PRESETS,
  EQUIPMENT_PRESETS,
  INJURY_PRESETS,
  LIMITATION_PRESETS,
  MEDICAL_PRESETS,
  parseStructuredField,
  serializeStructuredField,
} from "../lib/profile-presets";
import { api, ApiError, type ProfileFields, type TargetSuggestion } from "../lib/api";
import { toQuality } from "../lib/adapters";
import {
  ACTIVITY_LEVEL_FA,
  DATA_QUALITY_FA,
  GOAL_TYPE_FA,
  RECORD_SOURCE_FA,
  SEX_FA,
  TRAINING_EXPERIENCE_FA,
  type ActivityLevel,
  type GoalType,
  type Sex,
  type TrainingExperience,
} from "../lib/domain";
import { faDate, faNum } from "../lib/format";
import { tehranDayKey, toJalaliParts } from "../lib/jalali";
import { FA_WEEKDAY_LONG } from "../lib/persian";
import { useSession } from "../lib/session";
import { useApiData, useSubmit } from "../lib/useApiData";

/**
 * The post-onboarding editor for the same profile record Onboarding collects.
 * Field names, vocabularies and the partial-PATCH semantics mirror it exactly:
 * every section saves on its own, absent keys stay put on the server, and the
 * draft is re-read from the server after each write.
 */

/* ---------- input helpers ---------- */

const FA_DIGIT_CHARS = "۰۱۲۳۴۵۶۷۸۹";

/** Persian or Arabic-Indic digits typed into a numeric field still parse. */
function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (ch) => String(FA_DIGIT_CHARS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

/** Positive number or null; the range itself stays the server's rule. */
function parseNum(value: string): number | null {
  const cleaned = toLatinDigits(value).replace(/[^\d.]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const errorText = (error: ApiError | string | null): string =>
  error instanceof ApiError ? error.message : error ?? "";

const fieldError = (error: ApiError | string | null, key: string): string | undefined =>
  error instanceof ApiError ? error.fields[key] : undefined;

/** «ذخیره شد» lives for a few seconds after a successful section write. */
function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = () => {
    setSaved(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 4000);
  };
  return [saved, flash];
}

function SavedBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1 text-sm font-medium text-ink-2">
      <Check size={12} strokeWidth={2.5} aria-hidden />
      ذخیره شد
    </span>
  );
}

function ErrorLine({ error }: { error: ApiError | string | null }) {
  const text = errorText(error);
  if (!text) return null;
  return (
    <p role="alert" className="rounded-md border border-ink-3 bg-card-2 px-3 py-2 text-sm text-ink">
      {text}
    </p>
  );
}

/* ---------- draft (mirrors Onboarding.tsx exactly) ---------- */

type Draft = {
  displayName: string;
  sex: Sex | null;
  birthDate: Date | null;
  heightCm: string;
  activityLevel: ActivityLevel | null;
  trainingExperience: TrainingExperience | null;
  goal: GoalType | null;
  maxWorkoutMinutes: string;
  trainingDays: number[];
  injuries: string;
  medicalConditions: string;
  medications: string;
  dietaryRestrictions: string;
  dislikedFoods: string;
  preferredFoods: string;
  equipmentNotes: string;
};

const fromProfile = (p: ProfileFields): Draft => ({
  displayName: p.displayName ?? "",
  sex: p.sex,
  birthDate: p.birthDate ? new Date(p.birthDate) : null,
  heightCm: p.heightCm === null ? "" : String(p.heightCm),
  activityLevel: p.activityLevel,
  trainingExperience: p.trainingExperience,
  goal: p.goal,
  maxWorkoutMinutes: String(p.maxWorkoutMinutes ?? ""),
  trainingDays: p.trainingDays,
  injuries: p.injuries ?? "",
  medicalConditions: p.medicalConditions ?? "",
  medications: p.medications ?? "",
  dietaryRestrictions: p.dietaryRestrictions ?? "",
  dislikedFoods: p.dislikedFoods ?? "",
  preferredFoods: p.preferredFoods ?? "",
  equipmentNotes: p.equipmentNotes ?? "",
});

type SectionProps = {
  draft: Draft;
  patch: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  onSaved: () => void;
};

/* ---------- identity ---------- */

function IdentitySection({ draft, patch, onSaved }: SectionProps) {
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  const ageYears = useMemo(() => {
    if (!draft.birthDate) return null;
    const { jy } = toJalaliParts(new Date());
    return jy - toJalaliParts(draft.birthDate).jy;
  }, [draft.birthDate]);

  const heightText = draft.heightCm.trim();
  const heightInvalid = heightText !== "" && parseNum(heightText) === null;
  const minor = ageYears !== null && ageYears < 18;

  const save = async () => {
    if (heightInvalid) return;
    const result = await submit.run(() =>
      api.profile.patch({
        displayName: draft.displayName.trim() || null,
        sex: draft.sex,
        birthDate: draft.birthDate ? draft.birthDate.toISOString() : null,
        heightCm: parseNum(heightText) ?? null,
      }),
    );
    if (result) {
      flash();
      onSaved();
    }
  };

  return (
    <SettingsSection
      title="هویت و مشخصات فردی"
      description="نام، جنسیت، تاریخ تولد و قد"
      summary={draft.displayName.trim() || "بی‌نام"}
    >
      <div className="flex flex-col gap-4">
        <Field
          label="نام شما"
          htmlFor="pf-name"
          hint="حداکثر ۶۰ نویسه — در سربرگ برنامه نمایش داده می‌شود."
          error={fieldError(submit.error, "displayName")}
        >
          <TextInput
            id="pf-name"
            value={draft.displayName}
            autoComplete="name"
            maxLength={60}
            onChange={(e) => patch("displayName", e.target.value)}
          />
        </Field>

        <div role="group" aria-label="جنسیت" className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">جنسیت</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SEX_FA) as Sex[]).map((s) => (
              <Choice key={s} selected={draft.sex === s} onClick={() => patch("sex", s)}>
                {SEX_FA[s]}
              </Choice>
            ))}
          </div>
        </div>

        <DateField label="تاریخ تولد" value={draft.birthDate} onChange={(d) => patch("birthDate", d)} hint="بر اساس آن سن محاسبه می‌شود؛ معیارهای بزرگسالان برای زیر ۱۸ سال اعمال نمی‌شود." />

        {draft.birthDate && ageYears !== null ? (
          <p className="text-2xs text-ink-3" aria-live="polite">
            سن محاسبه‌شده: <span className="num">{faNum(ageYears)}</span> سال
          </p>
        ) : null}

        <Field
          label="قد"
          htmlFor="pf-height"
          hint="سانتی‌متر، بین ۸۰ تا ۲۵۰."
          error={fieldError(submit.error, "heightCm") ?? (heightInvalid ? "قد باید عددی معتبر باشد." : undefined)}
        >
          <TextInput
            id="pf-height"
            inputMode="decimal"
            value={draft.heightCm}
            invalid={heightInvalid || Boolean(fieldError(submit.error, "heightCm"))}
            onChange={(e) => patch("heightCm", e.target.value)}
          />
        </Field>

        {minor ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-ink-3 bg-card-2 p-3 text-sm leading-relaxed text-ink"
          >
            <ShieldAlert size={14} className="mt-1 shrink-0" aria-hidden />
            سن شما کمتر از ۱۸ سال محاسبه می‌شود. طبقه‌بندی BMI بزرگسالان و هدف‌های کاهش وزن
            بزرگسالان روی شما اعمال نمی‌شود؛ برنامه‌ریزی باید با ناظر بالینی انجام شود.
          </p>
        ) : null}

        <ErrorLine error={submit.error} />

        <div className="flex items-center justify-between gap-3">
          <SavedBadge visible={saved} />
          <Button variant="primary" loading={submit.pending} onClick={() => void save()}>
            ذخیره هویت
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- activity / experience / goal ---------- */

function ActivitySection({ draft, patch, onSaved }: SectionProps) {
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  const save = async () => {
    const result = await submit.run(() =>
      api.profile.patch({
        activityLevel: draft.activityLevel,
        trainingExperience: draft.trainingExperience,
        goal: draft.goal,
      }),
    );
    if (result) {
      flash();
      onSaved();
    }
  };

  return (
    <SettingsSection
      title="فعالیت، سابقه و هدف"
      description="این سه مورد شکل تمرین و محاسبه انرژی را می‌سازند"
      summary={draft.goal ? GOAL_TYPE_FA[draft.goal] : "هدف انتخاب نشده"}
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="سطح فعالیت روزانه" className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">سطح فعالیت روزانه</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTIVITY_LEVEL_FA) as ActivityLevel[]).map((a) => (
              <Choice key={a} selected={draft.activityLevel === a} onClick={() => patch("activityLevel", a)}>
                {ACTIVITY_LEVEL_FA[a]}
              </Choice>
            ))}
          </div>
        </div>

        <div role="group" aria-label="سابقه تمرین" className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">سابقه تمرین</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TRAINING_EXPERIENCE_FA) as TrainingExperience[]).map((t) => (
              <Choice key={t} selected={draft.trainingExperience === t} onClick={() => patch("trainingExperience", t)}>
                {TRAINING_EXPERIENCE_FA[t]}
              </Choice>
            ))}
          </div>
        </div>

        <div role="group" aria-label="هدف شما" className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">هدف شما</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GOAL_TYPE_FA) as GoalType[]).map((g) => (
              <Choice key={g} selected={draft.goal === g} onClick={() => patch("goal", g)}>
                {GOAL_TYPE_FA[g]}
              </Choice>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-ink-3">
            هدف، محاسبه انرژی و ساختار تمرین را عوض می‌کند.
          </p>
        </div>

        <ErrorLine error={submit.error} />

        <div className="flex items-center justify-between gap-3">
          <SavedBadge visible={saved} />
          <Button variant="primary" loading={submit.pending} onClick={() => void save()}>
            ذخیره فعالیت و هدف
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- weekly schedule ---------- */

function ScheduleSection({ draft, patch, onSaved }: SectionProps) {
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  const minutesText = draft.maxWorkoutMinutes.trim();
  const minutesInvalid = minutesText !== "" && parseNum(minutesText) === null;

  const save = async () => {
    if (minutesInvalid) return;
    const result = await submit.run(() =>
      api.profile.patch({
        maxWorkoutMinutes: parseNum(minutesText) ?? null,
        trainingDays: draft.trainingDays,
      }),
    );
    if (result) {
      flash();
      onSaved();
    }
  };

  return (
    <SettingsSection
      title="برنامه هفتگی تمرین"
      description="روزهای تمرین و سقف زمان هر جلسه"
      summary={`${faNum(draft.trainingDays.length)} روز در هفته`}
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="روزهایی که می‌توانید تمرین کنید" className="flex flex-col gap-2">
          <span className="text-sm font-medium text-ink-2">روزهایی که می‌توانید تمرین کنید</span>
          <div className="flex flex-wrap gap-2">
            {FA_WEEKDAY_LONG.map((name, index) => (
              <Choice
                key={name}
                selected={draft.trainingDays.includes(index)}
                onClick={() =>
                  patch(
                    "trainingDays",
                    draft.trainingDays.includes(index)
                      ? draft.trainingDays.filter((d) => d !== index)
                      : [...draft.trainingDays, index].sort((a, b) => a - b),
                  )
                }
              >
                {name}
              </Choice>
            ))}
          </div>
          <p className="text-2xs text-ink-3">شنبه تا جمعه؛ هر روز با یک لمس انتخاب یا لغو می‌شود.</p>
        </div>

        <Field
          label="حداکثر زمان هر جلسه"
          htmlFor="pf-minutes"
          hint="دقیقه، بین ۱۰ تا ۲۴۰ — بیشتر از این تمرین پیشنهاد نمی‌شود."
          error={fieldError(submit.error, "maxWorkoutMinutes") ?? (minutesInvalid ? "زمان باید عددی معتبر باشد." : undefined)}
        >
          <TextInput
            id="pf-minutes"
            inputMode="numeric"
            value={draft.maxWorkoutMinutes}
            invalid={minutesInvalid || Boolean(fieldError(submit.error, "maxWorkoutMinutes"))}
            onChange={(e) => patch("maxWorkoutMinutes", e.target.value)}
          />
        </Field>

        <ErrorLine error={submit.error} />

        <div className="flex items-center justify-between gap-3">
          <SavedBadge visible={saved} />
          <Button variant="primary" loading={submit.pending} onClick={() => void save()}>
            ذخیره برنامه هفتگی
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- safety ---------- */

function SafetySection({ draft, patch, onSaved }: SectionProps) {
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  const parsedInjuries = useMemo(() => parseStructuredField(draft.injuries, INJURY_PRESETS), [draft.injuries]);
  const toggleInjury = (label: string) => {
    const next = parsedInjuries.selected.includes(label)
      ? parsedInjuries.selected.filter((s) => s !== label)
      : [...parsedInjuries.selected, label];
    patch("injuries", serializeStructuredField(next, parsedInjuries.otherText));
  };
  const setInjuryOther = (otherText: string) => {
    patch("injuries", serializeStructuredField(parsedInjuries.selected, otherText));
  };

  const parsedMedical = useMemo(() => parseStructuredField(draft.medicalConditions, MEDICAL_PRESETS), [draft.medicalConditions]);
  const toggleMedical = (label: string) => {
    const next = parsedMedical.selected.includes(label)
      ? parsedMedical.selected.filter((s) => s !== label)
      : [...parsedMedical.selected, label];
    patch("medicalConditions", serializeStructuredField(next, parsedMedical.otherText));
  };
  const setMedicalOther = (otherText: string) => {
    patch("medicalConditions", serializeStructuredField(parsedMedical.selected, otherText));
  };

  const save = async () => {
    const result = await submit.run(() =>
      api.profile.patch({
        injuries: draft.injuries.trim() || null,
        medicalConditions: draft.medicalConditions.trim() || null,
        medications: draft.medications.trim() || null,
      }),
    );
    if (result) {
      flash();
      onSaved();
    }
  };

  const filled = [draft.injuries, draft.medicalConditions, draft.medications].filter((v) => v.trim() !== "").length;

  return (
    <SettingsSection
      title="سلامت و ایمنی"
      description="تنظیم گزینه‌ای آسیب‌ها و بیماری‌ها جهت پیشگیری هوشمند از تمرینات و غذاهای ناسازگار"
      summary={filled > 0 ? `${faNum(filled)} بخش ثبت‌شده` : "موردی ثبت نشده"}
    >
      <div className="flex flex-col gap-5">
        <MultiSelectChips
          label="آسیب‌های اسکلتی-عضلانی و مفاصل"
          hint="انتخاب گزینه‌های رایج به مربی هوش مصنوعی کمک می‌کند تا حرکات آسیب‌رسان را جایگزین کند."
          presets={INJURY_PRESETS}
          selected={parsedInjuries.selected}
          onToggle={toggleInjury}
          otherValue={parsedInjuries.otherText}
          onOtherChange={setInjuryOther}
          otherPlaceholder="آسیب دیگری دارید؟..."
        />

        <div className="h-[1px] bg-divider/60 my-1" />

        <MultiSelectChips
          label="بیماری‌های زمینه‌ای و شرایط پزشکی"
          hint="جهت تطبیق شدت تمرین و هشدارهای سلامتی."
          presets={MEDICAL_PRESETS}
          selected={parsedMedical.selected}
          onToggle={toggleMedical}
          otherValue={parsedMedical.otherText}
          onOtherChange={setMedicalOther}
          otherPlaceholder="بیماری یا شرایط دیگری مدنظرتان است؟..."
        />

        <div className="h-[1px] bg-divider/60 my-1" />

        <Field label="داروهای جاری (اختیاری)" htmlFor="pf-medications" hint="اگر داروی روزانه مصرف می‌کنید:">
          <TextInput
            id="pf-medications"
            value={draft.medications}
            maxLength={300}
            placeholder="نام داروهای مصرفی..."
            onChange={(e) => patch("medications", e.target.value)}
          />
        </Field>

        <p className="flex items-start gap-2 rounded-2xl border border-divider/60 bg-card-2/60 p-3 text-xs leading-relaxed text-ink-3">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
          این اطلاعات فقط برای محدود کردن هوشمند برنامه‌های پیشنهادی ذخیره می‌شود و جایگزین توصیه یا تشخیص پزشک نیست.
        </p>

        <ErrorLine error={submit.error} />

        <div className="flex items-center justify-between gap-3">
          <SavedBadge visible={saved} />
          <Button variant="primary" loading={submit.pending} onClick={() => void save()}>
            ذخیره اطلاعات سلامت
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- diet & equipment ---------- */

function DietSection({ draft, patch, onSaved }: SectionProps) {
  const submit = useSubmit();
  const [saved, flash] = useSavedFlash();

  const parsedDiets = useMemo(() => parseStructuredField(draft.dietaryRestrictions, DIET_PRESETS), [draft.dietaryRestrictions]);
  const toggleDiet = (label: string) => {
    const next = parsedDiets.selected.includes(label)
      ? parsedDiets.selected.filter((s) => s !== label)
      : [...parsedDiets.selected, label];
    patch("dietaryRestrictions", serializeStructuredField(next, parsedDiets.otherText));
  };
  const setDietOther = (otherText: string) => {
    patch("dietaryRestrictions", serializeStructuredField(parsedDiets.selected, otherText));
  };

  const combinedEquipment = useMemo(
    () => [
      ...EQUIPMENT_PRESETS.map((p) => ({ ...p, category: "تجهیزات در دسترس" })),
      ...LIMITATION_PRESETS.map((p) => ({ ...p, category: "محدودیت‌های سبک زندگی و زمان" })),
    ],
    [],
  );
  const parsedEquipment = useMemo(() => parseStructuredField(draft.equipmentNotes, combinedEquipment), [draft.equipmentNotes, combinedEquipment]);
  const toggleEquipment = (label: string) => {
    const next = parsedEquipment.selected.includes(label)
      ? parsedEquipment.selected.filter((s) => s !== label)
      : [...parsedEquipment.selected, label];
    patch("equipmentNotes", serializeStructuredField(next, parsedEquipment.otherText));
  };
  const setEquipmentOther = (otherText: string) => {
    patch("equipmentNotes", serializeStructuredField(parsedEquipment.selected, otherText));
  };

  const save = async () => {
    const result = await submit.run(() =>
      api.profile.patch({
        dietaryRestrictions: draft.dietaryRestrictions.trim() || null,
        dislikedFoods: draft.dislikedFoods.trim() || null,
        preferredFoods: draft.preferredFoods.trim() || null,
        equipmentNotes: draft.equipmentNotes.trim() || null,
      }),
    );
    if (result) {
      flash();
      onSaved();
    }
  };

  return (
    <SettingsSection
      title="تغذیه، تجهیزات و محدودیت‌ها"
      description="انتخاب گزینه‌ای امکانات ورزشی، رژیم‌ها، حساسیت‌ها و محدودیت‌ها"
      summary={draft.dietaryRestrictions.trim() || draft.equipmentNotes.trim() ? "تنظیم‌شده" : "بدون محدودیت"}
    >
      <div className="flex flex-col gap-5">
        <MultiSelectChips
          label="رژیم‌های تغذیه‌ای و حساسیت‌ها"
          hint="گزینه‌های دلخواه یا آلرژی‌ها را انتخاب کنید تا غذاهای نامناسب توصیه نشوند."
          presets={DIET_PRESETS}
          selected={parsedDiets.selected}
          onToggle={toggleDiet}
          otherValue={parsedDiets.otherText}
          onOtherChange={setDietOther}
          otherPlaceholder="رژیم یا حساسیت دیگری دارید؟..."
        />

        <div className="h-[1px] bg-divider/60 my-1" />

        <MultiSelectChips
          label="تجهیزات و محدودیت‌های تمرین"
          hint="وسایل ورزشی در دسترس و محدودیت‌های زمانی یا مکانی را انتخاب کنید."
          presets={combinedEquipment}
          selected={parsedEquipment.selected}
          onToggle={toggleEquipment}
          otherValue={parsedEquipment.otherText}
          onOtherChange={setEquipmentOther}
          otherPlaceholder="تجهیزات یا محدودیت تمرینی دیگر؟..."
        />

        <div className="h-[1px] bg-divider/60 my-1" />

        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <Field label="غذاهایی که دوست ندارید (اختیاری)" htmlFor="pf-dislike" hint="مثلاً: کرفس، بادمجان، کلم‌بروکلی">
            <TextInput id="pf-dislike" value={draft.dislikedFoods} maxLength={300} placeholder="غذاهای ناخوشایند..." onChange={(e) => patch("dislikedFoods", e.target.value)} />
          </Field>
          <Field label="غذاهایی که ترجیح می‌دهید (اختیاری)" htmlFor="pf-prefer" hint="مثلاً: فیله مرغ، زرشک‌پلو، جو دوسر">
            <TextInput id="pf-prefer" value={draft.preferredFoods} maxLength={300} placeholder="غذاهای محبوب..." onChange={(e) => patch("preferredFoods", e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <ErrorLine error={submit.error} />
          <div className="flex items-center justify-between gap-3">
            <SavedBadge visible={saved} />
            <Button variant="primary" loading={submit.pending} onClick={() => void save()}>
              ذخیره تغذیه و تجهیزات
            </Button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- latest body metrics ---------- */

function MetricsSection() {
  const { data, error, loading, reload } = useApiData(() => api.measurements.latest(), []);

  return (
    <SettingsSection
      title="آخرین اندازه‌گیری‌های بدن"
      description="تازه‌ترین مقدار هر شاخصه، با برچسب دقت"
      summary={data && data.items.length > 0 ? `${faNum(data.items.length)} شاخصه` : undefined}
    >
      {loading ? (
        <LoadingState label="در حال خواندن اندازه‌گیری‌ها" rows={2} />
      ) : error ? (
        <ErrorState title="اندازه‌گیری‌ها نمایش داده نشدند" description={error.message} onRetry={reload} />
      ) : data && data.items.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 tablet:grid-cols-3">
            {data.items.map((m) => (
              <MeasurementCard
                key={m.id}
                metric={m.metric}
                value={m.value}
                takenAt={m.takenAt}
                quality={toQuality(m.quality) ?? "self-reported"}
                note={m.note ?? undefined}
              />
            ))}
          </div>
          <p className="text-2xs text-ink-3">
            ثبت کامل اندازه‌گیری‌ها و نمودار روند در بخش پیشرفت است.
            <Link to="/progress" className="ms-1 underline underline-offset-4 hover:text-ink">
              رفتن به پیشرفت
            </Link>
          </p>
        </div>
      ) : (
        <EmptyState
          title="هنوز اندازه‌گیری‌ای ثبت نشده"
          description="با ثبت وزن در بخش پیشرفت شروع کنید تا این کارت‌ها از داده واقعی خودتان پر شوند."
          action={
            <Link
              to="/progress"
              className="rounded-pill border border-line px-4 py-2 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
            >
              رفتن به پیشرفت
            </Link>
          }
        />
      )}
    </SettingsSection>
  );
}

/* ---------- daily nutrition target ---------- */

/** The five machine codes energy.ts can emit, each with a Persian sentence. */
const WARNING_FA: Record<string, string> = {
  sex_not_specified_bmr_approximate: "جنسیت کامل ثبت نشده؛ مبنای محاسبه انرژی تقریبی است.",
  deficit_clamped_to_safe_floor: "انرژی پیشنهادی تا کف ایمن بالا آمد؛ پایین‌تر از آن ایمن نیست.",
  deficit_clamped_to_bmr: "انرژی از حد سوخت‌وساز پایه پایین‌تر نمی‌رود؛ به همین دلیل مقدار تنظیم شد.",
  deficit_rate_capped: "سرعت کاهش وزن به سقف ایمن (حدود یک درصد وزن بدن در هفته) محدود شد.",
  minor_no_restriction: "چون سن کمتر از ۱۸ سال است، هدف کاهش وزن اعمال نشد و انرژی در سطح نیاز روزانه نگه داشته شد.",
};

/** Field names the suggest endpoint can report as missing, in Persian. */
const MISSING_FA: Record<string, string> = {
  sex: "جنسیت",
  birthDate: "تاریخ تولد",
  heightCm: "قد",
  activityLevel: "سطح فعالیت",
  goal: "هدف",
  weight: "وزن (یک اندازه‌گیری ثبت‌شده)",
};

type SuggestionForm = { kcal: string; proteinG: string; carbsG: string; fatG: string; waterMl: string };

function TargetsSection() {
  const targets = useApiData(() => api.nutrition.targets(), []);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<ApiError | string | null>(null);
  const [missingLabels, setMissingLabels] = useState<string[] | null>(null);
  const [suggestion, setSuggestion] = useState<TargetSuggestion | null>(null);
  const [form, setForm] = useState<SuggestionForm | null>(null);
  const saveTarget = useSubmit();
  const [saved, flash] = useSavedFlash();

  const runSuggest = async () => {
    setSuggesting(true);
    setSuggestError(null);
    setMissingLabels(null);
    try {
      const result = await api.nutrition.suggestTargets();
      setSuggestion(result);
      setForm({
        kcal: String(result.kcal),
        proteinG: String(result.proteinG),
        carbsG: String(result.carbsG),
        fatG: String(result.fatG),
        waterMl: String(result.waterMl),
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "profile_incomplete") {
        const tokens = (cause.fields.missing ?? "").split(",").filter(Boolean);
        setMissingLabels(tokens.map((t) => MISSING_FA[t] ?? "مورد دیگری که سرور نام برده"));
      } else {
        setSuggestError(cause instanceof ApiError ? cause : "پیشنهاد محاسبه نشد.");
      }
    } finally {
      setSuggesting(false);
    }
  };

  const values = form
    ? {
        kcal: parseNum(form.kcal),
        proteinG: parseNum(form.proteinG),
        carbsG: parseNum(form.carbsG),
        fatG: parseNum(form.fatG),
        waterMl: parseNum(form.waterMl),
      }
    : null;
  const formInvalid = Boolean(values && (values.kcal === null || values.proteinG === null || values.carbsG === null || values.fatG === null));

  const save = async () => {
    if (!values || formInvalid) return;
    const result = await saveTarget.run(() =>
      api.nutrition.putTargets({
        effectiveFrom: tehranDayKey(),
        kcal: values.kcal as number,
        proteinG: values.proteinG as number,
        carbsG: values.carbsG as number,
        fatG: values.fatG as number,
        waterMl: values.waterMl ?? undefined,
        notes: "ذخیره‌شده از پیشنهاد محاسباتی برنامه",
      }),
    );
    if (result) {
      flash();
      targets.reload();
    }
  };

  const target = targets.data;
  const numberField = (key: keyof SuggestionForm, label: string, unit: string) => (
    <Field label={label} htmlFor={`pf-tgt-${key}`} hint={unit}>
      <TextInput
        id={`pf-tgt-${key}`}
        inputMode="decimal"
        value={form ? form[key] : ""}
        invalid={values?.[key] === null}
        onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
      />
    </Field>
  );

  return (
    <SettingsSection
      title="هدف روزانه تغذیه"
      description="انرژی و درشت‌مغذی‌ها — محاسبات تقریبی‌اند، نه تجویز"
      summary={target ? `${faNum(target.kcal)} کیلوکالری` : "ثبت نشده"}
    >
      <div className="flex flex-col gap-4">
        {targets.loading ? (
          <LoadingState label="در حال خواندن هدف فعلی" rows={2} />
        ) : targets.error ? (
          <ErrorState title="هدف روزانه نمایش داده نشد" description={targets.error.message} onRetry={targets.reload} />
        ) : target ? (
          <Card tone="sunken" className="flex flex-col gap-3">
            <CardHead
              title="هدف فعلی"
              meta={`از ${faDate(target.effectiveFrom)} · ${RECORD_SOURCE_FA[target.source]}`}
              action={<Chip tone="outline">نسخه {faNum(target.version)}</Chip>}
            />
            <div className="grid grid-cols-2 gap-3 tablet:grid-cols-5">
              {[
                { label: "انرژی", value: target.kcal, unit: "کیلوکالری" },
                { label: "پروتئین", value: target.proteinG, unit: "گرم" },
                { label: "کربوهیدرات", value: target.carbsG, unit: "گرم" },
                { label: "چربی", value: target.fatG, unit: "گرم" },
                { label: "آب", value: target.waterMl, unit: "میلی‌لیتر" },
              ].map((row) => (
                <div key={row.label} className="flex flex-col gap-1">
                  <span className="text-2xs text-ink-3">{row.label}</span>
                  <span className="num text-base font-semibold">
                    {faNum(row.value)} <span className="text-2xs font-normal text-ink-3">{row.unit}</span>
                  </span>
                </div>
              ))}
            </div>
            {target.notes ? <p className="text-sm leading-relaxed text-ink-3">{target.notes}</p> : null}
            <p className="text-2xs text-ink-3">این اعداد تقریبی‌اند و تجویز پزشکی یا متخصص تغذیه نیستند.</p>
          </Card>
        ) : (
          <p role="status" className="rounded-md border border-divider bg-card-2 px-3 py-2 text-sm text-ink-2">
            هدف روزانه ثبت نشده. می‌توانید از پیشنهاد محاسباتی شروع کنید.
          </p>
        )}

        {missingLabels && missingLabels.length > 0 ? (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-ink-3 bg-card-2 p-3 text-sm leading-relaxed text-ink">
            <AlertTriangle size={14} className="mt-1 shrink-0" aria-hidden />
            <span>
              برای محاسبه پیشنهادی این موارد لازم‌اند و هنوز کامل نشده‌اند: {missingLabels.join("، ")}.
              اگر وزن است، در بخش پیشرفت یک اندازه‌گیری ثبت کنید؛ بقیه در همین صفحه‌اند.
            </span>
          </div>
        ) : null}

        <ErrorLine error={suggestError} />

        {suggestion && form && values ? (
          <Card tone="raised" className="flex flex-col gap-4">
            <CardHead
              title="پیشنهاد محاسباتی"
              meta={`محاسبه در ${faDate(suggestion.measuredAt)} · همه مقادیر ${DATA_QUALITY_FA[toQuality(suggestion.quality) ?? "estimated"]} هستند`}
            />
            <div className="grid grid-cols-2 gap-3 tablet:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-2xs text-ink-3">سوخت‌وساز پایه (تقریبی)</span>
                <span className="num text-base font-semibold">
                  {faNum(suggestion.bmr)} <span className="text-2xs font-normal text-ink-3">کیلوکالری</span>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xs text-ink-3">کل نیاز روزانه (تقریبی)</span>
                <span className="num text-base font-semibold">
                  {faNum(suggestion.tdee)} <span className="text-2xs font-normal text-ink-3">کیلوکالری</span>
                </span>
              </div>
            </div>

            {suggestion.warnings.length > 0 ? (
              <ul role="status" aria-live="polite" className="flex flex-col gap-2 rounded-md border border-divider bg-card-2 p-3">
                {suggestion.warnings.map((code, i) => (
                  <li key={`${code}-${i}`} className="flex items-start gap-2 text-sm leading-relaxed text-ink-2">
                    <AlertTriangle size={12} className="mt-1 shrink-0" aria-hidden />
                    {WARNING_FA[code] ?? "یکی از مقادیر برای ماندن در محدوده ایمن تنظیم شد."}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="text-sm leading-relaxed text-ink-3">
              پیش از ذخیره می‌توانید اعداد را بازنویسی کنید. این مقادیر تخمینی‌اند؛
              جای نظر پزشک یا متخصص تغذیه را نمی‌گیرند.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 tablet:grid-cols-3">
              {numberField("kcal", "انرژی روزانه", "کیلوکالری")}
              {numberField("proteinG", "پروتئین", "گرم")}
              {numberField("carbsG", "کربوهیدرات", "گرم")}
              {numberField("fatG", "چربی", "گرم")}
              {numberField("waterMl", "آب", "میلی‌لیتر (اختیاری)")}
            </div>

            <ErrorLine error={saveTarget.error} />

            <div className="flex items-center justify-between gap-3">
              <SavedBadge visible={saved} />
              <Button variant="primary" loading={saveTarget.pending} disabled={formInvalid} onClick={() => void save()}>
                ذخیره به‌عنوان هدف روزانه
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs text-ink-3">بر اساس فرمول‌های استاندارد و داده‌های پروفایل شما.</p>
          <Button
            variant="secondary"
            leading={<Calculator size={15} aria-hidden />}
            loading={suggesting}
            onClick={() => void runSuggest()}
          >
            پیشنهاد محاسباتی
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

/* ---------- account ---------- */

function AccountSection({ email }: { email: string }) {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardHead title="حساب کاربری" meta={<span dir="ltr" className="font-mono">{email}</span>} />
      <p className="text-sm leading-relaxed text-ink-3">
        تغییر رمز عبور در این صفحه انجام نمی‌شود. برای بازنشانی، از لینک بازیابی
        استفاده کنید و مراحل را در همان مسیر طی کنید.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/forgot" className="text-2xs text-ink-2 underline underline-offset-4 hover:text-ink">
          بازنشانی رمز عبور
        </Link>
        <Button
          variant="destructive"
          size="sm"
          leading={<LogOut size={14} aria-hidden />}
          loading={busy}
          onClick={() => void handleSignOut()}
        >
          خروج از حساب
        </Button>
      </div>
    </Card>
  );
}

/* ---------- page ---------- */

export function Profile() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const profileData = useApiData(() => api.profile.get(), []);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    const p = profileData.data?.profile;
    if (p && draft === null) setDraft(fromProfile(p));
  }, [profileData.data, draft]);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const onSaved = () => {
    profileData.reload();
    void refresh();
  };

  if (profileData.loading) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <SectionTitle title="پروفایل" description="مشخصات، سلامت و هدف‌هایی که برنامه از آن‌ها می‌سازد." />
        <LoadingState label="در حال بارگذاری پروفایل" rows={6} />
      </div>
    );
  }

  if (profileData.error || !profileData.data) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <SectionTitle title="پروفایل" />
        <ErrorState
          title="پروفایل بارگذاری نشد"
          description={profileData.error?.message ?? "به اطلاعات پروفایل دسترسی نداریم."}
          onRetry={profileData.reload}
        />
      </div>
    );
  }

  const server = profileData.data.profile;

  if (!server) {
    return (
      <div className="flex flex-col gap-6 py-6">
        <SectionTitle title="پروفایل" description="مشخصات، سلامت و هدف‌هایی که برنامه از آن‌ها می‌سازد." />
        <Card tone="sunken" padded={false}>
          <EmptyState
            title="پروفایل شما هنوز ساخته نشده"
            description="با چند پرسش کوتاه شروع کنید تا برنامه تمرین و تغذیه از داده واقعی شما بسازد."
            action={
              <Button variant="primary" onClick={() => navigate("/onboarding")}>
                شروع آشناسازی
              </Button>
            }
          />
        </Card>
        <AccountSection email={profileData.data.email} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <SectionTitle title="پروفایل" description="هر بخش جدا ذخیره می‌شود؛ تغییرات یک بخش، بخش‌های دیگر را دست نمی‌زند." />

      <Card tone="sunken" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{server.displayName || "بی‌نام"}</p>
          <p dir="ltr" className="truncate text-left font-mono text-2xs text-ink-3">
            {profileData.data.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="outline">{server.ageYears !== null ? `سن ${faNum(server.ageYears)}` : "سن محاسبه نشده"}</Chip>
          <Chip tone="outline">{server.heightCm !== null ? `قد ${faNum(server.heightCm)} سانتی‌متر` : "قد ثبت نشده"}</Chip>
          <Chip tone="outline">{server.goal ? GOAL_TYPE_FA[server.goal] : "هدف ثبت نشده"}</Chip>
        </div>
      </Card>

      {draft ? (
        <>
          <IdentitySection draft={draft} patch={patch} onSaved={onSaved} />
          <ActivitySection draft={draft} patch={patch} onSaved={onSaved} />
          <ScheduleSection draft={draft} patch={patch} onSaved={onSaved} />
          <SafetySection draft={draft} patch={patch} onSaved={onSaved} />
          <DietSection draft={draft} patch={patch} onSaved={onSaved} />
        </>
      ) : null}

      <MetricsSection />
      <TargetsSection />
      <AccountSection email={profileData.data.email} />
    </div>
  );
}
