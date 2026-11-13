import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  Database,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  Field,
  IconButton,
  TextInput,
  Textarea,
  cx,
} from "./ui";
import { DateField } from "./DateField";
import type { FoodDraft } from "./FoodAnalysisCard";
import {
  FOOD_UNIT_LABELS,
  calculateFoodNutrition,
  searchFoodDatabase,
  type FoodCategory,
  type FoodItemRecord,
  type FoodPortionUnit,
} from "../lib/food-database";
import { MEAL_SLOT_FA, type MealSlot, type RecordSource } from "../lib/domain";
import { faNum, parseFaNumber } from "../lib/format";
import { toApiDate } from "../lib/jalali";
import { api, ApiError, type FoodAnalysisDto, type FoodDraftInput } from "../lib/api";

type MainTab = "database" | "ai";
type AiMode = "photo" | "voice" | "text";

const CATEGORIES: Array<FoodCategory | "all"> = [
  "all",
  "خورشت و پلو",
  "کباب و پروتئین",
  "نان و غلات",
  "لبنیات و تخم‌مرغ",
  "حبوبات و خوراک",
  "میوه و سبزیجات",
  "مغزها و تنقلات",
  "فست‌فود و ساندویچ",
];

const CATEGORY_LABELS: Record<FoodCategory | "all", string> = {
  all: "همه غذاها",
  "خورشت و پلو": "خورشت و پلو",
  "کباب و پروتئین": "کباب و گوشت",
  "نان و غلات": "نان و غلات",
  "لبنیات و تخم‌مرغ": "لبنیات و تخم‌مرغ",
  "حبوبات و خوراک": "حبوبات و سنتی",
  "میوه و سبزیجات": "میوه و سبزی",
  "مغزها و تنقلات": "مغزها و تنقلات",
  "فست‌فود و ساندویچ": "فست‌فود و ساندویچ",
};

/* ---------- Speech recognition helpers ---------- */

type RecognitionResult = { isFinal: boolean; length: number };
interface RecognitionResultList extends ArrayLike<RecognitionResult> {
  [index: number]: RecognitionResult & { 0: { transcript: string } };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const MAX_IMAGE_BYTES = 3_000_000;

export type MealBasketItem = {
  id: string;
  name: string;
  foodId?: string;
  amount: number;
  unit: FoodPortionUnit;
  unitLabel: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/**
 * Overhauled Meal Composer:
 * 1. بانک غذا (Comprehensive searchable food catalog with custom quantities, units and live macro calculator).
 * 2. تحلیل هوشمند (AI Vision Photo, Voice-to-Text-with-Review, or Natural Text).
 */
export function MealComposer({
  open,
  aiReady,
  initialMode = "text",
  onClose,
  onSaved,
}: {
  open: boolean;
  aiReady: boolean;
  initialMode?: "text" | "photo" | "voice" | "manual";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<MainTab>(() => (initialMode === "manual" ? "database" : "database"));
  const [aiSubMode, setAiSubMode] = useState<AiMode>(() =>
    initialMode === "photo" ? "photo" : initialMode === "voice" ? "voice" : "text",
  );

  const [slot, setSlot] = useState<MealSlot>(() => {
    const hour = new Date().getHours();
    return hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 21 ? "dinner" : "snack";
  });
  const [date, setDate] = useState<Date>(() => new Date());

  /* ---------- Database tab state ---------- */
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | "all">("all");
  const [activeFood, setActiveFood] = useState<FoodItemRecord | null>(null);
  const [portionAmount, setPortionAmount] = useState<string>("1");
  const [portionUnit, setPortionUnit] = useState<FoodPortionUnit>("serving");

  // Meal items basket (allows adding multiple foods sequentially)
  const [basket, setBasket] = useState<MealBasketItem[]>([]);

  /* ---------- AI tab state ---------- */
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const [voiceSupported, setVoiceSupported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FoodAnalysisDto | null>(null);
  const [aiDraft, setAiDraft] = useState<FoodDraft>({ name: "", kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const [editingAi, setEditingAi] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setActiveFood(null);
    setPortionAmount("1");
    setBasket([]);
    setText("");
    setNote("");
    setImage(null);
    setVoiceText("");
    setVoiceError(null);
    setAnalysis(null);
    setAiDraft({ name: "", kcal: 0, protein: 0, carbs: 0, fat: 0 });
    setEditingAi(false);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    resetAll();
    if (initialMode === "photo") {
      setTab("ai");
      setAiSubMode("photo");
    } else if (initialMode === "voice") {
      setTab("ai");
      setAiSubMode("voice");
    } else {
      setTab("database");
    }
    setDate(new Date());
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !analyzing) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, saving, analyzing, onClose]);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  /* ---------- Database search results ---------- */
  const searchResults = useMemo(() => {
    return searchFoodDatabase(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory]);

  const selectFoodForPortion = (food: FoodItemRecord) => {
    setActiveFood(food);
    setPortionUnit(food.defaultUnit);
    setPortionAmount(String(food.defaultAmount));
  };

  const calculatedNutrients = useMemo(() => {
    if (!activeFood) return null;
    const parsedAmount = parseFaNumber(portionAmount) ?? 1;
    return calculateFoodNutrition(activeFood, parsedAmount, portionUnit);
  }, [activeFood, portionAmount, portionUnit]);

  const handleAddToBasket = () => {
    if (!activeFood || !calculatedNutrients) return;
    const parsedAmount = parseFaNumber(portionAmount) ?? 1;
    const unitOption = activeFood.availableUnits.find((u) => u.unit === portionUnit);
    const unitLabel = unitOption ? unitOption.label.split(" (")[0] : FOOD_UNIT_LABELS[portionUnit];

    const newItem: MealBasketItem = {
      id: `${activeFood.id}-${Date.now()}`,
      foodId: activeFood.id,
      name: activeFood.name,
      amount: parsedAmount,
      unit: portionUnit,
      unitLabel,
      grams: calculatedNutrients.grams,
      kcal: calculatedNutrients.kcal,
      proteinG: calculatedNutrients.proteinG,
      carbsG: calculatedNutrients.carbsG,
      fatG: calculatedNutrients.fatG,
    };

    setBasket((prev) => [...prev, newItem]);
    setActiveFood(null);
    setSearchQuery("");
  };

  const handleRemoveFromBasket = (id: string) => {
    setBasket((prev) => prev.filter((item) => item.id !== id));
  };

  const basketTotals = useMemo(() => {
    return basket.reduce(
      (acc, item) => ({
        kcal: Math.round(acc.kcal + item.kcal),
        proteinG: Math.round((acc.proteinG + item.proteinG) * 10) / 10,
        carbsG: Math.round((acc.carbsG + item.carbsG) * 10) / 10,
        fatG: Math.round((acc.fatG + item.fatG) * 10) / 10,
      }),
      { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
  }, [basket]);

  /* ---------- Speech Recognition Logic ---------- */
  const startVoice = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setVoiceSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "fa-IR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) final += `${result[0].transcript} `;
      }
      if (final.trim()) setVoiceText((prev) => (prev ? `${prev} ${final.trim()}` : final.trim()));
    };
    rec.onerror = (event) => {
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      setListening(false);
      setVoiceError(
        denied
          ? "دسترسی میکروفن داده نشد. می‌توانید وعده را تایپ کنید."
          : "تشخیص گفتار ناموفق بود. دوباره تلاش کنید یا متن را بنویسید.",
      );
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setVoiceError(null);
    setListening(true);
    rec.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const pickImage = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("فقط فایل تصویری (png، jpeg یا webp) قابل انتخاب است.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("حجم تصویر باید کمتر از ۳ مگابایت باشد.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => setError("خواندن تصویر ممکن نشد. فایل دیگری انتخاب کنید.");
    reader.readAsDataURL(file);
  };

  /* ---------- Run AI Analysis ---------- */
  const runAnalysis = async () => {
    setError(null);
    if (aiSubMode === "photo" && !image) {
      setError("لطفاً تصویری از غذا انتخاب کنید.");
      return;
    }
    if (aiSubMode === "text" && text.trim().length < 3) {
      setError("لطفاً غذای مصرفی را با چند کلمه بنویسید.");
      return;
    }
    if (aiSubMode === "voice" && voiceText.trim().length < 3) {
      setError("متن حاصل از گفتار خالی است. لطفاً صحبت کنید یا در کادر بنویسید.");
      return;
    }

    setAnalyzing(true);
    try {
      const result = await api.nutrition.analyze({
        ...(aiSubMode === "photo" ? { image: image ?? undefined, text: note.trim() || undefined } : {}),
        ...(aiSubMode === "text" ? { text: text.trim() } : {}),
        ...(aiSubMode === "voice" ? { text: voiceText.trim() } : {}),
        source: aiSubMode === "photo" ? "ai_photo" : aiSubMode === "voice" ? "ai_voice" : "ai_text",
      });
      setAnalysis(result);
      setAiDraft({
        name: result.name,
        kcal: result.totals.kcal,
        protein: result.totals.proteinG,
        carbs: result.totals.carbsG,
        fat: result.totals.fatG,
      });
      setEditingAi(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تحلیل هوشمند غذا انجام نشد. دوباره امتحان کنید.");
    } finally {
      setAnalyzing(false);
    }
  };

  /* ---------- Save Meal from Basket (Database tab) ---------- */
  const handleSaveBasket = async () => {
    if (basket.length === 0) {
      setError("حداقل یک غذا به وعده اضافه کنید.");
      return;
    }
    setSaving(true);
    setError(null);

    const mealName = basket.length === 1 ? basket[0].name : `${basket[0].name} و ${faNum(basket.length - 1)} قلم دیگر`;

    // Map units to supported backend FoodUnit ("g" | "ml" | "piece" | "tbsp" | "tsp" | "cup")
    const apiItems: FoodDraftInput[] = basket.map((item) => {
      const isNativeUnit = ["g", "ml", "piece", "tbsp", "tsp", "cup"].includes(item.unit);
      return {
        name: `${item.name} (${faNum(item.amount)} ${item.unitLabel})`,
        amount: isNativeUnit ? Math.max(0.1, item.amount) : Math.max(1, item.grams),
        unit: isNativeUnit ? (item.unit as "g" | "ml" | "piece" | "tbsp" | "tsp" | "cup") : "g",
        kcal: item.kcal,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        source: "manual",
      };
    });

    try {
      await api.nutrition.createMeal({
        date: toApiDate(date),
        slot,
        name: mealName,
        source: "manual",
        items: apiItems,
      });
      resetAll();
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ذخیره وعده انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Save Meal from AI Analysis ---------- */
  const handleSaveAiAnalysis = async () => {
    if (!analysis) return;
    setSaving(true);
    setError(null);

    const recordSource: RecordSource =
      aiSubMode === "photo" ? "ai_photo" : aiSubMode === "voice" ? "ai_voice" : "ai_text";

    try {
      const itemsPayload: FoodDraftInput[] =
        analysis.items.length > 0
          ? analysis.items.map((i) => ({
              name: i.name,
              amount: i.amount,
              unit: i.unit,
              kcal: i.kcal,
              proteinG: i.proteinG,
              carbsG: i.carbsG,
              fatG: i.fatG,
              source: recordSource,
              confidence: analysis.confidence,
            }))
          : [
              {
                name: aiDraft.name.trim(),
                amount: 1,
                unit: "piece",
                kcal: Math.max(0, aiDraft.kcal),
                proteinG: Math.max(0, aiDraft.protein),
                carbsG: Math.max(0, aiDraft.carbs),
                fatG: Math.max(0, aiDraft.fat),
                source: recordSource,
                confidence: analysis.confidence,
              },
            ];

      await api.nutrition.createMeal({
        date: toApiDate(date),
        slot,
        name: aiDraft.name.trim() || analysis.name,
        source: recordSource,
        confidence: analysis.confidence,
        note: analysis.explanation || undefined,
        items: itemsPayload,
      });
      resetAll();
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ذخیره وعده انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/85 p-2 backdrop-blur-md sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !analyzing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-composer-title"
        className="max-h-[94dvh] w-full max-w-2xl animate-rise overflow-y-auto rounded-t-3xl border border-line bg-card p-4 shadow-pop sm:rounded-3xl sm:p-6"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-card-2 border border-line text-ink">
              <Utensils size={18} />
            </span>
            <div>
              <h2 id="meal-composer-title" className="text-base font-bold text-ink sm:text-lg">
                ثبت وعده غذایی
              </h2>
              <p className="text-2xs text-ink-3">جستجو در بانک جامع غذا یا تحلیل هوشمند با عکس، صدا و متن</p>
            </div>
          </div>
          <IconButton label="بستن" size="sm" onClick={onClose} disabled={saving || analyzing}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>

        {/* Date and Slot Row */}
        <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Field label="وعده مورد نظر" htmlFor="meal-slot">
            <select
              id="meal-slot"
              className="h-11 w-full rounded-full border border-line bg-card-2 px-4 text-sm text-ink focus:border-ink focus:outline-none"
              value={slot}
              onChange={(e) => setSlot(e.target.value as MealSlot)}
            >
              {(Object.keys(MEAL_SLOT_FA) as MealSlot[]).map((key) => (
                <option key={key} value={key}>
                  {MEAL_SLOT_FA[key]}
                </option>
              ))}
            </select>
          </Field>
          <DateField label="تاریخ ثبت" value={date} onChange={(next) => next && setDate(next)} />
        </div>

        {/* The Two Main Sections Selector */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-full border border-line bg-card-2 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("database");
              setError(null);
            }}
            className={cx(
              "flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold transition-all duration-200 select-none",
              tab === "database"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-ink-2 hover:text-ink hover:bg-card-3/50",
            )}
          >
            <Database size={15} />
            <span>بانک غذا (جستجوی سریع)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("ai");
              setError(null);
            }}
            className={cx(
              "flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold transition-all duration-200 select-none",
              tab === "ai"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-ink-2 hover:text-ink hover:bg-card-3/50",
            )}
          >
            <Sparkles size={15} />
            <span>تحلیل هوشمند (عکس / صدا / متن)</span>
          </button>
        </div>

        {/* ========================================================
            TAB 1: بانک غذا (FOOD DATABASE)
            ======================================================== */}
        {tab === "database" ? (
          <div className="flex flex-col gap-4">
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <TextInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی غذا یا ماده اولیه (مثلاً: قورمه‌سبزی، فیله مرغ، برنج، موز، ماست...)"
                className="ps-10 pe-9 text-xs"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-2xs scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={cx(
                    "shrink-0 rounded-full px-3 py-1 text-2xs font-medium transition-all select-none",
                    selectedCategory === cat
                      ? "border border-ink bg-card-3 text-ink font-bold"
                      : "border border-line/60 bg-card-2 text-ink-3 hover:text-ink",
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Portion Calculator Drawer / Form (When food is selected) */}
            {activeFood ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-card-2 p-4 animate-scale-pop shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-ink">{activeFood.name}</h3>
                    <span className="text-2xs text-ink-3">دسته‌بندی: {activeFood.category}</span>
                  </div>
                  <IconButton label="بستن" size="sm" onClick={() => setActiveFood(null)}>
                    <X size={14} />
                  </IconButton>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Field label="مقدار مصرفی" htmlFor="portion-amount">
                    <TextInput
                      id="portion-amount"
                      inputMode="decimal"
                      value={portionAmount}
                      onChange={(e) => setPortionAmount(e.target.value)}
                      placeholder="۱"
                      className="text-center font-bold"
                    />
                  </Field>

                  <Field label="واحد اندازه‌گیری" htmlFor="portion-unit">
                    <select
                      id="portion-unit"
                      value={portionUnit}
                      onChange={(e) => setPortionUnit(e.target.value as FoodPortionUnit)}
                      className="h-11 w-full rounded-full border border-line bg-card-3 px-3 text-xs text-ink focus:border-ink focus:outline-none"
                    >
                      {activeFood.availableUnits.map((u) => (
                        <option key={u.unit} value={u.unit}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {calculatedNutrients ? (
                  <div className="grid grid-cols-4 gap-2 rounded-xl border border-divider/60 bg-card/60 p-2.5 text-center">
                    <div>
                      <span className="block text-2xs text-ink-3">کالری</span>
                      <span className="num block text-xs font-bold text-ink">{faNum(calculatedNutrients.kcal)}</span>
                    </div>
                    <div>
                      <span className="block text-2xs text-ink-3">پروتئین</span>
                      <span className="num block text-xs font-bold text-emerald-400">
                        {faNum(calculatedNutrients.proteinG)}g
                      </span>
                    </div>
                    <div>
                      <span className="block text-2xs text-ink-3">کربوهیدرات</span>
                      <span className="num block text-xs font-bold text-amber-400">
                        {faNum(calculatedNutrients.carbsG)}g
                      </span>
                    </div>
                    <div>
                      <span className="block text-2xs text-ink-3">چربی</span>
                      <span className="num block text-xs font-bold text-rose-400">
                        {faNum(calculatedNutrients.fatG)}g
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end pt-1">
                  <Button
                    variant="primary"
                    size="sm"
                    leading={<Plus size={14} />}
                    onClick={handleAddToBasket}
                  >
                    افزودن این غذا به وعده
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Food Search Results List */}
            <div className="max-h-56 overflow-y-auto flex flex-col gap-1.5 pe-1 scrollbar-thin">
              {searchResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line/60 bg-card-2/40 p-6 text-center text-xs text-ink-3">
                  غذایی با عبارت «{searchQuery}» در بانک پیدا نشد. می‌توانید با «تحلیل هوشمند» در تب بالا آن را ثبت کنید.
                </div>
              ) : (
                searchResults.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => selectFoodForPortion(food)}
                    className={cx(
                      "flex items-center justify-between gap-3 rounded-2xl border p-3 text-start transition-all duration-150 select-none",
                      activeFood?.id === food.id
                        ? "border-ink bg-card-3 text-ink shadow-sm"
                        : "border-line/70 bg-card-2 text-ink-2 hover:border-line hover:bg-card-3/70 hover:text-ink",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-ink">{food.name}</span>
                      <span className="text-2xs text-ink-3">
                        {food.category} · واحد پیش‌فرض: {FOOD_UNIT_LABELS[food.defaultUnit]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="num text-2xs font-semibold text-ink-2">
                        {faNum(food.kcalPer100g)} ک‌کال / ۱۰۰g
                      </span>
                      <span className="flex size-6 items-center justify-center rounded-full bg-card border border-line text-ink-3 group-hover:text-ink">
                        <Plus size={12} />
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Current Meal Basket List */}
            {basket.length > 0 ? (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-divider bg-card-2/80 p-4 animate-rise">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink">
                    اقلام انتخابی این وعده ({faNum(basket.length)} مورد)
                  </span>
                  <span className="text-2xs text-ink-3">می‌توانید چند غذا اضافه کرده و مجموع را ببینید</span>
                </div>

                <ul className="flex flex-col gap-2">
                  {basket.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-divider/60 bg-card p-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-ink">{item.name}</span>
                        <div className="flex items-center gap-2 text-2xs text-ink-3 mt-0.5">
                          <span>
                            {faNum(item.amount)} {item.unitLabel} ({faNum(item.grams)} گرم)
                          </span>
                          <span>·</span>
                          <span className="text-emerald-400">{faNum(item.proteinG)}g پ</span>
                          <span>·</span>
                          <span className="text-amber-400">{faNum(item.carbsG)}g ک</span>
                          <span>·</span>
                          <span className="text-rose-400">{faNum(item.fatG)}g چ</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="num font-bold text-ink">{faNum(item.kcal)} ک‌کال</span>
                        <IconButton
                          label="حذف"
                          size="sm"
                          onClick={() => handleRemoveFromBasket(item.id)}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Basket Running Summary Bar */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-card-3 p-3 text-xs">
                  <div>
                    <span className="block text-2xs text-ink-3">مجموع این وعده:</span>
                    <span className="num text-sm font-bold text-ink">
                      {faNum(basketTotals.kcal)} کیلوکالری
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-2xs text-ink-2">
                    <span>پروتئین: <strong className="text-emerald-400 font-bold">{faNum(basketTotals.proteinG)}g</strong></span>
                    <span>کربوهیدرات: <strong className="text-amber-400 font-bold">{faNum(basketTotals.carbsG)}g</strong></span>
                    <span>چربی: <strong className="text-rose-400 font-bold">{faNum(basketTotals.fatG)}g</strong></span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  block
                  loading={saving}
                  onClick={() => void handleSaveBasket()}
                >
                  ثبت نهایی وعده در برنامه
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ========================================================
            TAB 2: تحلیل هوشمند (SMART AI ANALYSIS)
            ======================================================== */}
        {tab === "ai" ? (
          <div className="flex flex-col gap-4">
            {!aiReady ? (
              <Card tone="sunken" className="flex items-start gap-3">
                <Sparkles size={15} className="mt-1 shrink-0 text-ink-3" aria-hidden />
                <p className="text-sm leading-relaxed text-ink-2">
                  کلید هوش مصنوعی ثبت نشده است. برای تحلیل خودکار عکس یا متن، ابتدا در تنظیمات کلید اضافه کنید. در حال حاضر می‌توانید از «بانک غذا» استفاده نمایید.
                </p>
              </Card>
            ) : null}

            {/* AI Sub-modes (عکس، صدا، متن) */}
            {!analysis ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAiSubMode("photo");
                      setError(null);
                    }}
                    className={cx(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold transition-all select-none",
                      aiSubMode === "photo"
                        ? "border-ink bg-card-3 text-ink shadow-sm"
                        : "border-line bg-card-2 text-ink-3 hover:text-ink hover:bg-card-3/60",
                    )}
                  >
                    <Camera size={18} />
                    <span>عکس غذا</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiSubMode("voice");
                      setError(null);
                    }}
                    className={cx(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold transition-all select-none",
                      aiSubMode === "voice"
                        ? "border-ink bg-card-3 text-ink shadow-sm"
                        : "border-line bg-card-2 text-ink-3 hover:text-ink hover:bg-card-3/60",
                    )}
                  >
                    <Mic size={18} />
                    <span>ضبط صدا</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAiSubMode("text");
                      setError(null);
                    }}
                    className={cx(
                      "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-semibold transition-all select-none",
                      aiSubMode === "text"
                        ? "border-ink bg-card-3 text-ink shadow-sm"
                        : "border-line bg-card-2 text-ink-3 hover:text-ink hover:bg-card-3/60",
                    )}
                  >
                    <BookOpen size={18} />
                    <span>توضیح متنی</span>
                  </button>
                </div>

                {/* 1. PHOTO SUB-MODE */}
                {aiSubMode === "photo" ? (
                  <div className="flex flex-col gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                    />
                    {image ? (
                      <div className="relative overflow-hidden rounded-2xl border border-divider">
                        <img
                          src={image}
                          alt="پیش‌نمایش تصویر غذا"
                          className="aspect-4/3 w-full object-cover"
                          style={{ direction: "ltr" }}
                        />
                        <div className="absolute end-2 top-2">
                          <IconButton label="حذف تصویر" size="sm" onClick={() => setImage(null)}>
                            <Trash2 size={14} aria-hidden />
                          </IconButton>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-card-2 px-4 py-8 text-sm text-ink-2 hover:border-ink hover:bg-card-3/50 transition-colors"
                        disabled={analyzing}
                      >
                        <Camera size={26} strokeWidth={1.5} className="text-ink" />
                        <span className="font-semibold text-ink">انتخاب یا گرفتن عکس از سفره / بشقاب</span>
                        <span className="text-2xs text-ink-3">حداکثر ۳ مگابایت · فرمت‌های png، jpeg یا webp</span>
                      </button>
                    )}

                    <Field label="توضیح تکمیلی اختیاری" hint="اگر محتویات خاصی در تصویر پنهان است بنویسید (مثلاً: ۲ قاشق روغن زیتون)">
                      <TextInput
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="نکات اختیاری..."
                        disabled={analyzing}
                      />
                    </Field>

                    <Button
                      variant="primary"
                      block
                      leading={<Sparkles size={15} />}
                      loading={analyzing}
                      disabled={!aiReady || !image}
                      onClick={() => void runAnalysis()}
                    >
                      تحلیل هوشمند تصویر غذا
                    </Button>
                  </div>
                ) : null}

                {/* 2. VOICE SUB-MODE (Converts voice to Persian text first, presents for review, then analyzes) */}
                {aiSubMode === "voice" ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-card-2 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            "flex size-9 items-center justify-center rounded-full border",
                            listening ? "border-red-500 bg-red-500/20 text-red-400 animate-pulse" : "border-line bg-card text-ink",
                          )}
                        >
                          <Mic size={18} />
                        </span>
                        <div>
                          <span className="text-xs font-bold text-ink">
                            {listening ? "در حال گوش دادن به صحبت شما..." : "ضبط و تبدیل صدا به متن"}
                          </span>
                          <p className="text-2xs text-ink-3">صدایتان به متن تبدیل می‌شود و قبل از تحلیل می‌توانید آن را ویرایش کنید.</p>
                        </div>
                      </div>

                      {voiceSupported ? (
                        <Button
                          variant={listening ? "secondary" : "primary"}
                          size="sm"
                          leading={listening ? <MicOff size={14} /> : <Mic size={14} />}
                          onClick={listening ? stopVoice : startVoice}
                        >
                          {listening ? "توقف ضبط" : "شروع صحبت"}
                        </Button>
                      ) : null}
                    </div>

                    {voiceError ? (
                      <p role="alert" className="text-2xs text-red-400">
                        {voiceError}
                      </p>
                    ) : null}

                    {/* Editable transcribed text area */}
                    <Field label="متن تبدیل‌شده از صدا (قابل ویرایش)" hint="می‌توانید کلمات را قبل از ارسال تصحیح یا تکمیل کنید:">
                      <Textarea
                        value={voiceText}
                        onChange={(e) => setVoiceText(e.target.value)}
                        placeholder="صدای شما اینجا تایپ می‌شود..."
                        className="min-h-20 text-xs"
                      />
                    </Field>

                    <Button
                      variant="primary"
                      block
                      leading={<Sparkles size={15} />}
                      loading={analyzing}
                      disabled={!aiReady || voiceText.trim().length < 3}
                      onClick={() => void runAnalysis()}
                    >
                      تحلیل هوشمند متن حاصل از گفتار
                    </Button>
                  </div>
                ) : null}

                {/* 3. TEXT SUB-MODE */}
                {aiSubMode === "text" ? (
                  <div className="flex flex-col gap-3">
                    <Field
                      label="توضیح وعده غذایی"
                      hint="غذا و مقدار تقریبی را بنویسید (مثلاً: یک بشقاب چلو کباب کوبیده با سالاد شیرازی و یک لیوان دوغ)"
                    >
                      <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="چه غذایی و چه مقدار میل کردید؟"
                        className="min-h-24 text-xs"
                        disabled={analyzing}
                      />
                    </Field>

                    <Button
                      variant="primary"
                      block
                      leading={<Sparkles size={15} />}
                      loading={analyzing}
                      disabled={!aiReady || text.trim().length < 3}
                      onClick={() => void runAnalysis()}
                    >
                      تحلیل هوشمند متن غذا
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* AI Analysis Result & Review Surface */}
            {analysis ? (
              <div className="flex flex-col gap-4 animate-rise">
                <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  <span>✓ تحلیل توسط {analysis.providerLabel} با موفقیت انجام شد ({faNum(Math.round(analysis.confidence * 100))}٪ اطمینان)</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAnalysis(null);
                      setEditingAi(false);
                    }}
                  >
                    تحلیل مجدد
                  </Button>
                </div>

                {/* Breakdown Card */}
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-ink">{aiDraft.name}</h4>
                      {analysis.portionNotes ? (
                        <p className="text-2xs text-ink-3">برآورد حجم: {analysis.portionNotes}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      leading={<Pencil size={12} />}
                      onClick={() => setEditingAi((v) => !v)}
                    >
                      {editingAi ? "تأیید ویرایش" : "ویرایش مقادیر"}
                    </Button>
                  </div>

                  {editingAi ? (
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Field label="نام وعده">
                        <TextInput
                          value={aiDraft.name}
                          onChange={(e) => setAiDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                      </Field>
                      <Field label="کالری (ک‌کال)">
                        <TextInput
                          inputMode="numeric"
                          value={String(aiDraft.kcal)}
                          onChange={(e) => setAiDraft((d) => ({ ...d, kcal: Number(e.target.value) || 0 }))}
                        />
                      </Field>
                      <Field label="پروتئین (گرم)">
                        <TextInput
                          inputMode="decimal"
                          value={String(aiDraft.protein)}
                          onChange={(e) => setAiDraft((d) => ({ ...d, protein: Number(e.target.value) || 0 }))}
                        />
                      </Field>
                      <Field label="کربوهیدرات (گرم)">
                        <TextInput
                          inputMode="decimal"
                          value={String(aiDraft.carbs)}
                          onChange={(e) => setAiDraft((d) => ({ ...d, carbs: Number(e.target.value) || 0 }))}
                        />
                      </Field>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 rounded-2xl border border-line bg-card-2 p-3 text-center">
                      <div>
                        <span className="block text-2xs text-ink-3">کالری</span>
                        <span className="num block text-sm font-bold text-ink">{faNum(aiDraft.kcal)}</span>
                      </div>
                      <div>
                        <span className="block text-2xs text-ink-3">پروتئین</span>
                        <span className="num block text-sm font-bold text-emerald-400">{faNum(aiDraft.protein)}g</span>
                      </div>
                      <div>
                        <span className="block text-2xs text-ink-3">کربوهیدرات</span>
                        <span className="num block text-sm font-bold text-amber-400">{faNum(aiDraft.carbs)}g</span>
                      </div>
                      <div>
                        <span className="block text-2xs text-ink-3">چربی</span>
                        <span className="num block text-sm font-bold text-rose-400">{faNum(aiDraft.fat)}g</span>
                      </div>
                    </div>
                  )}

                  {/* AI Dietary Tip */}
                  {analysis.explanation ? (
                    <div className="rounded-xl border border-divider/60 bg-card-2/60 p-3 text-2xs leading-relaxed text-ink-2">
                      <span className="font-bold text-ink">💡 توصیه متخصص تغذیه: </span>
                      {analysis.explanation}
                    </div>
                  ) : null}

                  {/* Detected items pills */}
                  {analysis.items.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {analysis.items.map((it) => (
                        <span
                          key={it.name}
                          className="rounded-full border border-line bg-card-2 px-2.5 py-1 text-2xs text-ink-2"
                        >
                          {it.name} ({faNum(it.amount)} {it.unit}): {faNum(it.kcal)} ک‌کال
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <Button
                    variant="primary"
                    block
                    loading={saving}
                    onClick={() => void handleSaveAiAnalysis()}
                  >
                    تأیید و افزودن به وعده
                  </Button>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
