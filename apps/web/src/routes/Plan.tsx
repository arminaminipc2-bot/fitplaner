import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Choice,
  Chip,
  Divider,
  Field,
  IconButton,
  SectionTitle,
  Segmented,
  TextInput,
  cx,
} from "../components/ui";
import { WorkoutCard } from "../components/WorkoutCard";
import { ExerciseCard } from "../components/ExerciseCard";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { api, type WorkoutDto } from "../lib/api";
import { toDisplayWorkout } from "../lib/adapters";
import {
  INTENSITY_FA,
  MEAL_SLOT_FA,
  WORKOUT_KIND_FA,
  WORKOUT_STATUS_FA,
  type Intensity,
  type WorkoutKind,
  type WorkoutStatus,
} from "../lib/domain";
import { faJalaliDay, faNum, faWeekday, parseFaNumber } from "../lib/format";
import { toApiDate } from "../lib/jalali";
import { addDays, FA_WEEKDAY_SHORT, persianWeekIndex, sameDay, weekOf } from "../lib/persian";
import { useApiData, useSubmit } from "../lib/useApiData";

const KINDS = Object.keys(WORKOUT_KIND_FA) as WorkoutKind[];
const INTENSITIES = Object.keys(INTENSITY_FA) as Intensity[];
const STATUSES: WorkoutStatus[] = ["scheduled", "completed", "skipped", "missed", "rest"];

type Pending =
  | { kind: "workout"; id: string; title: string }
  | { kind: "exercise"; id: string; title: string }
  | null;

/**
 * The plan page is the manual editor for the same rows the AI coach proposes
 * changes to. Every write carries the workout `version`, so an edit made in
 * another tab surfaces as a conflict instead of being overwritten.
 */
export function Plan() {
  const today = useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days = useMemo(() => weekOf(addDays(today, weekOffset * 7)), [today, weekOffset]);
  const from = toApiDate(days[0]);
  const to = toApiDate(days[6]);

  const week = useApiData(() => api.training.workouts({ from, to }), [from, to]);
  const nutrition = useApiData(async () => {
    const [target, meals, progress] = await Promise.all([
      api.nutrition.targets(),
      api.nutrition.meals({ from, to }),
      api.progress.range({ days: 7 }),
    ]);
    return { target, meals: meals.items, summary: progress.summary };
  }, [from, to]);
  const form = useSubmit();
  const navigate = useNavigate();

  const items = week.data?.items ?? [];
  const byDay = useMemo(() => {
    const map = new Map<string, WorkoutDto[]>();
    for (const w of items) {
      const key = w.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(w);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const fail = (cause: unknown, fallback: string) =>
    setNotice(cause instanceof Error ? cause.message : fallback);

  const remove = async () => {
    if (!pending) return;
    setBusy(pending.id);
    try {
      if (pending.kind === "workout") await api.training.deleteWorkout(pending.id);
      else await api.training.deleteExercise(pending.id);
      setNotice(null);
      setOpenId(null);
      week.reload();
    } catch (cause) {
      fail(cause, "حذف انجام نشد.");
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "nutrition" ? "nutrition" : "workouts";

  const totalMinutes = items.reduce((sum, w) => sum + (w.estimatedMinutes ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* سگمنت تغییر تب بین تمرینات و غذاها */}
      <div className="mx-auto flex w-full max-w-sm items-center justify-center">
        <Segmented
          label="بخش برنامه"
          value={activeTab}
          onChange={(tab) => setSearchParams({ tab })}
          options={[
            { value: "workouts", label: "تمرینات هفتگی" },
            { value: "nutrition", label: "برنامه غذا و تغذیه" },
          ]}
        />
      </div>

      {activeTab === "workouts" ? (
        <>
          <SectionTitle
            title="برنامه هفتگی تمرینات"
            description={
              week.loading
                ? undefined
                : `${faNum(items.length)} تمرین · ${faNum(totalMinutes)} دقیقه برنامه‌ریزی‌شده`
            }
            action={
              <Button
                size="sm"
                variant="secondary"
                leading={<Plus size={14} aria-hidden />}
                onClick={() => setAddFor(today <= days[6] ? toApiDate(today) : to)}
              >
                تمرین جدید
              </Button>
            }
          />

          <nav aria-label="انتخاب هفته" className="flex items-center gap-2">
            <IconButton label="هفته پیشین" size="sm" onClick={() => setWeekOffset((v) => v - 1)}>
              {/* RTL: the previous week sits to the right, so the arrow points left */}
              <ChevronRight size={15} aria-hidden />
            </IconButton>
            <span className="flex-1 text-center text-sm font-semibold">
              {faJalaliDay(days[0])} – {faJalaliDay(days[6])} {weekLabel(days[0])}
              {weekOffset === 0 ? " · جاری" : ""}
            </span>
            <IconButton label="هفته آینده" size="sm" onClick={() => setWeekOffset((v) => v + 1)}>
              <ChevronLeft size={15} aria-hidden />
            </IconButton>
            {weekOffset !== 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>
                این هفته
              </Button>
            ) : null}
          </nav>

          {notice ? (
            <p role="alert" className="rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-ink">
              {notice}
              <button type="button" className="ms-2 underline underline-offset-4" onClick={week.reload}>
                بارگذاری دوباره
              </button>
            </p>
          ) : null}

          {week.loading ? (
            <div className="flex flex-col gap-3">
              <LoadingState label="در حال خواندن برنامه" rows={4} />
              <LoadingState rows={3} />
            </div>
          ) : week.error ? (
            <ErrorState title="برنامه نمایش داده نشد" description={week.error.message} onRetry={week.reload} />
          ) : (
            <div className="grid grid-cols-1 gap-3 split:grid-cols-2">
              {days.map((day) => {
                const key = toApiDate(day);
                const list = byDay.get(key) ?? [];
                const isToday = sameDay(day, today);
                return (
                  <Card key={key} tone={isToday ? "raised" : "default"} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            "num flex size-8 items-center justify-center rounded-xl border text-sm font-bold",
                            isToday ? "border-ink bg-fill-strong text-canvas" : "border-line text-ink-2",
                          )}
                          aria-hidden
                        >
                          {faJalaliDay(day)}
                        </span>
                        <span className="text-sm font-semibold">
                          {faWeekday(day)}
                          <span className="ms-1 text-2xs text-ink-3">{FA_WEEKDAY_SHORT[persianWeekIndex(day)]}</span>
                        </span>
                      </div>
                      <IconButton
                        label={`افزودن تمرین در ${faWeekday(day)}`}
                        size="sm"
                        onClick={() => setAddFor(addFor === key ? null : key)}
                      >
                        <Plus size={15} aria-hidden />
                      </IconButton>
                    </div>

                    {addFor === key ? (
                      <NewWorkoutForm
                        date={key}
                        busy={busy === "new"}
                        onCancel={() => setAddFor(null)}
                        onSubmit={async (body) => {
                          setBusy("new");
                          setNotice(null);
                          const created = await form.run(() => api.training.createWorkout(body));
                          setBusy(null);
                          if (created) {
                            setAddFor(null);
                            setOpenId(created.id);
                            week.reload();
                          } else if (form.error) {
                            fail(form.error, "تمرین افزوده نشد.");
                          }
                        }}
                        error={form.error ? messageOf(form.error) : null}
                      />
                    ) : null}

                    {list.length === 0 && addFor !== key ? (
                      <p className="text-2xs text-ink-3">تمرینی برای این روز ثبت نشده است.</p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {list.map((raw) => {
                          const workout = toDisplayWorkout(raw);
                          const open = openId === raw.id;
                          return (
                            <li key={raw.id} className="flex flex-col gap-3">
                              <WorkoutCard
                                workout={workout}
                                className={open ? "border-ink-3" : undefined}
                                onOpen={() => setOpenId(open ? null : raw.id)}
                                onToggleDone={() => {
                                  void (async () => {
                                    setBusy(raw.id);
                                    setNotice(null);
                                    try {
                                      await api.training.setStatus(
                                        raw.id,
                                        workout.done ? "scheduled" : "completed",
                                        raw.version,
                                      );
                                      week.reload();
                                    } catch (cause) {
                                      fail(cause, "تغییر وضعیت ذخیره نشد.");
                                      week.reload();
                                    } finally {
                                      setBusy(null);
                                    }
                                  })();
                                }}
                              />
                              {open ? (
                                <WorkoutDetails
                                  workout={raw}
                                  busy={busy === raw.id}
                                  onBusy={(id) => setBusy(id)}
                                  onChanged={week.reload}
                                  onFail={(cause, fallback) => fail(cause, fallback)}
                                  onAskDelete={() => setPending({ kind: "workout", id: raw.id, title: raw.title })}
                                  onAskDeleteExercise={(e) =>
                                    setPending({ kind: "exercise", id: e.id, title: e.name })
                                  }
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {!week.loading && items.length === 0 && !week.error ? (
            <EmptyState
              title="این هفته خالی است"
              description="یک جلسه اضافه کنید تا بتوانید حرکت‌ها، شدت و وضعیت انجام را ثبت کنید."
              action={
                <Button size="sm" variant="primary" onClick={() => setAddFor(toApiDate(days[0]))}>
                  افزودن اولین تمرین
                </Button>
              }
            />
          ) : null}
        </>
      ) : (
        /* ---------- nutrition plan ---------- */
        <section id="nutrition-plan" aria-labelledby="nutrition-plan-title" className="flex flex-col gap-4">
          <SectionTitle
            title="برنامهٔ تغذیه و اهداف غذایی"
            description="هدف روزانه، سهم وعده‌ها و خلاصهٔ هفته. هدف‌ها دستی یا با متخصص تغذیه ویرایش می‌شوند."
          />
          {nutrition.loading ? (
            <LoadingState label="در حال خواندن برنامهٔ تغذیه" rows={2} />
          ) : nutrition.error ? (
            <ErrorState title="برنامهٔ تغذیه نمایش داده نشد" description={nutrition.error.message} onRetry={nutrition.reload} />
          ) : (
            <div className="grid grid-cols-1 gap-4 split:grid-cols-2">
              <Card className="flex flex-col gap-3">
                <CardHead
                  title="هدف روزانه"
                  meta={nutrition.data?.target?.effectiveFrom ? `از ${faJalaliDay(new Date(nutrition.data.target.effectiveFrom))}` : "ثبت نشده"}
                  action={
                    <Button size="sm" variant="ghost" onClick={() => navigate("/profile")}>
                      ویرایش
                    </Button>
                  }
                />
                {nutrition.data?.target ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">انرژی</span>
                        <span className="num mt-1 block text-sm text-ink">{faNum(nutrition.data.target.kcal)} ک‌کال</span>
                      </div>
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">پروتئین</span>
                        <span className="num mt-1 block text-sm text-ink">{faNum(nutrition.data.target.proteinG)} گرم</span>
                      </div>
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">کربوهیدرات</span>
                        <span className="num mt-1 block text-sm text-ink">{faNum(nutrition.data.target.carbsG)} گرم</span>
                      </div>
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">چربی</span>
                        <span className="num mt-1 block text-sm text-ink">{faNum(nutrition.data.target.fatG)} گرم</span>
                      </div>
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">آب</span>
                        <span className="num mt-1 block text-sm text-ink">{faNum(nutrition.data.target.waterMl)} میلی‌لیتر</span>
                      </div>
                      <div className="rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="block text-2xs text-ink-3">وعده‌ها</span>
                        <span className="num mt-1 block text-sm text-ink">۴ سهم</span>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-ink-3">
                      سهم وعده‌ها از انرژی هدف: صبحانه ۲۵٪ · ناهار ۳۵٪ · شام ۳۰٪ · میان‌وعده ۱۰٪
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-sm leading-relaxed text-ink-2">
                      هدف غذایی ثبت نشده است؛ تا آن نباشد کالری مصرفی با هدف مقایسه نمی‌شود.
                    </p>
                    <Button size="sm" variant="primary" onClick={() => navigate("/profile")}>
                      ثبت هدف غذایی
                    </Button>
                  </div>
                )}
                <Divider className="my-0" />
                <Button
                  size="sm"
                  variant="outline"
                  leading={<Sparkles size={13} aria-hidden />}
                  onClick={() => navigate("/chat?assistant=nutritionist")}
                >
                  گفت‌وگو با متخصص تغذیه برای تغییر برنامه
                </Button>
              </Card>

              <Card className="flex flex-col gap-3">
                <CardHead
                  title="وعده‌های این هفته"
                  meta={nutrition.data ? `${faNum(nutrition.data.meals.length)} وعده ثبت‌شده` : undefined}
                />
                <ul className="flex flex-col gap-2">
                  {(Object.keys(MEAL_SLOT_FA) as Array<keyof typeof MEAL_SLOT_FA>).map((slot) => {
                    const meals = (nutrition.data?.meals ?? []).filter((m) => m.slot === slot);
                    const kcal = meals.reduce((sum, m) => sum + m.totals.kcal, 0);
                    return (
                      <li key={slot} className="flex items-center justify-between gap-2 rounded-xl border border-divider bg-card-2 px-3 py-2">
                        <span className="text-2xs text-ink-2">{MEAL_SLOT_FA[slot]}</span>
                        <span className="num text-2xs text-ink-3">
                          {meals.length === 0 ? "بدون ثبت" : `${faNum(meals.length)} وعده · ${faNum(kcal)} ک‌کال`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Divider className="my-0" />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="block text-2xs text-ink-3">میانگین انرژی</span>
                    <span className="num text-sm">{faNum(nutrition.data?.summary.kcalAverage ?? 0)}</span>
                  </div>
                  <div>
                    <span className="block text-2xs text-ink-3">میانگین پروتئین</span>
                    <span className="num text-sm">{faNum(nutrition.data?.summary.proteinAverage ?? 0)} گرم</span>
                  </div>
                  <div>
                    <span className="block text-2xs text-ink-3">روزهای با داده</span>
                    <span className="num text-sm">{faNum(nutrition.data?.summary.daysWithData ?? 0)}</span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-ink-3">
                  ثبت وعده از صفحهٔ خانه انجام می‌شود؛ عکس، متن، صدا یا ورود دستی. برای فهرست کامل وعده‌ها به
                  <Link to="/" className="ms-1 underline underline-offset-4 hover:text-ink">خانه</Link> برگردید.
                </p>
              </Card>
            </div>
          )}
        </section>
      )}

      <ConfirmationDialog
        open={pending !== null}
        title={pending?.kind === "exercise" ? "حذف حرکت" : "حذف تمرین"}
        description={
          pending
            ? `«${pending.title}» حذف شود؟ این عمل بازگشت‌پذیر نیست و گزارش‌های پیشین تغییر نمی‌کنند.`
            : undefined
        }
        destructive
        busy={pending !== null && busy === pending.id}
        confirmLabel="حذف"
        onConfirm={() => void remove()}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "خطای نامشخص";

/** Jalali month + year for the week heading, e.g. «آبان ۱۴۰۵». */
function weekLabel(d: Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", year: "numeric" }).format(d);
}

function NewWorkoutForm({
  date,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  date: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: {
    date: string;
    kind: WorkoutKind;
    title: string;
    intensity: Intensity;
    estimatedMinutes?: number;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<WorkoutKind>("strength");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [minutes, setMinutes] = useState("60");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setLocalError("نام تمرین را وارد کنید.");
      return;
    }
    if (trimmed.length > 120) {
      setLocalError("نام تمرین نباید از ۱۲۰ کاراکتر بلندتر باشد.");
      return;
    }
    const mins = minutes.trim() === "" ? undefined : parseFaNumber(minutes);
    if (mins !== undefined && (mins === null || !Number.isInteger(mins) || mins < 5 || mins > 600)) {
      setLocalError("مدت باید عددی صحیح بین ۵ تا ۶۰۰ دقیقه باشد.");
      return;
    }
    setLocalError(null);
    onSubmit({ date, kind, title: trimmed, intensity, estimatedMinutes: mins });
  };

  const shown = localError ?? error;

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-divider bg-card-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-2xs text-ink-3">تمرین در {faWeekday(new Date(`${date}T12:00:00Z`))}</p>

      <Field label="نام تمرین" htmlFor={`t-${date}`} error={localError ?? undefined}>
        <TextInput
          id={`t-${date}`}
          value={title}
          invalid={!!localError}
          placeholder="مثلاً قدرت بالاتنه"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <div>
        <span className="mb-2 block text-2xs text-ink-2">نوع</span>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Choice key={k} selected={kind === k} onClick={() => setKind(k)}>
              {WORKOUT_KIND_FA[k]}
            </Choice>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-2xs text-ink-2">شدت</span>
        <div className="flex flex-wrap gap-2">
          {INTENSITIES.map((i) => (
            <Choice key={i} selected={intensity === i} onClick={() => setIntensity(i)}>
              {INTENSITY_FA[i]}
            </Choice>
          ))}
        </div>
      </div>

      <Field label="مدت (دقیقه)" htmlFor={`m-${date}`} hint="اختیاری · بین ۵ تا ۶۰۰">
        <TextInput
          id={`m-${date}`}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="max-w-[10ch]"
        />
      </Field>

      {shown ? (
        <p role="alert" className="text-sm text-ink">
          {shown}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={busy}>
          ثبت تمرین
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          انصراف
        </Button>
      </div>
    </form>
  );
}

/**
 * Expanded editor for one workout. Headings that change the record go through the
 * versioned PATCH; exercise rows are separate writes, each of which bumps the
 * workout version, so the page always reloads the week after one lands.
 */
function WorkoutDetails({
  workout,
  busy,
  onBusy,
  onChanged,
  onFail,
  onAskDelete,
  onAskDeleteExercise,
}: {
  workout: WorkoutDto;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onChanged: () => void;
  onFail: (cause: unknown, fallback: string) => void;
  onAskDelete: () => void;
  onAskDeleteExercise: (e: { id: string; name: string }) => void;
}) {
  const [title, setTitle] = useState(workout.title);
  const [minutes, setMinutes] = useState(workout.estimatedMinutes ? String(workout.estimatedMinutes) : "");
  const [draft, setDraft] = useState({ name: "", sets: "3", reps: "10", rest: "90" });
  const [error, setError] = useState<string | null>(null);

  // A reload swaps in a newer row; the local text must follow it or the next
  // PATCH would resend a stale title against a bumped version.
  const seed = `${workout.id}:${workout.version}`;
  const [lastSeed, setLastSeed] = useState(seed);
  if (lastSeed !== seed) {
    setLastSeed(seed);
    setTitle(workout.title);
    setMinutes(workout.estimatedMinutes ? String(workout.estimatedMinutes) : "");
  }

  const patch = async (body: Record<string, unknown>, fallback: string) => {
    onBusy(workout.id);
    setError(null);
    try {
      await api.training.patchWorkout(workout.id, { ...body, version: workout.version });
      onChanged();
    } catch (cause) {
      onFail(cause, fallback);
      onChanged();
    } finally {
      onBusy(null);
    }
  };

  const addExercise = async () => {
    const name = draft.name.trim();
    const sets = parseFaNumber(draft.sets);
    const rest = parseFaNumber(draft.rest);
    if (!name) {
      setError("نام حرکت را وارد کنید.");
      return;
    }
    if (sets === null || !Number.isInteger(sets) || sets < 1 || sets > 20) {
      setError("ست باید عددی صحیح بین ۱ تا ۲۰ باشد.");
      return;
    }
    if (!draft.reps.trim() || draft.reps.trim().length > 30) {
      setError("تکرار را وارد کنید؛ مثلاً «۱۰» یا «۸ تا ۱۲».");
      return;
    }
    if (rest === null || !Number.isInteger(rest) || rest < 0 || rest > 900) {
      setError("استراحت باید عددی بین ۰ تا ۹۰۰ ثانیه باشد.");
      return;
    }
    setError(null);
    onBusy(workout.id);
    try {
      await api.training.addExercise(workout.id, {
        name,
        sets,
        reps: draft.reps.trim(),
        restSeconds: rest,
      });
      setDraft({ name: "", sets: draft.sets, reps: draft.reps, rest: draft.rest });
      onChanged();
    } catch (cause) {
      onFail(cause, "حرکت افزوده نشد.");
      onChanged();
    } finally {
      onBusy(null);
    }
  };

  const move = async (exerciseId: string, orderIndex: number) => {
    onBusy(exerciseId);
    try {
      await api.training.patchExercise(exerciseId, { orderIndex });
      onChanged();
    } catch (cause) {
      onFail(cause, "جابه‌جایی ذخیره نشد.");
      onChanged();
    } finally {
      onBusy(null);
    }
  };

  const exercises = workout.exercises ?? [];

  return (
    <Card tone="sunken" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Field label="نام تمرین" htmlFor={`wt-${workout.id}`}>
          <div className="flex gap-2">
            <TextInput
              id={`wt-${workout.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || title.trim() === workout.title}
              onClick={() => void patch({ title: title.trim() }, "نام ذخیره نشد.")}
            >
              ذخیره
            </Button>
          </div>
        </Field>

        <Field label="مدت (دقیقه)" htmlFor={`wm-${workout.id}`} hint="بین ۵ تا ۶۰۰">
          <div className="flex gap-2">
            <TextInput
              id={`wm-${workout.id}`}
              inputMode="numeric"
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(e.target.value)}
              className="max-w-[10ch]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const mins = parseFaNumber(minutes);
                if (mins === null || !Number.isInteger(mins) || mins < 5 || mins > 600) {
                  setError("مدت باید عددی صحیح بین ۵ تا ۶۰۰ دقیقه باشد.");
                  return;
                }
                void patch({ estimatedMinutes: mins }, "مدت ذخیره نشد.");
              }}
            >
              ذخیره
            </Button>
          </div>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-2xs text-ink-2">شدت</span>
          <Segmented
            label="شدت تمرین"
            options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_FA[i] }))}
            value={workout.intensity}
            onChange={(next) => void patch({ intensity: next }, "شدت ذخیره نشد.")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-2xs text-ink-2">وضعیت</span>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Choice
                key={s}
                selected={workout.status === s}
                disabled={busy}
                // status has its own endpoint; the PATCH schema deliberately
                // does not accept it, so completion is never a silent field edit
                onClick={() => {
                  if (workout.status === s) return;
                  onBusy(workout.id);
                  setError(null);
                  api.training
                    .setStatus(workout.id, s, workout.version)
                    .then(onChanged)
                    .catch((cause: unknown) => {
                      onFail(cause, "وضعیت ذخیره نشد.");
                      onChanged();
                    })
                    .finally(() => onBusy(null));
                }}
              >
                {WORKOUT_STATUS_FA[s]}
              </Choice>
            ))}
          </div>
        </div>
      </div>

      <Divider className="my-0" />      <div className="flex flex-col gap-3">
        <p className="text-2xs font-semibold text-ink-2">
          حرکت‌ها · {faNum(exercises.length)}
        </p>
        {exercises.length === 0 ? (
          <p className="text-2xs text-ink-3">هنوز حرکتی برای این تمرین ثبت نشده است.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exercises.map((e, i) => (
              <ExerciseCard
                key={e.id}
                exercise={{
                  id: e.id,
                  name: e.name,
                  sets: e.sets,
                  reps: e.reps,
                  restSeconds: e.restSeconds ?? undefined,
                  muscleGroup: e.muscleGroup ?? undefined,
                  equipment: e.equipment ?? undefined,
                  notes: e.notes ?? undefined,
                }}
                index={i}
                total={exercises.length}
                editable
                onMoveUp={i > 0 ? () => void move(e.id, i - 1) : undefined}
                onMoveDown={i < exercises.length - 1 ? () => void move(e.id, i + 1) : undefined}
                onDelete={() => onAskDeleteExercise({ id: e.id, name: e.name })}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 rounded-md border border-divider bg-card-2 p-3">
          <Field label="نام حرکت" htmlFor={`en-${workout.id}`}>
            <TextInput
              id={`en-${workout.id}`}
              value={draft.name}
              disabled={busy}
              placeholder="مثلاً اسکوات"
              onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="ست" htmlFor={`es-${workout.id}`}>
              <TextInput
                id={`es-${workout.id}`}
                inputMode="numeric"
                value={draft.sets}
                disabled={busy}
                onChange={(ev) => setDraft((d) => ({ ...d, sets: ev.target.value }))}
              />
            </Field>
            <Field label="تکرار" htmlFor={`er-${workout.id}`}>
              <TextInput
                id={`er-${workout.id}`}
                value={draft.reps}
                disabled={busy}
                onChange={(ev) => setDraft((d) => ({ ...d, reps: ev.target.value }))}
              />
            </Field>
            <Field label="استراحت (ثانیه)" htmlFor={`erest-${workout.id}`}>
              <TextInput
                id={`erest-${workout.id}`}
                inputMode="numeric"
                value={draft.rest}
                disabled={busy}
                onChange={(ev) => setDraft((d) => ({ ...d, rest: ev.target.value }))}
              />
            </Field>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            leading={<Plus size={13} aria-hidden />}
            onClick={() => void addExercise()}
          >
            افزودن حرکت
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="outline">نسخه {faNum(workout.version)}</Chip>
        <Button
          size="sm"
          variant="destructive"
          leading={<Trash2 size={13} aria-hidden />}
          disabled={busy}
          onClick={onAskDelete}
        >
          حذف تمرین
        </Button>
      </div>
    </Card>
  );
}
