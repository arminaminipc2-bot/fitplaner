/**
 * Structured presets for equipment, nutrition, limitations, injuries and medical conditions.
 * Replaces open text inputs with standardized, ergonomic options while allowing
 * custom text via the "سایر" (Other) option.
 */

export type PresetItem = {
  id: string;
  label: string;
  category?: string;
};

/* ------------------------------------------------------------- 1. تجهیزات (Equipment) -- */

export const EQUIPMENT_PRESETS: PresetItem[] = [
  { id: "full_gym", label: "باشگاه کامل و مجهز" },
  { id: "dumbbells", label: "دمبل (با وزنه‌های متنوع)" },
  { id: "barbell", label: "هالتر و صفحه‌وزنه آزاد" },
  { id: "cables", label: "دستگاه کابل و سیم‌کش" },
  { id: "bodyweight", label: "بدون تجهیزات (فقط وزن بدن / کلیستنیکس)" },
  { id: "resistance_bands", label: "کش‌های مقاومتی و پاورباند" },
  { id: "pullup_bar", label: "میله بارفیکس" },
  { id: "bench", label: "نیمکت شیب‌دار قابل تنظیم" },
  { id: "kettlebell", label: "کتل‌بل" },
  { id: "cardio_machines", label: "تردمیل، دوچرخه ثابت یا الپتیکال" },
  { id: "mat_props", label: "مت ورزشی و فوم‌رولر" },
  { id: "home_multigym", label: "دستگاه بدنسازی چندکاره خانگی" },
];

/* ------------------------------------------------ 2. تغذیه، رژیم‌ها و حساسیت‌ها (Diets & Allergies) -- */

export const DIET_PRESETS: PresetItem[] = [
  // رژیم‌های تغذیه‌ای
  { id: "balanced", label: "رژیم معمولی و همه‌چیزخوار", category: "رژیم غذایی" },
  { id: "vegetarian", label: "گیاه‌خواری (Vegetarian)", category: "رژیم غذایی" },
  { id: "vegan", label: "وگان / کاملاً گیاهی (Vegan)", category: "رژیم غذایی" },
  { id: "low_carb", label: "کم‌کربوهیدرات (Low-Carb)", category: "رژیم غذایی" },
  { id: "keto", label: "کتوژنیک (Keto)", category: "رژیم غذایی" },
  { id: "high_protein", label: "پرپروتئین (High Protein)", category: "رژیم غذایی" },
  { id: "fasting", label: "روزه‌داری متناوب / فستینگ", category: "رژیم غذایی" },
  { id: "diabetic", label: "رژیم دیابتی / کنترل قند", category: "رژیم غذایی" },

  // حساسیت‌ها و عدم تحمل غذایی
  { id: "gluten_free", label: "بدون گلوتن / سلیاک", category: "حساسیت و آلرژی" },
  { id: "lactose_free", label: "عدم تحمل لاکتوز / بدون لبنیات", category: "حساسیت و آلرژی" },
  { id: "nut_allergy", label: "حساسیت به بادام‌زمینی و مغزها", category: "حساسیت و آلرژی" },
  { id: "egg_allergy", label: "حساسیت به تخم‌مرغ", category: "حساسیت و آلرژی" },
  { id: "seafood_allergy", label: "حساسیت به غذاهای دریایی و میگو", category: "حساسیت و آلرژی" },
  { id: "soy_allergy", label: "حساسیت به سویا", category: "حساسیت و آلرژی" },
];

/* ------------------------------------------------------------- 3. محدودیت‌ها (Limitations) -- */

export const LIMITATION_PRESETS: PresetItem[] = [
  { id: "time_short", label: "محدودیت زمانی (کمتر از ۴۵ دقیقه در روز)" },
  { id: "home_only", label: "نبود دسترسی به باشگاه (تمرین فقط در منزل)" },
  { id: "quiet_workout", label: "تمرین بی‌صدا و بدون پرش (مناسب آپارتمان)" },
  { id: "few_days", label: "محدودیت روزها (فقط ۲ الی ۳ روز در هفته)" },
  { id: "no_heavy_lifting", label: "ممنوعیت حمل وزنه‌های سنگین (دستور مربی/پزشک)" },
  { id: "cardio_limit", label: "محدودیت در هوازی پرشدت (HIIT)" },
  { id: "morning_only", label: "امکان تمرین فقط صبح زود" },
  { id: "night_only", label: "امکان تمرین فقط آخر شب" },
];

/* ------------------------------------------------------------- 4. آسیب‌ها (Injuries) -- */

export const INJURY_PRESETS: PresetItem[] = [
  { id: "lower_back", label: "دیسک کمر / کمردرد مزمن", category: "ستون فقرات" },
  { id: "neck", label: "گردن‌درد / دیسک گردن", category: "ستون فقرات" },
  { id: "posture", label: "قوز پشتی یا گودی کمر شدید (کیفوز/لوردوز)", category: "ستون فقرات" },
  { id: "knee", label: "زانودرد / آسیب مینیسک و رباط صلیبی (ACL)", category: "مفاصل پایین‌تنه" },
  { id: "ankle", label: "پیچ‌خوردگی یا ضعف مچ پا", category: "مفاصل پایین‌تنه" },
  { id: "hip", label: "درد یا گرفتگی مفصل لگن و ران", category: "مفاصل پایین‌تنه" },
  { id: "shoulder", label: "آسیب شانه / التهاب روتاتور کاف", category: "مفاصل بالاتنه" },
  { id: "wrist_elbow", label: "درد مچ دست یا آرنج (تنیس‌البو / کارپال)", category: "مفاصل بالاتنه" },
];

/* ------------------------------------------------------------- 5. بیماری‌ها (Medical Conditions) -- */

export const MEDICAL_PRESETS: PresetItem[] = [
  { id: "diabetes", label: "دیابت (نوع ۱ یا ۲)", category: "متابولیک و قلب" },
  { id: "hypertension", label: "فشار خون بالا", category: "متابولیک و قلب" },
  { id: "cardiovascular", label: "بیماری یا سابقه قلبی-عروقی", category: "متابولیک و قلب" },
  { id: "thyroid", label: "کم‌کاری یا پرکاری تیروئید", category: "متابولیک و غدد" },
  { id: "fatty_liver", label: "کبد چرب", category: "متابولیک و غدد" },
  { id: "asthma", label: "آسم یا تنگی نفس در فعالیت", category: "تنفسی و گوارش" },
  { id: "digestive", label: "مشکلات گوارشی مزمن / IBS", category: "تنفسی و گوارش" },
  { id: "pregnancy", label: "بارداری یا دوران پس از زایمان", category: "شرایط ویژه" },
  { id: "post_surgery", label: "دوران نقاهت پس از عمل جراحی", category: "شرایط ویژه" },
  { id: "osteoporosis", label: "پوکی استخوان یا کاهش تراکم استخوان", category: "شرایط ویژه" },
];

/* ------------------------------------------------------------- Serialization Helpers -- */

const OTHER_TAG_REGEX = /\[سایر:\s*([^\]]+)\]/i;

/**
 * Serializes an array of selected labels and optional custom otherText into a clean string.
 * Example: "دمبل (با وزنه‌های متنوع)، میله بارفیکس [سایر: کش پیلاتس ۵ متری]"
 */
export function serializeStructuredField(selectedLabels: string[], otherText?: string): string {
  const cleanSelected = selectedLabels.map((l) => l.trim()).filter(Boolean);
  const cleanOther = (otherText ?? "").trim();

  const parts: string[] = [];
  if (cleanSelected.length > 0) {
    parts.push(cleanSelected.join("، "));
  }
  if (cleanOther) {
    parts.push(`[سایر: ${cleanOther}]`);
  }

  return parts.join(" ");
}

/**
 * Parses a stored database string back into an array of matched preset labels and the custom "سایر" string.
 * Backward compatible: if the text was entered in old free-text versions, it parses it gracefully.
 */
export function parseStructuredField(
  raw: string | null | undefined,
  presets: PresetItem[],
): { selected: string[]; otherText: string } {
  if (!raw || !raw.trim()) {
    return { selected: [], otherText: "" };
  }

  let text = raw.trim();
  let otherText = "";

  // Check for the [سایر: ...] pattern
  const otherMatch = OTHER_TAG_REGEX.exec(text);
  if (otherMatch) {
    otherText = otherMatch[1]?.trim() ?? "";
    text = text.replace(otherMatch[0], "").trim();
  }

  const selected: string[] = [];

  // Match known presets
  for (const preset of presets) {
    if (text.includes(preset.label)) {
      selected.push(preset.label);
      // Remove the matched label to prevent duplicate matching
      text = text.replace(preset.label, "").trim();
    }
  }

  // Any leftover non-delimited text from legacy free-form input is added to otherText
  const leftover = text
    .split(/[،,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !selected.includes(s))
    .join("، ");

  if (leftover && !otherText) {
    otherText = leftover;
  } else if (leftover && otherText && !otherText.includes(leftover)) {
    otherText = `${leftover}، ${otherText}`;
  }

  return { selected, otherText };
}
