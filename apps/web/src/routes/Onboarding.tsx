import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button, Card, Choice, Field, Meter, SectionTitle, TextInput } from "../components/ui";
import { DateField } from "../components/DateField";
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
import { api, type ProfileFields } from "../lib/api";
import {
  ACTIVITY_LEVEL_FA,
  GOAL_TYPE_FA,
  SEX_FA,
  TRAINING_EXPERIENCE_FA,
  type ActivityLevel,
  type GoalType,
  type Sex,
  type TrainingExperience,
} from "../lib/domain";
import { FA_WEEKDAY_LONG } from "../lib/persian";
import { toJalaliParts } from "../lib/jalali";
import { faNum, parseFaNumber } from "../lib/format";
import { useSession } from "../lib/session";
import { useSubmit } from "../lib/useApiData";

/**
 * The six profile steps the plan defines. Each step is one partial PATCH, so a
 * half-finished onboarding is not lost if the browser closes — the server keeps
 * `onboardingStep` and this page resumes from it.
 */

const STEP_TITLES = [
  "مشخصات فردی",
  "فعالیت و سابقه تمرین",
  "هدف شما",
  "سلامت و ایمنی",
  "تغذیه",
  "تجهیزات و زمان‌بندی",
] as const;

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

const EMPTY: Draft = {
  displayName: "",
  sex: null,
  birthDate: null,
  heightCm: "",
  activityLevel: null,
  trainingExperience: null,
  goal: null,
  maxWorkoutMinutes: "60",
  trainingDays: [],
  injuries: "",
  medicalConditions: "",
  medications: "",
  dietaryRestrictions: "",
  dislikedFoods: "",
  preferredFoods: "",
  equipmentNotes: "",
};

const fromProfile = (p: ProfileFields): Draft => ({
  displayName: p.displayName ?? "",
  sex: p.sex,
  birthDate: p.birthDate ? new Date(p.birthDate) : null,
  heightCm: p.heightCm === null ? "" : String(p.heightCm),
  activityLevel: p.activityLevel,
  trainingExperience: p.trainingExperience,
  goal: p.goal,
  maxWorkoutMinutes: String(p.maxWorkoutMinutes ?? 60),
  trainingDays: p.trainingDays,
  injuries: p.injuries ?? "",
  medicalConditions: p.medicalConditions ?? "",
  medications: p.medications ?? "",
  dietaryRestrictions: p.dietaryRestrictions ?? "",
  dislikedFoods: p.dislikedFoods ?? "",
  preferredFoods: p.preferredFoods ?? "",
  equipmentNotes: p.equipmentNotes ?? "",
});

const num = (value: string): number | undefined => {
  const parsed = parseFaNumber(value);
  return parsed !== null && parsed > 0 ? parsed : undefined;
};

export function Onboarding() {
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const submit = useSubmit();
  const [step, setStep] = useState(Math.min(Math.max(user?.onboardingStep ?? 0, 0), 5));
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void api.profile
      .get()
      .then((payload) => {
        if (!active) return;
        if (payload.profile) setDraft(fromProfile(payload.profile));
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      active = false;
    };
  }, []);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const ageYears = useMemo(() => {
    if (!draft.birthDate) return null;
    const { jy } = toJalaliParts(new Date());
    return jy - toJalaliParts(draft.birthDate).jy;
  }, [draft.birthDate]);

  // Structured helpers for step 3, 4, 5
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

  const stepValid = (() => {
    switch (step) {
      case 0:
        return Boolean(draft.sex && draft.birthDate && num(draft.heightCm));
      case 1:
        return Boolean(draft.activityLevel && draft.trainingExperience);
      case 2:
        return Boolean(draft.goal);
      case 3:
      case 4:
      case 5:
        return true;
      default:
        return false;
    }
  })();

  const save = async () => {
    const nextStep = step + 1;
    const body: Record<string, unknown> = {
      displayName: draft.displayName.trim() || null,
      sex: draft.sex,
      birthDate: draft.birthDate ? draft.birthDate.toISOString() : null,
      heightCm: num(draft.heightCm) ?? null,
      activityLevel: draft.activityLevel,
      trainingExperience: draft.trainingExperience,
      goal: draft.goal,
      maxWorkoutMinutes: num(draft.maxWorkoutMinutes) ?? null,
      trainingDays: draft.trainingDays,
      injuries: draft.injuries.trim() || null,
      medicalConditions: draft.medicalConditions.trim() || null,
      medications: draft.medications.trim() || null,
      dietaryRestrictions: draft.dietaryRestrictions.trim() || null,
      dislikedFoods: draft.dislikedFoods.trim() || null,
      preferredFoods: draft.preferredFoods.trim() || null,
      equipmentNotes: draft.equipmentNotes.trim() || null,
      onboardingStep: nextStep,
    };
    const saved = await submit.run(() => api.profile.patch(body));
    if (!saved) return;
    await refresh();
    if (nextStep >= 6) {
      navigate("/?onboarded=1", { replace: true });
      return;
    }
    setStep(nextStep);
  };

  if (!ready) return <Card className="mx-auto max-w-[560px]">در حال بارگذاری اطلاعات…</Card>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-3">
        <SectionTitle
          title={STEP_TITLES[step]}
          description={`مرحله ${faNum(step + 1)} از ${faNum(6)} — هر مرحله جدا ذخیره می‌شود.`}
        />
        <Meter value={step + 1} max={6} valueLabel={`${faNum(Math.round(((step + 1) / 6) * 100))}٪`} />
      </header>

      {submit.error ? (
        <p role="alert" className="rounded-md border border-ink-3 bg-card-2 px-3 py-2 text-sm text-ink">
          {typeof submit.error === "string" ? submit.error : submit.error.message}
        </p>
      ) : null}

      <Card className="flex flex-col gap-4">
        {step === 0 ? (
          <>
            <Field label="نام شما" htmlFor="ob-name" hint="برای خودش‌نمایش در سربرگ برنامه.">
              <TextInput id="ob-name" value={draft.displayName} onChange={(e) => patch("displayName", e.target.value)} />
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink-2">جنسیت</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SEX_FA) as Sex[]).map((s) => (
                  <Choice key={s} selected={draft.sex === s} onClick={() => patch("sex", s)}>
                    {SEX_FA[s]}
                  </Choice>
                ))}
              </div>
            </div>
            <DateField
              label="تاریخ تولد"
              value={draft.birthDate}
              onChange={(d) => patch("birthDate", d)}
              hint="بر اساس آن سن محاسبه می‌شود؛ معیارهای بزرگسالان برای زیر ۱۸ سال اعمال نمی‌شود."
            />
            <Field label="قد" htmlFor="ob-height" hint="سانتی‌متر">
              <TextInput id="ob-height" inputMode="decimal" value={draft.heightCm} onChange={(e) => patch("heightCm", e.target.value)} />
            </Field>
            {ageYears !== null && ageYears < 18 ? (
              <p className="flex items-start gap-2 rounded-md border border-ink-3 bg-card-2 p-3 text-sm leading-relaxed text-ink">
                <ShieldAlert size={14} className="mt-1 shrink-0" aria-hidden />
                سن شما کمتر از ۱۸ سال محاسبه می‌شود. طبقه‌بندی BMI بزرگسالان و توصیه‌های
                کاهش وزن بزرگسالان روی شما اعمال نمی‌شود؛ برنامه‌ریزی باید با ناظر بالینی انجام شود.
              </p>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink-2">سطح فعالیت روزانه</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACTIVITY_LEVEL_FA) as ActivityLevel[]).map((a) => (
                  <Choice key={a} selected={draft.activityLevel === a} onClick={() => patch("activityLevel", a)}>
                    {ACTIVITY_LEVEL_FA[a]}
                  </Choice>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-ink-2">سابقه تمرین</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TRAINING_EXPERIENCE_FA) as TrainingExperience[]).map((t) => (
                  <Choice key={t} selected={draft.trainingExperience === t} onClick={() => patch("trainingExperience", t)}>
                    {TRAINING_EXPERIENCE_FA[t]}
                  </Choice>
                ))}
              </div>
            </div>
            <Field label="حداکثر زمان هر جلسه" htmlFor="ob-min" hint="دقیقه — بیشتر از این، تمرین پیشنهاد نمی‌شود.">
              <TextInput
                id="ob-min"
                inputMode="numeric"
                value={draft.maxWorkoutMinutes}
                onChange={(e) => patch("maxWorkoutMinutes", e.target.value)}
              />
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(GOAL_TYPE_FA) as GoalType[]).map((g) => (
                <Choice key={g} selected={draft.goal === g} onClick={() => patch("goal", g)}>
                  {GOAL_TYPE_FA[g]}
                </Choice>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-ink-3">
              هدف، محاسبه انرژی و ساختار تمرین را عوض می‌کند. بعداً در پروفایل قابل تغییر است.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <>
            <MultiSelectChips
              label="آسیب‌دیدگی یا درد مفاصل و عضلات"
              hint="گزینه‌های مرتبط را انتخاب کنید. هوش مصنوعی حرکات مضر را از برنامه تمرین شما حذف خواهد کرد."
              presets={INJURY_PRESETS}
              selected={parsedInjuries.selected}
              onToggle={toggleInjury}
              otherValue={parsedInjuries.otherText}
              onOtherChange={setInjuryOther}
              otherPlaceholder="آسیب خاص دیگری دارید؟ اینجا بنویسید..."
            />

            <div className="h-[1px] bg-divider/60 my-1" />

            <MultiSelectChips
              label="بیماری‌های زمینه‌ای و شرایط فیزیولوژیک"
              hint="برای بهینه‌سازی ایمنی تمرین و هشدارهای سلامتی."
              presets={MEDICAL_PRESETS}
              selected={parsedMedical.selected}
              onToggle={toggleMedical}
              otherValue={parsedMedical.otherText}
              onOtherChange={setMedicalOther}
              otherPlaceholder="بیماری یا شرایط دیگری مدنظرتان است؟..."
            />

            <Field label="داروهای جاری (اختیاری)" htmlFor="ob-drug" hint="اگر داروی خاصی مصرف می‌کنید که بر ضربان یا انرژی اثر دارد:">
              <TextInput id="ob-drug" value={draft.medications} placeholder="نام دارو (در صورت مصرف)..." onChange={(e) => patch("medications", e.target.value)} />
            </Field>

            <p className="flex items-start gap-2 rounded-2xl border border-divider/60 bg-card-2/60 p-3 text-xs leading-relaxed text-ink-3">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
              این اطلاعات فقط جهت ایمن‌سازی حرکات تمرینی است و هرگز جایگزین تشخیص و نسخهٔ پزشک نمی‌شود.
            </p>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <MultiSelectChips
              label="رژیم‌ها، حساسیت‌ها و محدودیت‌های غذایی"
              hint="رژیم دلخواه یا هرگونه حساسیت و عدم تحمل را انتخاب کنید تا غذاهای نامناسب پیشنهاد نشوند."
              presets={DIET_PRESETS}
              selected={parsedDiets.selected}
              onToggle={toggleDiet}
              otherValue={parsedDiets.otherText}
              onOtherChange={setDietOther}
              otherPlaceholder="رژیم یا حساسیت غذایی دیگری دارید؟..."
            />

            <div className="h-[1px] bg-divider/60 my-1" />

            <Field label="غذاهایی که دوست ندارید (اختیاری)" htmlFor="ob-dislike" hint="با کاما یا ویرگول جدا کنید، مثلاً: کرفس، بادمجان، سیرابی">
              <TextInput id="ob-dislike" value={draft.dislikedFoods} placeholder="غذاهای ناخوشایند..." onChange={(e) => patch("dislikedFoods", e.target.value)} />
            </Field>

            <Field label="غذاهای مورد علاقه (اختیاری)" htmlFor="ob-prefer" hint="مثلاً: فیله مرغ، جو دوسر، عدسی، پاستا">
              <TextInput id="ob-prefer" value={draft.preferredFoods} placeholder="غذاهای محبوب..." onChange={(e) => patch("preferredFoods", e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-ink">روزهایی که می‌توانید تمرین کنید</span>
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
            </div>

            <div className="h-[1px] bg-divider/60 my-1" />

            <MultiSelectChips
              label="تجهیزات و محدودیت‌های تمرینی"
              hint="تجهیزاتی که در خانه یا باشگاه دارید و هرگونه محدودیت زمانی یا مکانی را مشخص کنید."
              presets={combinedEquipment}
              selected={parsedEquipment.selected}
              onToggle={toggleEquipment}
              otherValue={parsedEquipment.otherText}
              onOtherChange={setEquipmentOther}
              otherPlaceholder="امکانات یا محدودیت تمرینی خاص دیگری دارید؟..."
            />
          </>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            variant="ghost"
            leading={<ArrowLeft size={15} className="rotate-180" aria-hidden />}
            disabled={step === 0 || submit.pending}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            مرحله قبل
          </Button>
          <Button variant="primary" loading={submit.pending} disabled={!stepValid} onClick={() => void save()}>
            {step === 5 ? "پایان و شروع" : "ذخیره و ادامه"}
          </Button>
        </div>
      </Card>

      <p className="text-center text-2xs text-ink-3">
        می‌توانید بعداً هم هر چیزی را در بخش پروفایل تغییر دهید.
      </p>
    </div>
  );
}
