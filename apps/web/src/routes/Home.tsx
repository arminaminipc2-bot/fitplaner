import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Dumbbell,
  Flame,
  GlassWater,
  Plus,
  Scale,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Card, CardHead, Chip, IconButton, SectionTitle, Spinner, cx } from "../components/ui";
import { MealComposer } from "../components/MealComposer";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { StatCard } from "../components/StatCard";
import { ProgressRing } from "../components/ProgressRing";
import { WorkoutCard } from "../components/WorkoutCard";
import { NutritionCard } from "../components/NutritionCard";
import { MeasurementCard } from "../components/MeasurementCard";
import { ActivityCalendar } from "../components/Calendar";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { api, ApiError } from "../lib/api";
import {
  adherenceSentence,
  dayStatusMap,
  toDisplayWorkout,
  toMacroIntake,
  toMacroTargets,
  toQuality,
} from "../lib/adapters";
import { RECORD_SOURCE_FA } from "../lib/domain";
import { faDayLabel, faNum, faRelative, faUnitShort } from "../lib/format";
import { toApiDate } from "../lib/jalali";
import { useApiData, useSubmit } from "../lib/useApiData";

/**
 * Home is the aggregate endpoint, not four requests: every number on this screen
 * comes from `/api/home`, so nothing here can be half-refreshed.
 */
export function Home() {
  const { data, error, loading, reload } = useApiData((signal) => api.home(signal), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composer, setComposer] = useState<null | "text" | "photo">(null);
  const [mealToDelete, setMealToDelete] = useState<{ id: string; name: string } | null>(null);
  const water = useSubmit();
  const navigate = useNavigate();
  const location = useLocation();

  // The bottom-bar plus opens its sheet anywhere; meal and photo land here.
  useEffect(() => {
    const quick = (location.state as { quick?: string } | null)?.quick;
    if (!quick) return;
    if (quick === "meal" || quick === "food-photo") {
      setComposer(quick === "meal" ? "text" : "photo");
    } else if (quick === "water") {
      document.getElementById("water-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate]);

  if (loading) return <div className="flex flex-col gap-3"><LoadingState label="در حال خواندن امروز شما" rows={5} /><LoadingState rows={3} /></div>;
  if (error || !data) {
    return <ErrorState title="امروز نمایش داده نشد" description={error?.message ?? "به اطلاعات امروز دسترسی نداریم."} onRetry={reload} />;
  }

  const today = toApiDate(new Date(data.date));
  const workouts = data.workouts.map(toDisplayWorkout);
  const targets = toMacroTargets(data.nutrition.target);
  const intake = toMacroIntake(data.nutrition.consumed, data.nutrition.waterMl);
  const kcalPct = targets && targets.kcal > 0 ? (data.nutrition.consumed.kcal / targets.kcal) * 100 : null;

  const setStatus = async (id: string, version: number, done: boolean) => {
    if (busyId) return;
    setBusyId(id);
    setNotice(null);
    try {
      await api.training.setStatus(id, done ? "completed" : "scheduled", version);
      reload();
    } catch (cause) {
      setNotice(cause instanceof ApiError ? cause.message : "تغییر وضعیت ذخیره نشد.");
    } finally {
      setBusyId(null);
    }
  };

  const removeMeal = async () => {
    if (!mealToDelete) return;
    setNotice(null);
    try {
      await api.nutrition.deleteMeal(mealToDelete.id);
      setMealToDelete(null);
      reload();
    } catch (cause) {
      setNotice(cause instanceof ApiError ? cause.message : "حذف وعده انجام نشد.");
    }
  };

  const addWater = async (ml: number) => {
    setBusyId(`w${ml}`);
    setNotice(null);
    const result = await water.run(() => api.nutrition.addWater(ml));
    setBusyId(null);
    if (result) reload();
  };

  return (
    <div className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-2xs text-ink-3">{faDayLabel(data.date)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">{data.displayName ? `سلام ${data.displayName}` : "امروز شما"}</h2>
          {data.ai.configured ? (
            <Chip tone="outline">
              <Sparkles size={11} aria-hidden />
              دستیار: {data.ai.providerLabel}
            </Chip>
          ) : (
            <Chip tone="outline">دستیار هوش مصنوعی تنظیم نشده</Chip>
          )}
        </div>
        {!data.ai.configured ? (
          <p className="max-w-[52ch] text-sm leading-relaxed text-ink-3">
            بدون کلید ارائه‌دهنده، گفت‌وگو و تحلیل غذا کار نمی‌کند. ثبت دستی داده‌ها مستقل از
            هوش مصنوعی کار می‌کند. <Link to="/settings" className="underline underline-offset-4 hover:text-ink">تنظیم کلید</Link>
          </p>
        ) : null}
      </header>

      {/* ---------- nutrition ---------- */}
      <section className="flex flex-col gap-3">
        <SectionTitle title="تغذیه و آب" description={targets ? undefined : "هدف روزانه‌ای ثبت نشده؛ اعداد مصرف بدون مقایسه نمایش داده می‌شوند."} />
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-[minmax(0,1fr)_320px]">
          <NutritionCard intake={intake} targets={targets} />

          {/* کارت ثبت آب - خلوت، مینیمال، با لیوان 250ml و نوار هدف روبروی آن */}
          <Card id="water-card" className="flex flex-col justify-between gap-4 p-5 scroll-mt-24">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">ثبت آب روزانه</span>
              <span className="num text-2xs text-ink-3">
                {faNum(data.nutrition.waterMl)} میلی‌لیتر امروز
              </span>
            </div>

            {/* ردیف اصلی: دکمه لیوان 250 ml و نوار هدف روبروی آن */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-3xl border border-line/60 bg-card-2/70 p-4">
              {/* گزینه لیوان 250 ml */}
              <button
                type="button"
                disabled={busyId === "w250"}
                onClick={() => void addWater(250)}
                aria-label="افزودن یک لیوان آب ۲۵۰ میلی‌لیتر"
                className="group relative flex shrink-0 items-center gap-3.5 rounded-full border border-line bg-card-3 px-5 py-3 text-right transition-all duration-200 hover:border-ink/40 hover:bg-card-3/80 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
              >
                <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-weak/50 text-ink transition-transform duration-200 group-hover:scale-105">
                  {busyId === "w250" ? (
                    <Spinner />
                  ) : (
                    <GlassWater size={22} className="text-ink transition-colors" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold tracking-tight text-ink">
                    250 ml
                  </span>
                  <span className="text-2xs text-ink-3 group-hover:text-ink-2">
                    + یک لیوان
                  </span>
                </div>
              </button>

              {/* نوار هدف روبروی لیوان */}
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-2xs font-medium text-ink-2">
                    {targets?.waterMl ? (
                      data.nutrition.waterMl >= targets.waterMl ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <CheckCircle2 size={12} className="text-ink" /> هدف امروز کامل شد
                        </span>
                      ) : (
                        `هدف: ${faNum(targets.waterMl)} میلی‌لیتر`
                      )
                    ) : (
                      "هدف تعیین‌نشده"
                    )}
                  </span>
                  <span className="num text-2xs font-semibold text-ink">
                    {targets?.waterMl && targets.waterMl > 0
                      ? `${faNum(Math.round((data.nutrition.waterMl / targets.waterMl) * 100))}٪`
                      : faUnitShort(data.nutrition.waterMl, "ml")}
                  </span>
                </div>

                {/* نوار پیشرفت */}
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(
                    targets?.waterMl && targets.waterMl > 0
                      ? Math.min(100, (data.nutrition.waterMl / targets.waterMl) * 100)
                      : 0,
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="پیشرفت مصرف آب"
                  className="h-2.5 w-full overflow-hidden rounded-full bg-line"
                >
                  <div
                    className="h-full rounded-full bg-fill-strong transition-[width] duration-500 ease-out"
                    style={{
                      width: `${
                        targets?.waterMl && targets.waterMl > 0
                          ? Math.min(100, Math.max(0, (data.nutrition.waterMl / targets.waterMl) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {water.error ? (
              <p role="alert" className="text-sm text-ink">
                {water.error.message}
              </p>
            ) : null}
          </Card>
        </div>

        {/* کارت مستقل وعده‌های ثبت‌شده امروز (تفکیک‌شده از بخش آب برای خلوت‌تر و منظم‌تر شدن صفحه) */}
        <Card className="flex flex-col gap-3">
          <CardHead
            title="وعده‌های امروز"
            meta={
              data.nutrition.meals.length > 0
                ? `${faNum(data.nutrition.meals.length)} وعده ثبت‌شده · مجموع ${faNum(
                    data.nutrition.meals.reduce((sum, m) => sum + (m.kcal ?? 0), 0),
                  )} ک‌کال`
                : "هنوز وعده‌ای برای امروز ثبت نشده است."
            }
            action={
              <Button
                size="sm"
                variant="secondary"
                leading={<Plus size={14} aria-hidden />}
                onClick={() => setComposer("text")}
              >
                ثبت وعده
              </Button>
            }
          />

          {data.nutrition.meals.length === 0 ? (
            <div className="flex items-center justify-between rounded-2xl border border-line/60 bg-card-2/40 p-4 text-ink-3">
              <span className="text-xs">غذای امروزتان را دستی یا با عکس هوشمند ثبت کنید.</span>
              <Button size="sm" variant="outline" onClick={() => setComposer("text")}>
                + افزودن غذا
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {data.nutrition.meals.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-card-2 p-3 text-xs transition-colors hover:border-line"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{m.name}</span>
                    <span className="text-2xs text-ink-3">
                      {RECORD_SOURCE_FA[m.source]}
                      {m.confidence !== null ? ` · دقت ${faNum(Math.round(m.confidence * 100))}٪` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="num font-semibold text-ink-2">{faNum(m.kcal)} ک‌کال</span>
                    <IconButton
                      label={`حذف ${m.name}`}
                      size="sm"
                      onClick={() => setMealToDelete({ id: m.id, name: m.name })}
                    >
                      <Trash2 size={13} aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ---------- today's training ---------- */}
      <section className="flex flex-col gap-3">
        <SectionTitle
          title="تمرین امروز"
          description={data.nextWorkout ? `بعدی: ${faDayLabel(data.nextWorkout.date)} — ${data.nextWorkout.title}` : undefined}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("/workouts")}>
              برنامه هفتگی
            </Button>
          }
        />
        {workouts.length === 0 ? (
          <Card tone="sunken" padded={false}>
            <EmptyState
              title="برای امروز تمرینی ثبت نشده"
              description={
                data.nextWorkout
                  ? `نزدیک‌ترین تمرین ${faRelative(data.nextWorkout.date)} است: ${data.nextWorkout.title}.`
                  : "هیچ تمرین آینده‌ای در برنامه نیست. می‌توانید از بخش برنامه یک جلسه اضافه کنید."
              }
              action={
                <Button variant="primary" size="sm" onClick={() => navigate("/workouts")}>
                  افزودن تمرین
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onOpen={() => navigate("/workouts")}
                onToggleDone={() => void setStatus(w.id, w.version, !w.done)}
              />
            ))}
          </div>
        )}
        {notice ? <p role="alert" className="text-sm text-ink">{notice}</p> : null}
      </section>

      {/* ---------- body + week ---------- */}
      <section className="flex flex-col gap-3">
        <SectionTitle title="بدن و روند هفته" description={adherenceSentence(data.week.summary)} />
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            {data.body.weightKg === null ? (
              <Card tone="sunken" padded={false} className="col-span-2">
                <EmptyState
                  title="هنوز وزنی ثبت نکرده‌اید"
                  description="با یک اندازه‌گیری شروع کنید تا روند وزن در پیشرفت نمایش داده شود."
                  action={
                    <Button variant="primary" size="sm" onClick={() => navigate("/progress")}>
                      ثبت وزن
                    </Button>
                  }
                />
              </Card>
            ) : (
              <>
                <MeasurementCard
                  metric="weight"
                  value={data.body.weightKg}
                  takenAt={data.body.takenAt ?? data.date}
                  quality={toQuality(data.body.quality) ?? "self-reported"}
                />
                {data.body.bodyFatPct === null ? (
                  <Card tone="sunken" className="flex flex-col justify-center gap-1">
                    <span className="text-2xs text-ink-2">درصد چربی بدن</span>
                    <span className="text-sm text-ink-3">ثبت نشده</span>
                  </Card>
                ) : (
                  <MeasurementCard
                    metric="bodyFat"
                    value={data.body.bodyFatPct}
                    takenAt={data.body.takenAt ?? data.date}
                    quality={toQuality(data.body.quality) ?? "self-reported"}
                  />
                )}
              </>
            )}
            {targets ? (
              <Card tone="sunken" className="col-span-2 flex items-center gap-4">
                <ProgressRing
                  value={data.nutrition.consumed.kcal}
                  max={targets.kcal}
                  size={56}
                  label="درصد انرژی مصرفی نسبت به هدف"
                  center={<span className="num text-2xs">{faNum(Math.round(kcalPct ?? 0))}٪</span>}
                />
                <div className="min-w-0 flex-col gap-1">
                  <p className="text-sm text-ink-2">انرژی امروز</p>
                  <p className="text-sm leading-relaxed text-ink-3">
                    میانگین بازه {faNum(data.week.summary.daysWithData)} روز با داده: {faNum(data.week.summary.kcalAverage)} کیلوکالری
                    {data.week.summary.proteinAverage ? ` · پروتئین ${faNum(data.week.summary.proteinAverage)} گرم` : ""}
                  </p>
                </div>
              </Card>
            ) : null}
          </div>

          <ActivityCalendar end={new Date(data.date)} days={dayStatusMap(data.week.days, today)} weeks={1} title="هفته جاری" />
        </div>
      </section>

      <SectionTitle title="آمار هفته" />
      <section aria-label="آمار هفته" className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
        <StatCard
          label="جلسات این هفته"
          value={`${faNum(data.week.summary.workoutsDone)}/${faNum(data.week.summary.workoutsPlanned)}`}
          unit="انجام‌شده"
          icon={Dumbbell}
        />
        <StatCard label="روزهای پیوسته" value={faNum(data.week.streakDays)} unit="روز" icon={Activity} />
        <StatCard
          label="وزن"
          value={data.body.weightKg === null ? "—" : faNum(data.body.weightKg, 1)}
          unit={data.body.weightKg === null ? "ثبت نشده" : "کیلوگرم"}
          icon={Scale}
        />
        <StatCard
          label="کالری امروز"
          value={faNum(data.nutrition.consumed.kcal)}
          unit={targets ? `از ${faNum(targets.kcal)}` : "بدون هدف"}
          icon={Flame}
        />
      </section>

      <MealComposer
        open={composer !== null}
        aiReady={data.ai.configured}
        initialMode={composer ?? "text"}
        onClose={() => setComposer(null)}
        onSaved={() => reload()}
      />

      <ConfirmationDialog
        open={mealToDelete !== null}
        title="حذف وعده"
        description={mealToDelete ? `«${mealToDelete.name}» از ثبت امروز حذف شود؟ این عمل بازگشت‌پذیر نیست.` : undefined}
        destructive
        confirmLabel="حذف وعده"
        onConfirm={() => void removeMeal()}
        onClose={() => setMealToDelete(null)}
      />

      {data.body.heightCm === null ? (
        <p className={cx("text-2xs text-ink-3")}>
          قد در پروفایل ثبت نشده؛ تا آن نباشد شاخص توده بدن و محاسبه انرژی کامل نمی‌شود.
          <Link to="/profile" className="ms-1 underline underline-offset-4 hover:text-ink">تکمیل پروفایل</Link>
        </p>
      ) : null}
    </div>
  );
}
