import { useState } from "react";
import {
  Activity,
  Droplets,
  Dumbbell,
  Flame,
  Info,
  Plus,
  Scale,
  Target,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Chip,
  Choice,
  Field,
  IconButton,
  Meter,
  SectionTitle,
  Segmented,
  TextInput,
  Textarea,
} from "../components/ui";
import type { SegmentOption } from "../components/ui";
import { StatCard } from "../components/StatCard";
import { ChartCard, type ChartPoint } from "../components/ChartCard";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { DateField } from "../components/DateField";
import { MeasurementCard } from "../components/MeasurementCard";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { api } from "../lib/api";
import type { ApiQuality, ApiUnit, GoalDto } from "../lib/api";
import {
  DATA_QUALITY_FA,
  GOAL_TYPE_FA,
  METRIC_FA,
  METRIC_UNIT,
  RECORDABLE_METRICS,
} from "../lib/domain";
import type { DataQuality, GoalType, MeasurementMetric } from "../lib/domain";
import { adherenceSentence, toQuality } from "../lib/adapters";
import { faDate, faDelta, faNum, parseFaNumber } from "../lib/format";
import { fromJalali, toApiDate, todayJalali } from "../lib/jalali";
import { useApiData, useSubmit } from "../lib/useApiData";

type RecordableMetric = (typeof RECORDABLE_METRICS)[number];
const QUALITY_OPTIONS: ReadonlyArray<DataQuality> = ["measured", "estimated", "self-reported"];

const QUALITY_TO_API: Record<DataQuality, ApiQuality> = {
  measured: "measured",
  estimated: "estimated",
  "self-reported": "self_reported",
};

const GOAL_STATUS_FA: Record<GoalDto["status"], string> = {
  active: "در جریان",
  achieved: "محقق‌شده",
  paused: "متوقف‌شده",
  abandoned: "رهاشده",
};

const UNIT_FA_BY_API: Record<ApiUnit, string> = {
  kg: "کیلوگرم",
  cm: "سانتی‌متر",
  percent: "٪",
  bpm: "ضربان در دقیقه",
  score: "",
};

const unitFa = (unit: ApiUnit): string => UNIT_FA_BY_API[unit];
const unitDigits = (unit: ApiUnit): number => (unit === "bpm" || unit === "score" ? 0 : 1);

const GOAL_UNITS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "kg", label: "کیلوگرم" },
  { value: "percent", label: "٪" },
  { value: "cm", label: "سانتی‌متر" },
  { value: "bpm", label: "ضربان در دقیقه" },
  { value: "جلسه", label: "جلسه" },
  { value: "روز", label: "روز" },
  { value: "دقیقه", label: "دقیقه" },
];

const goalUnitFa = (unit: string | null): string =>
  unit === null ? "" : GOAL_UNITS.find((u) => u.value === unit)?.label ?? unit;

const METRIC_LIMITS: Record<RecordableMetric, { min: number; max: number }> = {
  weight: { min: 25, max: 300 },
  leanMass: { min: 20, max: 200 },
  bodyFat: { min: 3, max: 70 },
  waist: { min: 40, max: 200 },
  hip: { min: 50, max: 220 },
  neck: { min: 20, max: 80 },
  restingHeartRate: { min: 30, max: 220 },
  soreness: { min: 0, max: 10 },
};

const chartTickFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "short" });
const chartLabel = (iso: string): string => chartTickFmt.format(new Date(iso));

const todayDate = (): Date | null => {
  const t = todayJalali();
  return fromJalali(t.jy, t.jm, t.jd);
};

const RANGE_OPTIONS: ReadonlyArray<SegmentOption<"7" | "30" | "90">> = [
  { value: "7", label: `${faNum(7)} روز` },
  { value: "30", label: `${faNum(30)} روز` },
  { value: "90", label: `${faNum(90)} روز` },
];

const PROGRESS_TABS: ReadonlyArray<SegmentOption<"overview" | "body" | "goals">> = [
  { value: "overview", label: "روند و آمار" },
  { value: "body", label: "شاخص‌های بدنی" },
  { value: "goals", label: "اهداف من" },
];

type PendingDelete = {
  kind: "measurement" | "goal";
  id: string;
  title: string;
  detail: string;
};

export function Progress() {
  const [activeTab, setActiveTab] = useState<"overview" | "body" | "goals">("overview");
  const [daysKey, setDaysKey] = useState<"7" | "30" | "90">("30");
  const days = Number(daysKey);

  const range = useApiData(() => api.progress.range({ days }), [days]);
  const weightSeries = useApiData(() => api.progress.series("weight", days), [days]);
  const fatSeries = useApiData(() => api.progress.series("bodyFat", days), [days]);
  const measurementsList = useApiData(() => api.measurements.list(), []);
  const latest = useApiData(() => api.measurements.latest(), []);
  const goalsList = useApiData(() => api.progress.goals(), []);

  const reloadBody = () => {
    measurementsList.reload();
    latest.reload();
    weightSeries.reload();
    fatSeries.reload();
    range.reload();
  };

  /* ---------- Measurement Form State ---------- */
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [metric, setMetric] = useState<RecordableMetric>("weight");
  const [rawValue, setRawValue] = useState("");
  const [quality, setQuality] = useState<DataQuality>("measured");
  const [takenAt, setTakenAt] = useState<Date | null>(todayDate);
  const [note, setNote] = useState("");
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addFlash, setAddFlash] = useState<string | null>(null);
  const addSubmit = useSubmit();

  const limit = METRIC_LIMITS[metric];
  const metricUnit = METRIC_UNIT[metric];

  const submitMeasurement = async () => {
    setAddFlash(null);
    const errs: Record<string, string> = {};
    const parsed = parseFaNumber(rawValue);
    if (parsed === null) {
      errs.value = "مقدار باید یک عدد باشد.";
    } else if (parsed < limit.min || parsed > limit.max) {
      const unit = unitFa(metricUnit);
      errs.value = `مقدار ${METRIC_FA[metric]} باید بین ${faNum(limit.min)} تا ${faNum(limit.max)}${unit ? ` ${unit}` : ""} باشد.`;
    }
    if (!takenAt) errs.date = "تاریخ اندازه‌گیری را انتخاب کنید.";
    setAddErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const body: Parameters<typeof api.measurements.create>[0] = {
      metric: metric as MeasurementMetric,
      value: parsed as number,
      takenAt: toApiDate(takenAt as Date),
      quality: QUALITY_TO_API[quality],
    };
    if (note.trim()) body.note = note.trim();

    const created = await addSubmit.run(() => api.measurements.create(body));
    if (created) {
      setRawValue("");
      setNote("");
      setAddErrors({});
      setAddFlash("اندازه‌گیری با موفقیت ثبت شد.");
      setShowAddMeasurement(false);
      reloadBody();
    }
  };

  /* ---------- Goal Form State ---------- */
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>("lose_fat");
  const [rawTarget, setRawTarget] = useState("");
  const [goalUnit, setGoalUnit] = useState("kg");
  const [goalStart, setGoalStart] = useState<Date | null>(todayDate);
  const [goalTargetDate, setGoalTargetDate] = useState<Date | null>(null);
  const [goalNotes, setGoalNotes] = useState("");
  const [goalErrors, setGoalErrors] = useState<Record<string, string>>({});
  const [goalFlash, setGoalFlash] = useState<string | null>(null);
  const goalAddSubmit = useSubmit();
  const goalPatchSubmit = useSubmit();

  const submitGoal = async () => {
    setGoalFlash(null);
    const errs: Record<string, string> = {};
    const body: Record<string, unknown> = { type: goalType };
    if (goalStart) body.startDate = toApiDate(goalStart);
    if (rawTarget.trim() !== "") {
      const parsed = parseFaNumber(rawTarget);
      if (parsed === null) {
        errs.target = "مقدار هدف باید یک عدد باشد.";
      } else if (parsed < 0 || parsed > 1000) {
        errs.target = "مقدار هدف باید بین ۰ تا ۱۰۰۰ باشد.";
      } else {
        body.targetValue = parsed;
      }
    }
    if (goalUnit.trim()) body.unit = goalUnit.trim().slice(0, 20);
    if (goalTargetDate) body.targetDate = toApiDate(goalTargetDate);
    if (goalNotes.trim()) body.notes = goalNotes.trim().slice(0, 1000);
    setGoalErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const created = await goalAddSubmit.run(() => api.progress.createGoal(body));
    if (created) {
      setRawTarget("");
      setGoalNotes("");
      setGoalErrors({});
      setGoalFlash("هدف با موفقیت افزوده شد.");
      setShowAddGoal(false);
      goalsList.reload();
    }
  };

  const changeGoalStatus = async (id: string, status: GoalDto["status"]) => {
    const patched = await goalPatchSubmit.run(() => api.progress.patchGoal(id, { status }));
    if (patched) goalsList.reload();
  };

  /* ---------- Delete Confirmation ---------- */
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const deleteSubmit = useSubmit();

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const done = await deleteSubmit.run(() =>
      target.kind === "measurement" ? api.measurements.remove(target.id) : api.progress.deleteGoal(target.id),
    );
    if (done) {
      setPendingDelete(null);
      if (target.kind === "measurement") reloadBody();
      else goalsList.reload();
    }
  };

  const summary = range.data?.summary ?? null;
  const latestItems = latest.data?.items ?? [];
  const hasBmi = latestItems.some((m) => m.metric === "bmi");
  const recentMeasurements = (measurementsList.data?.items ?? []).slice().reverse();

  const weightPoints: ChartPoint[] = (weightSeries.data?.points ?? []).map((p) => ({
    label: chartLabel(p.at),
    value: p.value,
  }));
  const fatPoints: ChartPoint[] = (fatSeries.data?.points ?? []).map((p) => ({
    label: chartLabel(p.at),
    value: p.value,
  }));
  const kcalPoints: ChartPoint[] = (range.data?.days ?? []).map((d) => ({
    label: chartLabel(d.date),
    value: d.dataQuality === "missing" ? null : d.kcalConsumed,
  }));

  return (
    <div className="flex flex-col gap-6 py-6 animate-rise">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <SectionTitle
          title="پیشرفت و روند آمادگی"
          description={summary ? adherenceSentence(summary) : "نمایش جامع شاخص‌های ترکیب بدنی، آمار هفتگی و اهداف ورزشی"}
        />
      </div>

      {/* Modern 3-Tab Segmented Sub-Navigation */}
      <div className="mx-auto flex w-full max-w-md items-center justify-center">
        <Segmented
          label="بخش پیشرفت"
          value={activeTab}
          onChange={setActiveTab}
          options={PROGRESS_TABS}
        />
      </div>

      {/* ============================================================
          TAB 1: OVERVIEW & TRENDS (روند و آمار)
          ============================================================ */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6 animate-rise">
          {/* Range Selector */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">بازه بررسی آمار:</span>
            <div className="w-auto min-w-[200px]">
              <Segmented
                options={RANGE_OPTIONS}
                value={daysKey}
                onChange={setDaysKey}
                label="بازه زمانی"
              />
            </div>
          </div>

          {/* KPI Summary Cards */}
          {range.loading ? (
            <LoadingState label="در حال محاسبه شاخص‌های پیشرفت" rows={2} />
          ) : range.error || !summary ? (
            <ErrorState
              title="خطا در دریافت خلاصه آمار"
              description={range.error?.message ?? "اطلاعات این بازه زمانی در دسترس نیست."}
              onRetry={range.reload}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3.5 desktop:grid-cols-4">
              <StatCard
                label="جلسات تمرین انجام‌شده"
                value={`${faNum(summary.workoutsDone)}/${faNum(summary.workoutsPlanned)}`}
                unit="جلسه"
                icon={Dumbbell}
              />
              <StatCard label="روزهای تداوم پیوسته" value={faNum(summary.streakDays)} unit="روز" icon={Activity} />
              <StatCard
                label="میانگین کالری روزانه"
                value={faNum(summary.kcalAverage)}
                unit="ک‌کال"
                icon={Flame}
                deltaLabel={summary.targetKcal ? `هدف ${faNum(summary.targetKcal)}` : undefined}
              />
              <StatCard
                label="میانگین پروتئین دریافتی"
                value={faNum(summary.proteinAverage)}
                unit="گرم"
                icon={Droplets}
              />
              <StatCard
                label="میانگین آب مصرفی"
                value={faNum(summary.waterAverage)}
                unit="میلی‌لیتر"
                icon={Droplets}
              />
              <StatCard
                label="تغییر وزن در این بازه"
                value={summary.weightChangeKg === null ? "—" : faDelta(summary.weightChangeKg, 1)}
                unit={summary.weightChangeKg === null ? "داده ناقص" : "کیلوگرم"}
                icon={Scale}
              />
              <StatCard
                label="تغییر چربی بدن"
                value={summary.bodyFatChangePct === null ? "—" : faDelta(summary.bodyFatChangePct, 1)}
                unit={summary.bodyFatChangePct === null ? "داده ناقص" : "٪"}
                icon={Scale}
              />
              <Card className="flex flex-col justify-center gap-2 p-4">
                <Meter
                  stacked
                  value={summary.adherencePct}
                  label="میزان پایبندی به برنامه"
                  valueLabel={`${faNum(summary.adherencePct)}٪`}
                />
                <p className="text-2xs text-ink-3">
                  {`بر مبنای ${faNum(summary.daysWithData)} روز از ${faNum(summary.days)} روز دارای داده ثبت‌شده`}
                </p>
              </Card>
            </div>
          )}

          {/* Interactive Trends Charts */}
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-bold text-ink">نمودارهای تغییرات در طول زمان</h3>
            <div className="grid grid-cols-1 gap-4 split:grid-cols-2 desktop:grid-cols-3">
              {weightSeries.loading ? (
                <LoadingState label="روند وزن" rows={2} />
              ) : weightSeries.error ? (
                <ErrorState title="روند وزن موجود نیست" description={weightSeries.error.message} onRetry={weightSeries.reload} />
              ) : (
                <ChartCard title="روند تغییرات وزن" meta={`${faNum(days)} روز اخیر`} points={weightPoints} unit="کیلوگرم" variant="area" />
              )}

              {fatSeries.loading ? (
                <LoadingState label="روند درصد چربی" rows={2} />
              ) : fatSeries.error ? (
                <ErrorState title="روند چربی موجود نیست" description={fatSeries.error.message} onRetry={fatSeries.reload} />
              ) : (
                <ChartCard title="روند درصد چربی بدن" meta={`${faNum(days)} روز اخیر`} points={fatPoints} unit="٪" variant="line" />
              )}

              {range.loading ? (
                <LoadingState label="روند انرژی" rows={2} />
              ) : range.error ? (
                <ErrorState title="روند کالری موجود نیست" description={range.error.message} onRetry={range.reload} />
              ) : (
                <ChartCard title="کالری مصرفی روزانه" meta={`${faNum(days)} روز اخیر`} points={kcalPoints} unit="ک‌کال" variant="line" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: BODY COMPOSITION (شاخص‌های بدنی)
          ============================================================ */}
      {activeTab === "body" && (
        <div className="flex flex-col gap-6 animate-rise">
          {/* Top Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink">آخرین اندازه‌گیری‌های ترکیب بدنی</h3>
              <p className="text-2xs text-ink-3">هر مقدار با روش اندازه‌گیری و کیفیت ثبت می‌شود.</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              leading={<Plus size={14} />}
              onClick={() => setShowAddMeasurement((v) => !v)}
            >
              {showAddMeasurement ? "بستن فرم" : "ثبت اندازه‌گیری جدید"}
            </Button>
          </div>

          {/* Add Measurement Collapsible Form */}
          {showAddMeasurement && (
            <Card className="flex flex-col gap-4 p-5 animate-scale-pop border-line shadow-card">
              <CardHead
                title="ثبت اندازه جدید"
                meta="شاخص توده بدنی (BMI) خودکار از قد و وزن محاسبه می‌شود."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="شاخص بدنی" htmlFor="me-metric">
                  <select
                    id="me-metric"
                    className="h-11 w-full rounded-full border border-line bg-card-2 px-4 text-base text-ink focus:border-ink focus:outline-none"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as RecordableMetric)}
                  >
                    {RECORDABLE_METRICS.map((m) => (
                      <option key={m} value={m}>
                        {METRIC_FA[m]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="مقدار عددی"
                  htmlFor="me-value"
                  hint={`${faNum(limit.min)} تا ${faNum(limit.max)}${unitFa(metricUnit) ? ` ${unitFa(metricUnit)}` : ""}`}
                  error={addErrors.value}
                >
                  <TextInput
                    id="me-value"
                    className="num"
                    inputMode="decimal"
                    placeholder={`مثلاً ${metric === "weight" ? "۸۲.۵" : "۱۵"}`}
                    value={rawValue}
                    onChange={(e) => setRawValue(e.target.value)}
                    invalid={Boolean(addErrors.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink-2">روش اندازه‌گیری (کیفیت داده)</span>
                <div className="flex flex-wrap gap-2">
                  {QUALITY_OPTIONS.map((q) => (
                    <Choice key={q} selected={quality === q} onClick={() => setQuality(q)}>
                      {DATA_QUALITY_FA[q]}
                    </Choice>
                  ))}
                </div>
              </div>

              <DateField label="تاریخ اندازه‌گیری" value={takenAt} onChange={setTakenAt} />
              {addErrors.date ? (
                <p role="alert" className="-mt-2 text-sm text-ink">
                  {addErrors.date}
                </p>
              ) : null}

              <Field label="یادداشت و جزئیات" htmlFor="me-note" hint="اختیاری">
                <Textarea
                  id="me-note"
                  value={note}
                  placeholder="مثلاً صبح ناشتا با ترازوی دیجیتال"
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                />
              </Field>

              {addSubmit.error ? (
                <p role="alert" className="text-sm text-ink bg-card-2 p-3 rounded-2xl border border-line">
                  {addSubmit.error.message}
                </p>
              ) : null}

              {addFlash ? <p role="status" className="text-sm text-ink-2">{addFlash}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAddMeasurement(false)}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={addSubmit.pending}
                  onClick={() => void submitMeasurement()}
                >
                  ذخیره اندازه‌گیری
                </Button>
              </div>
            </Card>
          )}

          {/* Current Body Metrics Grid */}
          {latest.loading ? (
            <LoadingState label="در حال دریافت شاخص‌های ترکیب بدنی" rows={2} />
          ) : latestItems.length === 0 ? (
            <EmptyState
              title="هنوز اندازه‌گیری‌ای ثبت نشده است"
              description="با ثبت وزن و درصد چربی، وضعیت بدنی‌تان در این بخش به شکل نمودار و جدول نمایش داده می‌شود."
              action={
                <Button size="sm" variant="primary" onClick={() => setShowAddMeasurement(true)}>
                  ثبت اولین اندازه
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
                {latestItems.map((m) => (
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

              {hasBmi && (
                <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-3 px-1">
                  <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                  شاخص توده بدنی (BMI) خودکار محاسبه می‌شود و به تنهایی بیانگر تناسب اندام یا توده عضلانی نیست.
                </p>
              )}
            </div>
          )}

          {/* Measurement History Table */}
          {recentMeasurements.length > 0 && (
            <Card className="flex flex-col gap-3 p-4 shadow-card">
              <CardHead
                title="تاریخچه اندازه‌گیری‌ها"
                meta={`${faNum(recentMeasurements.length)} رکورد ثبت‌شده`}
              />
              <div className="divide-y divide-divider overflow-hidden rounded-2xl border border-divider">
                {recentMeasurements.slice(0, 15).map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3.5 bg-card-2/50 hover:bg-card-2 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card-3 text-ink text-xs font-bold">
                        {METRIC_FA[m.metric].slice(0, 2)}
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-ink">{METRIC_FA[m.metric]}</span>
                        <span className="block text-2xs text-ink-3">
                          {faDate(m.takenAt)} · {DATA_QUALITY_FA[toQuality(m.quality) ?? "self-reported"]}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="num text-base font-bold text-ink">
                        {faNum(m.value, unitDigits(m.unit))} {unitFa(m.unit)}
                      </span>
                      <IconButton
                        label="حذف این رکورد"
                        size="sm"
                        onClick={() =>
                          setPendingDelete({
                            kind: "measurement",
                            id: m.id,
                            title: "حذف اندازه‌گیری",
                            detail: `${METRIC_FA[m.metric]} — ${faNum(m.value)} ${unitFa(m.unit)}`,
                          })
                        }
                      >
                        <Trash2 size={13} aria-hidden />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ============================================================
          TAB 3: FITNESS GOALS (اهداف من)
          ============================================================ */}
      {activeTab === "goals" && (
        <div className="flex flex-col gap-6 animate-rise">
          {/* Top Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-ink">اهداف ورزشی و بدنی</h3>
              <p className="text-2xs text-ink-3">تعیین مقاصد کاهش چربی، ساخت عضله یا استقامت با ضرب‌الاجل مشخص.</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              leading={<Plus size={14} />}
              onClick={() => setShowAddGoal((v) => !v)}
            >
              {showAddGoal ? "بستن فرم" : "تعریف هدف جدید"}
            </Button>
          </div>

          {/* Add Goal Collapsible Form */}
          {showAddGoal && (
            <Card className="flex flex-col gap-4 p-5 animate-scale-pop border-line shadow-card">
              <CardHead
                title="تعریف هدف ورزشی جدید"
                meta="اهداف می‌توانند بر مبنای وزن، چربی یا جلسات تمرین هفتگی باشند."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="نوع هدف" htmlFor="go-type">
                  <select
                    id="go-type"
                    className="h-11 w-full rounded-full border border-line bg-card-2 px-4 text-base text-ink focus:border-ink focus:outline-none"
                    value={goalType}
                    onChange={(e) => setGoalType(e.target.value as GoalType)}
                  >
                    {(Object.keys(GOAL_TYPE_FA) as GoalType[]).map((t) => (
                      <option key={t} value={t}>
                        {GOAL_TYPE_FA[t]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="مقدار هدف" htmlFor="go-target" error={goalErrors.target}>
                  <div className="flex gap-2">
                    <TextInput
                      id="go-target"
                      className="num"
                      inputMode="decimal"
                      placeholder="مثلاً ۷۸"
                      value={rawTarget}
                      onChange={(e) => setRawTarget(e.target.value)}
                    />
                    <select
                      className="h-11 rounded-full border border-line bg-card-2 px-3 text-sm text-ink focus:border-ink focus:outline-none"
                      value={goalUnit}
                      onChange={(e) => setGoalUnit(e.target.value)}
                    >
                      {GOAL_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DateField label="تاریخ شروع" value={goalStart} onChange={setGoalStart} />
                <DateField label="تاریخ رسیدن به هدف (اختیاری)" value={goalTargetDate} onChange={setGoalTargetDate} />
              </div>

              <Field label="یادداشت یا انگیزه شخصی" htmlFor="go-notes">
                <Textarea
                  id="go-notes"
                  value={goalNotes}
                  placeholder="مثلاً آماده‌سازی برای مسابقات پاییز"
                  onChange={(e) => setGoalNotes(e.target.value)}
                  maxLength={500}
                />
              </Field>

              {goalAddSubmit.error ? (
                <p role="alert" className="text-sm text-ink bg-card-2 p-3 rounded-2xl border border-line">
                  {goalAddSubmit.error.message}
                </p>
              ) : null}

              {goalFlash ? <p role="status" className="text-sm text-ink-2">{goalFlash}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAddGoal(false)}>
                  انصراف
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={goalAddSubmit.pending}
                  onClick={() => void submitGoal()}
                >
                  ثبت این هدف
                </Button>
              </div>
            </Card>
          )}

          {/* Goals List */}
          {goalsList.loading ? (
            <LoadingState label="در حال دریافت اهداف" rows={2} />
          ) : goalsList.error ? (
            <ErrorState title="خطا در دریافت اهداف" description={goalsList.error.message} onRetry={goalsList.reload} />
          ) : (goalsList.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="هنوز هدفی تعریف نشده است"
              description="برای خودتان یک هدف کاهش وزن، افزایش حجم یا تعداد تمرین مشخص کنید تا مسیر پیشرفت روشن‌تر شود."
              action={
                <Button size="sm" variant="primary" onClick={() => setShowAddGoal(true)}>
                  تعریف اولین هدف
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(goalsList.data?.items ?? []).map((g) => (
                <Card key={g.id} className="flex flex-col gap-4 p-5 shadow-card hover:border-line transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-weak text-ink">
                        <Target size={20} />
                      </span>
                      <div>
                        <h4 className="text-base font-bold text-ink">{GOAL_TYPE_FA[g.type]}</h4>
                        <span className="text-2xs text-ink-3">
                          {g.startDate ? `شروع: ${faDate(g.startDate)}` : ""}
                          {g.targetDate ? ` · ضرب‌الاجل: ${faDate(g.targetDate)}` : ""}
                        </span>
                      </div>
                    </div>

                    <IconButton
                      label="حذف این هدف"
                      size="sm"
                      onClick={() =>
                        setPendingDelete({
                          kind: "goal",
                          id: g.id,
                          title: "حذف هدف",
                          detail: `${GOAL_TYPE_FA[g.type]}`,
                        })
                      }
                    >
                      <Trash2 size={13} aria-hidden />
                    </IconButton>
                  </div>

                  {g.targetValue !== null ? (
                    <div className="flex items-baseline justify-between rounded-2xl border border-divider bg-card-2 p-3.5">
                      <span className="text-xs text-ink-3">مقدار هدف تعیین‌شده:</span>
                      <span className="num text-lg font-bold text-ink">
                        {faNum(g.targetValue)} {goalUnitFa(g.unit)}
                      </span>
                    </div>
                  ) : null}

                  {g.notes ? <p className="text-xs leading-relaxed text-ink-2">{g.notes}</p> : null}

                  {/* Status Toggle Buttons */}
                  <div className="flex items-center justify-between border-t border-divider pt-3">
                    <span className="text-2xs font-medium text-ink-3">وضعیت هدف:</span>
                    <div className="flex gap-1.5">
                      <Chip tone={g.status === "active" ? "solid" : "neutral"}>
                        {GOAL_STATUS_FA[g.status]}
                      </Chip>
                      {g.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void changeGoalStatus(g.id, "achieved")}
                          className="text-2xs text-ink-3 hover:text-ink underline ms-2"
                        >
                          ثبت به عنوان محقق‌شده
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Dialog for Deletions */}
      <ConfirmationDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title ?? "حذف"}
        description={pendingDelete?.detail ?? ""}
        confirmLabel="حذف قطعی"
        destructive
        busy={deleteSubmit.pending}
        onConfirm={() => void confirmDelete()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
