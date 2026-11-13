import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
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
import { ErrorState, LoadingState } from "../components/states";
import { api, type WorkoutDto } from "../lib/api";
import { toDisplayWorkout } from "../lib/adapters";
import {
  INTENSITY_FA,
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

export function Workouts() {
  const today = useMemo(() => new Date(), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days = useMemo(() => weekOf(addDays(today, weekOffset * 7)), [today, weekOffset]);
  const from = toApiDate(days[0]);
  const to = toApiDate(days[6]);

  const week = useApiData(() => api.training.workouts({ from, to }), [from, to]);
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

  const totalMinutes = items.reduce((sum, w) => sum + (w.estimatedMinutes ?? 0), 0);
  const completedCount = items.filter((w) => w.status === "completed").length;

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

  const currentDayKey = selectedDayKey ?? toApiDate(today);

  return (
    <div className="flex flex-col gap-6 py-6 animate-rise">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <SectionTitle
          title="برنامه تمرینات ورزشی"
          description={
            week.loading
              ? undefined
              : `${faNum(items.length)} جلسه تمرینی · ${faNum(totalMinutes)} دقیقه حجم کل · ${faNum(completedCount)} انجام‌شده`
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                leading={<Sparkles size={14} className="text-ink" aria-hidden />}
                onClick={() => navigate("/chat?assistant=coach")}
              >
                مشورت با مربی
              </Button>
              <Button
                size="sm"
                variant="primary"
                leading={<Plus size={14} aria-hidden />}
                onClick={() => setAddFor(currentDayKey)}
              >
                تمرین جدید
              </Button>
            </div>
          }
        />
      </div>

      {/* Week Navigator */}
      <Card className="flex flex-col gap-4 p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <IconButton label="هفته قبل" size="sm" onClick={() => setWeekOffset((v) => v - 1)}>
              <ChevronRight size={16} aria-hidden />
            </IconButton>
            <IconButton label="هفته بعد" size="sm" onClick={() => setWeekOffset((v) => v + 1)}>
              <ChevronLeft size={16} aria-hidden />
            </IconButton>
            {weekOffset !== 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>
                این هفته
              </Button>
            ) : null}
          </div>

          <span className="text-sm font-bold text-ink">
            {faJalaliDay(days[0])} تا {faJalaliDay(days[6])} {weekLabel(days[0])}
            {weekOffset === 0 ? " (هفته جاری)" : ""}
          </span>
        </div>

        {/* Interactive Persian Week Day Strip */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map((day) => {
            const dayKey = toApiDate(day);
            const isToday = sameDay(day, today);
            const isSelected = selectedDayKey === dayKey || (!selectedDayKey && isToday);
            const dayWorkouts = byDay.get(dayKey) ?? [];
            const hasCompleted = dayWorkouts.some((w) => w.status === "completed");

            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => setSelectedDayKey(dayKey)}
                className={cx(
                  "group relative flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-all duration-200 active:scale-95",
                  isSelected
                    ? "border-ink bg-fill-strong text-canvas shadow-md scale-102"
                    : isToday
                      ? "border-white/30 bg-card-3 text-ink hover:border-ink/60"
                      : "border-line/60 bg-card-2/60 text-ink-2 hover:border-line hover:text-ink hover:bg-card-2",
                )}
              >
                <span className={cx("text-2xs font-medium leading-none", isSelected ? "text-canvas/80" : "text-ink-3")}>
                  {FA_WEEKDAY_SHORT[persianWeekIndex(day)]}
                </span>
                <span className="num text-base font-bold leading-tight">
                  {faJalaliDay(day)}
                </span>
                <div className="flex items-center gap-1">
                  {dayWorkouts.length > 0 ? (
                    <span
                      className={cx(
                        "size-1.5 rounded-full",
                        isSelected
                          ? "bg-canvas"
                          : hasCompleted
                            ? "bg-fill-strong"
                            : "bg-ink-3",
                      )}
                    />
                  ) : (
                    <span className="size-1.5 opacity-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {notice ? (
        <p role="alert" className="rounded-2xl border border-line bg-card-2 p-3 text-sm text-ink">
          {notice}
          <button type="button" className="ms-2 underline underline-offset-4" onClick={week.reload}>
            بارگذاری دوباره
          </button>
        </p>
      ) : null}

      {/* Week Workouts List */}
      {week.loading ? (
        <div className="flex flex-col gap-3">
          <LoadingState label="در حال بارگذاری تمرینات هفته" rows={3} />
        </div>
      ) : week.error ? (
        <ErrorState title="خطا در دریافت برنامه تمرینات" description={week.error.message} onRetry={week.reload} />
      ) : (
        <div className="flex flex-col gap-4">
          {days
            .filter((day) => !selectedDayKey || toApiDate(day) === selectedDayKey)
            .map((day) => {
              const key = toApiDate(day);
              const list = byDay.get(key) ?? [];
              const isToday = sameDay(day, today);

              return (
                <Card key={key} tone={isToday ? "raised" : "default"} className="flex flex-col gap-4">
                  {/* Day header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cx(
                          "num flex size-9 items-center justify-center rounded-full border text-sm font-bold",
                          isToday ? "border-ink bg-fill-strong text-canvas shadow-sm" : "border-line text-ink-2 bg-card-2",
                        )}
                      >
                        {faJalaliDay(day)}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-ink">{faWeekday(day)}</h3>
                          {isToday ? <Chip tone="solid">امروز</Chip> : null}
                        </div>
                        <p className="text-2xs text-ink-3">
                          {list.length === 0
                            ? "بدون جلسه تمرینی"
                            : `${faNum(list.length)} جلسه · ${faNum(list.reduce((s, w) => s + (w.estimatedMinutes ?? 0), 0))} دقیقه`}
                        </p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      leading={<Plus size={14} aria-hidden />}
                      onClick={() => setAddFor(addFor === key ? null : key)}
                    >
                      افزودن تمرین
                    </Button>
                  </div>

                  {/* Add Workout Form */}
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

                  {/* Workouts list for this day */}
                  {list.length === 0 && addFor !== key ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line/60 bg-card-2/40 py-8 text-center text-ink-3">
                      <Dumbbell size={28} strokeWidth={1.5} className="text-ink-4" />
                      <p className="text-sm">تمرینی برای این روز در نظر گرفته نشده است.</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        leading={<Plus size={14} />}
                        onClick={() => setAddFor(key)}
                      >
                        ثبت تمرین برای {faWeekday(day)}
                      </Button>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {list.map((raw) => {
                        const workout = toDisplayWorkout(raw);
                        const open = openId === raw.id;

                        return (
                          <li key={raw.id} className="flex flex-col gap-3">
                            <WorkoutCard
                              workout={workout}
                              className={open ? "border-ink" : undefined}
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

          {selectedDayKey && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedDayKey(null)}>
                مشاهده همه روزهای هفته
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={pending !== null}
        title={pending?.kind === "workout" ? "حذف جلسه تمرین" : "حذف حرکت تمرینی"}
        description={
          pending
            ? `آیا از حذف «${pending.title}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.`
            : ""
        }
        confirmLabel="حذف"
        destructive
        busy={busy !== null}
        onConfirm={() => void remove()}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

function NewWorkoutForm({
  date,
  busy,
  onCancel,
  onSubmit,
  error,
}: {
  date: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (body: {
    date: string;
    kind: WorkoutKind;
    title: string;
    intensity: Intensity;
    estimatedMinutes?: number;
  }) => void;
  error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<WorkoutKind>("strength");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [minutes, setMinutes] = useState("60");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const t = title.trim();
    if (!t) {
      setLocalError("نام تمرین را بنویسید.");
      return;
    }
    const mins = parseFaNumber(minutes);
    if (mins === null || !Number.isInteger(mins) || mins < 5 || mins > 600) {
      setLocalError("مدت باید عددی صحیح بین ۵ تا ۶۰۰ دقیقه باشد.");
      return;
    }
    setLocalError(null);
    onSubmit({
      date,
      kind,
      title: t,
      intensity,
      estimatedMinutes: mins,
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card-2 p-4 animate-scale-pop">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink">افزودن تمرین جدید</h4>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          انصراف
        </Button>
      </div>

      <Field label="نام تمرین" htmlFor={`nw-title-${date}`}>
        <TextInput
          id={`nw-title-${date}`}
          value={title}
          placeholder="مثلاً تمرین سینه و سرشانه"
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-ink-2">نوع تمرین</span>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <Choice key={k} selected={kind === k} onClick={() => setKind(k)} disabled={busy}>
                {WORKOUT_KIND_FA[k]}
              </Choice>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-ink-2">شدت تمرین</span>
          <Segmented
            label="شدت"
            options={INTENSITIES.map((i) => ({ value: i, label: INTENSITY_FA[i] }))}
            value={intensity}
            onChange={(next) => setIntensity(next)}
          />
        </div>
      </div>

      <Field label="مدت زمان تخمینی (دقیقه)" htmlFor={`nw-mins-${date}`} hint="بین ۵ تا ۶۰۰ دقیقه">
        <TextInput
          id={`nw-mins-${date}`}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          disabled={busy}
        />
      </Field>

      {localError || error ? (
        <p role="alert" className="text-sm text-ink">
          {localError ?? error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="primary" loading={busy} onClick={submit}>
          ثبت تمرین
        </Button>
      </div>
    </div>
  );
}

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
  onAskDeleteExercise: (exercise: { id: string; name: string }) => void;
}) {
  const [title, setTitle] = useState(workout.title);
  const [minutes, setMinutes] = useState(
    workout.estimatedMinutes ? String(workout.estimatedMinutes) : "",
  );
  const [draft, setDraft] = useState({ name: "", sets: "3", reps: "10", rest: "60" });
  const [error, setError] = useState<string | null>(null);

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
    <Card tone="sunken" className="flex flex-col gap-4 border-line/80">
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
          <span className="text-2xs text-ink-2">وضعیت جلسه</span>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Choice
                key={s}
                selected={workout.status === s}
                disabled={busy}
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

      <Divider className="my-0" />

      {/* Exercises list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">
            حرکت‌های تمرینی · {faNum(exercises.length)} حرکت
          </p>
        </div>

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

        {/* Add Exercise form */}
        <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-card-2 p-3.5">
          <h5 className="text-xs font-semibold text-ink">افزودن حرکت جدید</h5>
          <Field label="نام حرکت" htmlFor={`en-${workout.id}`}>
            <TextInput
              id={`en-${workout.id}`}
              value={draft.name}
              disabled={busy}
              placeholder="مثلاً اسکوات پا هالتر"
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
                placeholder="۱۰"
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
            افزودن این حرکت
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-divider">
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

function weekLabel(day: Date): string {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" }).formatToParts(day);
  return parts.find((p) => p.type === "month")?.value ?? "";
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "عملیات انجام نشد.";
}
