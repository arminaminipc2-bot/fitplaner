import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Apple,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Flame,
  Plus,
  Salad,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import {
  Button,
  Card,
  Chip,
  IconButton,
  SectionTitle,
} from "../components/ui";
import { MealComposer } from "../components/MealComposer";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { ErrorState, LoadingState } from "../components/states";
import { api, type MealDto, type NutritionTargetDto } from "../lib/api";
import { type MealSlot } from "../lib/domain";
import { faJalaliDay, faNum, faWeekday } from "../lib/format";
import { toApiDate } from "../lib/jalali";
import { addDays, sameDay } from "../lib/persian";
import { useApiData, useSubmit } from "../lib/useApiData";

const SLOTS: Array<{ id: MealSlot; label: string; icon: typeof Coffee; hint: string }> = [
  { id: "breakfast", label: "صبحانه", icon: Coffee, hint: "شروع روز با پروتئین و فیبر کافی" },
  { id: "lunch", label: "ناهار", icon: Utensils, hint: "وعده اصلی میانه روز" },
  { id: "dinner", label: "شام", icon: Salad, hint: "پروتئین سبک و کربوهیدرات کنترل‌شده" },
  { id: "snack", label: "میان‌وعده", icon: Apple, hint: "میوه، مغزها، ماست یونانی یا شیک" },
];

export function Nutrition() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [dayOffset, setDayOffset] = useState(0);
  const activeDate = useMemo(() => addDays(today, dayOffset), [today, dayOffset]);
  const activeDateIso = toApiDate(activeDate);

  const [composerMode, setComposerMode] = useState<"text" | "photo" | null>(null);
  const [mealToDelete, setMealToDelete] = useState<{ id: string; name: string } | null>(null);

  const mealsData = useApiData(() => api.nutrition.meals({ from: activeDateIso, to: activeDateIso }), [activeDateIso]);
  const targetData = useApiData(() => api.nutrition.targets(), []);
  const deleteSubmit = useSubmit();

  const meals: MealDto[] = mealsData.data?.items ?? [];
  const target: NutritionTargetDto | null = targetData.data ?? null;

  const consumed = useMemo(() => {
    return meals.reduce(
      (acc, m) => ({
        kcal: acc.kcal + (m.totals?.kcal ?? 0),
        proteinG: acc.proteinG + (m.totals?.proteinG ?? 0),
        carbsG: acc.carbsG + (m.totals?.carbsG ?? 0),
        fatG: acc.fatG + (m.totals?.fatG ?? 0),
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  }, [meals]);

  const removeMeal = async () => {
    if (!mealToDelete) return;
    const ok = await deleteSubmit.run(() => api.nutrition.deleteMeal(mealToDelete.id));
    if (ok) {
      setMealToDelete(null);
      mealsData.reload();
    }
  };

  const isToday = sameDay(activeDate, today);

  return (
    <div className="flex flex-col gap-6 py-6 animate-rise">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <SectionTitle
          title="برنامه غذا و تغذیه"
          description={
            mealsData.loading
              ? undefined
              : `${faNum(meals.length)} وعده ثبت‌شده · ${faNum(Math.round(consumed.kcal))} ک‌کال مصرف‌شده`
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                leading={<Sparkles size={14} className="text-ink" aria-hidden />}
                onClick={() => navigate("/chat?assistant=nutritionist")}
              >
                متخصص تغذیه
              </Button>
              <Button
                size="sm"
                variant="primary"
                leading={<Plus size={14} aria-hidden />}
                onClick={() => {
                  setComposerMode("text");
                }}
              >
                ثبت وعده
              </Button>
            </div>
          }
        />
      </div>

      {/* Date Switcher */}
      <Card className="flex items-center justify-between p-3.5 shadow-card">
        <div className="flex items-center gap-1.5">
          <IconButton label="روز قبل" size="sm" onClick={() => setDayOffset((v) => v - 1)}>
            <ChevronRight size={16} aria-hidden />
          </IconButton>
          <IconButton label="روز بعد" size="sm" onClick={() => setDayOffset((v) => v + 1)}>
            <ChevronLeft size={16} aria-hidden />
          </IconButton>
          {!isToday ? (
            <Button size="sm" variant="ghost" onClick={() => setDayOffset(0)}>
              امروز
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-ink-3" aria-hidden />
          <span className="text-sm font-bold text-ink">
            {faWeekday(activeDate)}، {faJalaliDay(activeDate)} {monthLabel(activeDate)}
            {isToday ? " (امروز)" : ""}
          </span>
        </div>
      </Card>

      {/* Daily Target Progress Strip */}
      <Card tone="default" className="flex flex-col gap-5 p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-fill-strong text-canvas font-bold">
              <Flame size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-ink">توازن کالری و درشت‌مغذی‌ها</h3>
              <p className="text-2xs text-ink-3">
                {target ? `هدف روزانه: ${faNum(target.kcal)} کیلوکالری` : "هدف روزانه تعیین نشده است"}
              </p>
            </div>
          </div>
          {target ? (
            <span className="num text-base font-bold text-ink">
              {target.kcal > 0 ? `${faNum(Math.round((consumed.kcal / target.kcal) * 100))}٪ هدف` : ""}
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={() => navigate("/profile")}>
              تنظیم هدف
            </Button>
          )}
        </div>

        {/* Meters Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Calories */}
          <div className="flex flex-col gap-2 rounded-2xl border border-divider bg-card-2 p-3.5">
            <span className="text-2xs font-medium text-ink-3">انرژی (کالری)</span>
            <div className="flex items-baseline gap-1">
              <span className="num text-xl font-bold text-ink">{faNum(Math.round(consumed.kcal))}</span>
              <span className="text-2xs text-ink-3">/ {target ? faNum(target.kcal) : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-fill-strong transition-all duration-300"
                style={{
                  width: `${target && target.kcal > 0 ? Math.min(100, (consumed.kcal / target.kcal) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Protein */}
          <div className="flex flex-col gap-2 rounded-2xl border border-divider bg-card-2 p-3.5">
            <span className="text-2xs font-medium text-ink-3">پروتئین</span>
            <div className="flex items-baseline gap-1">
              <span className="num text-xl font-bold text-ink">{faNum(Math.round(consumed.proteinG))}</span>
              <span className="text-2xs text-ink-3">/ {target ? `${faNum(target.proteinG)}g` : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-fill-strong transition-all duration-300"
                style={{
                  width: `${target && target.proteinG > 0 ? Math.min(100, (consumed.proteinG / target.proteinG) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Carbs */}
          <div className="flex flex-col gap-2 rounded-2xl border border-divider bg-card-2 p-3.5">
            <span className="text-2xs font-medium text-ink-3">کربوهیدرات</span>
            <div className="flex items-baseline gap-1">
              <span className="num text-xl font-bold text-ink">{faNum(Math.round(consumed.carbsG))}</span>
              <span className="text-2xs text-ink-3">/ {target ? `${faNum(target.carbsG)}g` : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-fill-mid transition-all duration-300"
                style={{
                  width: `${target && target.carbsG > 0 ? Math.min(100, (consumed.carbsG / target.carbsG) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Fat */}
          <div className="flex flex-col gap-2 rounded-2xl border border-divider bg-card-2 p-3.5">
            <span className="text-2xs font-medium text-ink-3">چربی</span>
            <div className="flex items-baseline gap-1">
              <span className="num text-xl font-bold text-ink">{faNum(Math.round(consumed.fatG))}</span>
              <span className="text-2xs text-ink-3">/ {target ? `${faNum(target.fatG)}g` : "—"}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-fill-mid transition-all duration-300"
                style={{
                  width: `${target && target.fatG > 0 ? Math.min(100, (consumed.fatG / target.fatG) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Quick Action Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setComposerMode("text"); // Opens composer with database mode
          }}
          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-card-2 p-4 text-start transition-all duration-200 hover:border-ink/50 hover:bg-card-3 active:scale-98 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-weak text-ink group-hover:scale-105 transition-transform">
              <Plus size={18} />
            </span>
            <div>
              <h4 className="text-sm font-bold text-ink">بانک جامع غذا</h4>
              <p className="text-2xs text-ink-3">جستجو در غذاهای ایرانی و بین‌المللی با محاسبه‌گر واحد</p>
            </div>
          </div>
          <ChevronLeft size={16} className="text-ink-3 group-hover:text-ink transition-colors" />
        </button>

        <button
          type="button"
          onClick={() => {
            setComposerMode("photo"); // Opens composer in AI mode
          }}
          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-card-2 p-4 text-start transition-all duration-200 hover:border-ink/50 hover:bg-card-3 active:scale-98 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-weak text-ink group-hover:scale-105 transition-transform">
              <Sparkles size={18} />
            </span>
            <div>
              <h4 className="text-sm font-bold text-ink">تحلیل هوشمند غذا</h4>
              <p className="text-2xs text-ink-3">تحلیل خودکار با عکس، صوت تبدیل به متن یا پیام متنی</p>
            </div>
          </div>
          <ChevronLeft size={16} className="text-ink-3 group-hover:text-ink transition-colors" />
        </button>
      </div>

      {/* Meals by Slot */}
      {mealsData.loading ? (
        <LoadingState label="در حال بارگذاری وعده‌های غذایی" rows={3} />
      ) : mealsData.error ? (
        <ErrorState title="خطا در دریافت وعده‌ها" description={mealsData.error.message} onRetry={mealsData.reload} />
      ) : (
        <div className="flex flex-col gap-4">
          {SLOTS.map((slot) => {
            const slotMeals = meals.filter((m) => m.slot === slot.id);
            const slotKcal = slotMeals.reduce((s, m) => s + (m.totals?.kcal ?? 0), 0);
            const slotProtein = slotMeals.reduce((s, m) => s + (m.totals?.proteinG ?? 0), 0);
            const Icon = slot.icon;

            return (
              <Card key={slot.id} className="flex flex-col gap-4 p-5 shadow-card">
                {/* Slot Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full border border-line bg-card-2 text-ink">
                      <Icon size={18} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-ink">{slot.label}</h4>
                        {slotMeals.length > 0 ? (
                          <Chip tone="neutral">{faNum(slotMeals.length)} وعده</Chip>
                        ) : null}
                      </div>
                      <p className="text-2xs text-ink-3">{slot.hint}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {slotMeals.length > 0 ? (
                      <div className="text-end">
                        <span className="num block text-sm font-bold text-ink">{faNum(Math.round(slotKcal))} ک‌کال</span>
                        <span className="num block text-2xs text-ink-3">{faNum(Math.round(slotProtein * 10) / 10)}g پروتئین</span>
                      </div>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      leading={<Plus size={14} aria-hidden />}
                      onClick={() => {
                        setComposerMode("text");
                      }}
                    >
                      افزودن
                    </Button>
                  </div>
                </div>

                {/* Slot Meals Items */}
                {slotMeals.length === 0 ? (
                  <div className="flex items-center justify-between rounded-2xl border border-dashed border-line/60 bg-card-2/40 px-4 py-3 text-ink-3 text-xs">
                    <span>هنوز غذایی برای {slot.label} ثبت نشده است.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setComposerMode("text");
                      }}
                      className="text-ink hover:underline font-medium"
                    >
                      + ثبت غذا
                    </button>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {slotMeals.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-col gap-2 rounded-2xl border border-divider bg-card-2/80 p-3.5 transition-all hover:border-line"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-semibold text-sm text-ink">{m.name}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {m.source?.startsWith("ai_") ? (
                                <Chip tone="solid">
                                  <Sparkles size={10} className="inline ms-1" />
                                  هوش مصنوعی
                                </Chip>
                              ) : null}
                              {m.items && m.items.length > 0 ? (
                                <span className="text-2xs text-ink-3">
                                  {m.items.map((i) => `${i.name} (${faNum(i.amount)} ${i.unit})`).join(" + ")}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-end">
                              <span className="num block text-sm font-bold text-ink">{faNum(Math.round(m.totals?.kcal ?? 0))} ک‌کال</span>
                              <span className="num block text-2xs text-ink-3">
                                {faNum(Math.round((m.totals?.proteinG ?? 0) * 10) / 10)}g پ | {faNum(Math.round((m.totals?.carbsG ?? 0) * 10) / 10)}g ک
                              </span>
                            </div>
                            <IconButton
                              label="حذف این غذا"
                              size="sm"
                              onClick={() => setMealToDelete({ id: m.id, name: m.name })}
                            >
                              <Trash2 size={13} aria-hidden />
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={mealToDelete !== null}
        title="حذف وعده غذایی"
        description={
          mealToDelete
            ? `آیا از حذف وعده «${mealToDelete.name}» مطمئن هستید؟`
            : ""
        }
        confirmLabel="حذف"
        destructive
        busy={deleteSubmit.pending}
        onConfirm={() => void removeMeal()}
        onClose={() => setMealToDelete(null)}
      />

      {/* Fullscreen / Drawer Meal Composer */}
      {composerMode ? (
        <MealComposer
          open={composerMode !== null}
          aiReady={true}
          initialMode={composerMode}
          onClose={() => setComposerMode(null)}
          onSaved={() => {
            setComposerMode(null);
            mealsData.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function monthLabel(day: Date): string {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" }).formatToParts(day);
  return parts.find((p) => p.type === "month")?.value ?? "";
}
