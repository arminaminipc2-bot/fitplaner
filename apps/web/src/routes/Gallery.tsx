import { useMemo, useState } from "react";
import { Bell, KeyRound, LogOut, Shield } from "lucide-react";
import {
  Button,
  Card,
  CardHead,
  Chip,
  Divider,
  Field,
  IconButton,
  Meter,
  SectionTitle,
  Segmented,
  TextInput,
} from "../components/ui";
import { ProgressRing, StatusDot } from "../components/ProgressRing";
import { StatCard } from "../components/StatCard";
import { WorkoutCard } from "../components/WorkoutCard";
import { NutritionCard } from "../components/NutritionCard";
import { ActivityCalendar, WeeklyCalendar, type ScheduledDay } from "../components/Calendar";
import { ChartCard } from "../components/ChartCard";
import { MeasurementCard } from "../components/MeasurementCard";
import { ExerciseCard } from "../components/ExerciseCard";
import { ChatMessage } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";
import { VoiceInput, type SttStatus } from "../components/VoiceInput";
import { FoodAnalysisCard, type FoodDraft } from "../components/FoodAnalysisCard";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { SettingsSection } from "../components/SettingsSection";
import {
  WORKOUT_KIND_FA,
  type Exercise,
  type PlanChange,
  type Workout,
} from "../lib/domain";
import { weekOf } from "../lib/persian";
import { faCount, faNum, faUnitShort } from "../lib/format";

/* ---------- fixtures: real-shaped data, clearly labelled as samples ---------- */

const EXERCISES: Exercise[] = [
  { id: "e1", name: "پرس سینه هالتر", sets: 4, reps: "۶–۸", restSeconds: 150, muscleGroup: "سینه", equipment: "هالتر", performedWeightKg: 72.5, performedReps: 7 },
  { id: "e2", name: "پرس شانه دمبل", sets: 3, reps: "۱۰", restSeconds: 90, muscleGroup: "شانه", equipment: "دمبل" },
  { id: "e3", name: "پشت بازو سیم‌کش", sets: 3, reps: "۱۲", restSeconds: 60, muscleGroup: "سه‌سر بازو", equipment: "سیم‌کش" },
];

const WORKOUTS: Workout[] = [
  {
    id: "w1",
    name: "تمرین بالاتنه فشاری",
    kind: "strength",
    muscleGroups: ["سینه", "سه‌سر بازو", "شانه"],
    scheduledDate: isoDay(1),
    intensity: "high",
    estimatedMinutes: 55,
    status: "scheduled",
    done: false,
    exerciseCount: 3,
    // a four-week program: six of eight sessions already logged
    version: 4,
    sessions: { completed: 6, total: 8 },
    exercises: EXERCISES,
  },
  {
    id: "w2",
    name: "تمرین سرعت و چابکی",
    kind: "speed",
    muscleGroups: ["پا", "مرکز بدن"],
    scheduledDate: isoDay(3),
    intensity: "moderate",
    estimatedMinutes: 40,
    status: "completed",
    done: true,
    exerciseCount: 2,
    version: 1,
    exercises: [
      { id: "e4", name: "اسپرینت ۲۰ متر", sets: 6, reps: "۱ تکرار", restSeconds: 120, muscleGroup: "پا" },
      { id: "e5", name: "تغییر جهت با توپ", sets: 4, reps: "۸", restSeconds: 75, muscleGroup: "پا" },
    ],
  },
];

const TARGETS = { kcal: 2750, protein: 180, carbs: 320, fat: 80, waterMl: 3200 };
const INTAKE = { kcal: 2140, protein: 151, carbs: 238, fat: 62, waterMl: 2100 };

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(8, 30, 0, 0);
  return d.toISOString();
}

const CHANGES: PlanChange[] = [
  {
    id: "c1",
    summary: "جابه‌جایی تمرین سه‌شنبه به یکشنبه",
    detail: ["حجم تمرین یکسان می‌ماند", "فاصله تا مسابقه پنجشنبه به دو روز می‌رسد"],
    destructive: false,
  },
  {
    id: "c2",
    summary: "حذف یک جلسه تمرین قدرتی این هفته",
    detail: ["سه جلسه سنگین به دو جلسه تبدیل می‌شود", "پیشینه جلسات حذف‌شده باقی می‌ماند"],
    destructive: true,
  },
];

/* ---------- gallery ---------- */

export function Gallery() {
  const [range, setRange] = useState<"week" | "month" | "quarter">("week");
  const [stt, setStt] = useState<SttStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [draft, setDraft] = useState<FoodDraft>({
    name: "چلو مرغ با ماست",
    kcal: 720,
    protein: 48,
    carbs: 74,
    fat: 21,
  });
  const [editingFood, setEditingFood] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>(EXERCISES);
  const [text, setText] = useState("");

  const week = useMemo<ScheduledDay[]>(() => {
    const days = weekOf(new Date());
    const map = [
      { kind: "strength" as const, status: "completed" as const, at: 7 },
      { kind: "recovery" as const, status: "completed" as const, at: 18 },
      { kind: "football" as const, status: "planned" as const, at: 17 },
      { kind: "rest" as const, status: "rest" as const, at: null },
      { kind: "speed" as const, status: "today" as const, at: 10 },
      { kind: "match" as const, status: "planned" as const, at: 20 },
      { kind: "cardio" as const, status: "missed" as const, at: 8 },
    ];
    return days.map((d, i) => {
      const pick = map[i];
      const scheduled = new Date(d);
      if (pick.at !== null) scheduled.setHours(pick.at, 0, 0, 0);
      return {
        date: d.toISOString(),
        kind: pick.kind,
        status: pick.status,
        workout: pick.kind === "rest" ? undefined : WORKOUTS[i % WORKOUTS.length],
        time: pick.at === null ? undefined : scheduled.toISOString(),
      };
    });
  }, []);

  const activityDays = useMemo(() => {
    const out: Record<string, "completed" | "planned" | "missed" | "rest"> = {};
    for (let i = 0; i < 35; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = i % 7;
      if (r === 0 || r === 3) out[key] = "completed";
      else if (r === 5) out[key] = "missed";
      else if (r === 1) out[key] = "planned";
    }
    return out;
  }, []);

  const weightSeries = [
    { label: "هفته ۱", value: 78.4 },
    { label: "هفته ۲", value: 77.9 },
    { label: "هفته ۳", value: 78.1 },
    { label: "هفته ۴", value: 77.2 },
    { label: "هفته ۵", value: 76.8 },
    { label: "هفته ۶", value: 76.9 },
    { label: "هفته ۷", value: 76.1 },
  ];

  return (
    <div className="flex flex-col gap-8 py-6">
      <header className="flex flex-col gap-2">
        <p className="text-2xs text-ink-3">
          مرحله {faCount(2)} — سامانه طراحی. داده‌های این صفحه نمونه‌اند و از سرور نمی‌آیند.
        </p>
        <h2 className="text-2xl font-bold">گالری اجزای رابط کاربری</h2>
      </header>

      {/* ---------- primitives ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="عناصر پایه" description="دکمه‌ها، برچسب‌ها، ورودی‌ها و مترها" />
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">ذخیره</Button>
            <Button variant="secondary">ویرایش</Button>
            <Button variant="ghost">لغو</Button>
            <Button variant="outline">جزئیات</Button>
            <Button variant="destructive">حذف برنامه</Button>
            <Button loading>در حال ذخیره</Button>
            <Button disabled>غیرفعال</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>سینه</Chip>
            <Chip tone="solid">انجام شد</Chip>
            <Chip tone="outline">تقریبی</Chip>
            <IconButton label="اعلان‌ها">
              <Bell size={17} />
            </IconButton>
            <IconButton label="کلیدهای API">
              <KeyRound size={17} />
            </IconButton>
            <IconButton label="خروج">
              <LogOut size={17} />
            </IconButton>
          </div>
          <Segmented
            label="بازه زمانی"
            value={range}
            onChange={setRange}
            options={[
              { value: "week", label: "هفته اخیر" },
              { value: "month", label: "ماه اخیر" },
              { value: "quarter", label: "سه ماه" },
            ]}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="وزن فعلی" hint="به کیلوگرم">
              <TextInput inputMode="decimal" placeholder="۷۶٫۵" />
            </Field>
            <Field label="ایمیل" error="قالب ایمیل معتبر نیست">
              <TextInput ltr defaultValue="user@" />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Meter label="پروتئین" valueLabel={faUnitShort(151, "g")} value={151} max={180} />
            <Meter label="آب" valueLabel={faNum(2.1, 1) + " لیتر"} value={2100} max={3200} />
          </div>
          <div className="flex items-center gap-4 text-2xs text-ink-3">
            <span className="flex items-center gap-2">
              <StatusDot tone="strong" /> کامل
            </span>
            <span className="flex items-center gap-2">
              <StatusDot tone="mid" /> در حال
            </span>
            <span className="flex items-center gap-2">
              <StatusDot tone="weak" /> کم
            </span>
            <span className="flex items-center gap-2">
              <StatusDot tone="ring" /> امروز
            </span>
          </div>
        </Card>
      </section>

      {/* ---------- stat cards + rings ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="کارت‌های آمار و حلقه‌های پیشرفت" />
        <div className="grid grid-cols-2 gap-3 desktop:grid-cols-4">
          <StatCard label="پیشرفت هفتگی" value="۳/۵" unit="جلسه" delta={0.5} deltaLabel="نسبت به هفته قبل" />
          <StatCard label="وزن فعلی" value={faNum(76.1, 1)} unit="کیلوگرم" delta={-0.8} />
          <StatCard label="کالری امروز" value={2140} unit="کیلوکالری" deltaLabel="۶۱۰ تا هدف" />
          <StatCard label="هدف روزانه" value={2750} unit="کیلوکالری" />
        </div>
        <Card className="flex flex-wrap items-center gap-6">
          <ProgressRing
            value={3}
            max={5}
            label="جلسات انجام‌شده این هفته"
            center={
              <>
                <span className="num text-lg font-bold">{faCount(60)}٪</span>
                <span className="text-2xs text-ink-3">هفته</span>
              </>
            }
          />
          <ProgressRing value={2140} max={2750} tone="mid" size={56} label="کالری" center={<span className="num text-2xs">{faCount(78)}٪</span>} />
          <ProgressRing value={151} max={180} tone="weak" size={56} label="پروتئین" center={<span className="num text-2xs">{faCount(84)}٪</span>} />
          <ProgressRing value={0} max={1} size={56} tone="hollow" label="آب" center={<span className="text-2xs text-ink-3">۰٪</span>} />
        </Card>
      </section>

      {/* ---------- workouts ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="کارت تمرین و جزئیات حرکت" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WORKOUTS.map((w) => (
            <WorkoutCard key={w.id} workout={w} onOpen={() => undefined} onToggleDone={() => undefined} />
          ))}
        </div>

        <Card className="flex flex-col gap-3">
          <CardHead
            title={WORKOUTS[0].name}
            meta={`${WORKOUT_KIND_FA[WORKOUTS[0].kind]} · ${faNum(WORKOUTS[0].estimatedMinutes)} دقیقه`}
            action={<Chip tone="outline">{faCount(EXERCISES.length)} حرکت</Chip>}
          />
          <ul className="flex flex-col gap-2">
            {exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                index={i}
                total={exercises.length}
                editable
                onMoveUp={() => setExercises((list) => swap(list, i - 1, i))}
                onMoveDown={() => setExercises((list) => swap(list, i, i + 1))}
                onEdit={() => undefined}
                onDelete={() => setExercises((list) => list.filter((e) => e.id !== ex.id))}
              />
            ))}
            {exercises.length === 0 ? (
              <EmptyState
                title="حرکتی باقی نمانده"
                description="یک حرکت جدید اضافه کنید تا این تمرین دوباره قابل اجرا شود."
                action={<Button variant="outline" size="sm">افزودن حرکت</Button>}
              />
            ) : null}
          </ul>
          <Divider />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setExercises(EXERCISES)}>
              بازگردانی ترتیب
            </Button>
            <Button variant="secondary" size="sm" onClick={() => undefined}>
              افزودن حرکت
            </Button>
          </div>
        </Card>
      </section>

      {/* ---------- calendars + nutrition ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="تقویم فعالیت و برنامه هفتگی" />
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
          <ActivityCalendar end={new Date()} days={activityDays} />
          <WeeklyCalendar week={week} onOpenDay={() => undefined} />
        </div>
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
          <NutritionCard intake={INTAKE} targets={TARGETS} onAddMeal={() => undefined} />
          <div className="flex flex-col gap-3">
            <ChartCard
              title="روند وزن"
              meta={`۷ هفته · ${faNum(76.1, 1)} کیلوگرم فعلی`}
              points={weightSeries}
              unit="کیلوگرم"
              variant="area"
            />
            <MeasurementGrid />
          </div>
        </div>
      </section>

      {/* ---------- chat ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="گفت‌وگو با دستیارها" />
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <ChatMessage
              role="user"
              content="این هفته خیلی خسته‌ام و پنجشنبه مسابقه دارم. می‌شود برنامه را سبک‌تر کنید؟"
              at={new Date()}
            />
            <ChatMessage
              role="coach"
              content="برنامه فعلی شما سه جلسه سنگین دارد. با توجه به مسابقه پنجشنبه، جلسه سه‌شنبه را حذف می‌کنم و تمرین سرعت را به یکشنبه منتقل می‌کنم تا ریکاوری دو روز کامل داشته باشید."
              at={new Date()}
            >
              <div className="mt-3 flex flex-col gap-2 rounded-md border border-divider bg-card-2 p-3">
                <p className="text-2xs font-semibold text-ink-2">تغییرات پیشنهادی</p>
                {CHANGES.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-2xs text-ink-3">
                    <Shield size={12} className="mt-1 shrink-0" aria-hidden />
                    <span>{c.summary}</span>
                  </div>
                ))}
                <Button size="sm" variant="primary" onClick={() => setDialogOpen(true)}>
                  مشاهده و تأیید تغییرات
                </Button>
              </div>
            </ChatMessage>
            <ChatMessage role="nutritionist" content="" at={new Date()} streaming />
          </div>
          <ChatInput
            value={text}
            onChange={setText}
            onSend={() => setText("")}
            onVoice={() => setVoiceOpen((v) => !v)}
            onAttach={() => undefined}
          />
          {voiceOpen ? (
            <VoiceInput
              status={stt}
              engineLabel="موتور مرورگر"
              needsNetwork
              transcript={transcript}
              onTranscriptChange={setTranscript}
              onStart={() => setStt("listening")}
              onStop={() => setStt("processing")}
              onConfirm={() => setStt("idle")}
              className="mt-1"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setStt("unsupported")}>
              شبیه‌سازی دستگاه بدون پشتیبانی
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStt("idle")}>
              حالت عادی
            </Button>
          </div>
        </Card>
      </section>

      {/* ---------- food analysis ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="تحلیل تصویر و متن غذا" />
        <FoodAnalysisCard
          draft={draft}
          onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          items={["برنج سفید", "سینه مرغ", "ماست"]}
          portions={["یک بشقاب", "۱۲۰ گرم", "نصف کاسه"]}
          ingredients={["روغن زیتون", "نمک", "فلفل"]}
          explanation="مدل سه ماده را تشخیص داد و حجم را از نسبت بشقاب تخمین زد. تخمین کالری بر پایه وزن خام پخته شده است و می‌تواند تا ۱۵ درصد خطا داشته باشد."
          confidence={0.54}
          source="ai_photo"
          editing={editingFood}
          onToggleEditing={() => setEditingFood((v) => !v)}
          onSave={() => undefined}
          onDiscard={() => undefined}
        />
      </section>

      {/* ---------- states ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="حالت‌های خالی، بارگذاری و خطا" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card tone="sunken" padded={false}>
            <EmptyState
              title="هنوز وزنی ثبت نکرده‌اید"
              description="با یک اندازه‌گیری شروع کنید تا روند وزن شما در نمودار نمایش داده شود."
              action={<Button variant="primary" size="sm">ثبت وزن</Button>}
            />
          </Card>
          <LoadingState label="در حال خواندن برنامه هفتگی" />
          <ErrorState
            title="ارتباط با سرور برقرار نشد"
            description="این عدد نشان داده نشده چون به آن دسترسی نداریم، نه چون صفر است."
            onRetry={() => undefined}
          />
        </div>
      </section>

      {/* ---------- settings ---------- */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="بخش‌های تنظیمات" />
        <div className="flex flex-col gap-3">
          <SettingsSection
            title="مشخصات فردی"
            description="قد، وزن، تاریخ تولد و سطح فعالیت"
            summary="۵ از ۶ وارد شده"
            required
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="قد" htmlFor="h">
                <TextInput id="h" inputMode="decimal" defaultValue="178" />
              </Field>
              <Field label="تاریخ تولد" htmlFor="b">
                <TextInput id="b" defaultValue="۱۳۷۵/۰۴/۱۸" />
              </Field>
            </div>
          </SettingsSection>
          <SettingsSection
            title="کلیدهای هوش مصنوعی"
            description="کلیدها فقط در سرور نگه‌داری می‌شوند و هرگز به این مرورگر باز نمی‌گردند."
            defaultOpen={false}
            summary="۱ ارائه‌دهنده فعال"
          >
            <Field label="کلید OpenAI" hint="برای ذخیره، دوباره وارد کنید." htmlFor="k">
              <TextInput id="k" ltr type="password" placeholder="sk-…" />
            </Field>
            <p className="mt-2 flex items-center gap-2 text-2xs text-ink-3">
              <Shield size={11} aria-hidden />
              نمایش مخفی: ••••••••••••4832
            </p>
          </SettingsSection>
        </div>
      </section>

      <ConfirmationDialog
        open={dialogOpen}
        title="اعمال تغییرات مربی"
        description="پیش از ذخیره، لیست دقیق تغییراتی که روی برنامه هفتگی نوشته می‌شود را ببینید."
        changes={CHANGES}
        confirmLabel="تأیید و ذخیره"
        onConfirm={() => setDialogOpen(false)}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

function MeasurementGrid() {
  const base = new Date();
  const earlier = new Date();
  earlier.setDate(earlier.getDate() - 21);
  return (
    <div className="grid grid-cols-2 gap-3">
      <MeasurementCard metric="weight" value={76.1} previous={76.9} takenAt={base.toISOString()} quality="measured" />
      <MeasurementCard
        metric="bodyFat"
        value={18.4}
        previous={19.1}
        takenAt={earlier.toISOString()}
        quality="estimated"
        note="تخمین با روش محیطی؛ خطای حدود ۳ درصد."
      />
      <MeasurementCard metric="leanMass" value={62.1} previous={61.7} takenAt={base.toISOString()} quality="estimated" />
      <MeasurementCard metric="bmi" value={24.0} takenAt={base.toISOString()} quality="self-reported" note="برای ورزشکاران معیار کاملی نیست." />
    </div>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  if (a < 0 || b >= list.length || a >= list.length || b < 0) return list;
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
