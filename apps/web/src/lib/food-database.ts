/**
 * Comprehensive Food Database for Iranian and international meals,
 * raw ingredients, cooked dishes, and everyday nutrition.
 */

export type FoodPortionUnit =
  | "g" // گرم
  | "piece" // عدد
  | "cup" // لیوان
  | "tbsp" // قاشق غذاخوری
  | "tsp" // قاشق چای‌خوری
  | "serving" // پرس / بشقاب
  | "ladle" // کفگیر
  | "slice" // برش / کف دست
  | "ml"; // میلی‌لیتر

export const FOOD_UNIT_LABELS: Record<FoodPortionUnit, string> = {
  g: "گرم",
  piece: "عدد",
  cup: "لیوان",
  tbsp: "قاشق غذاخوری",
  tsp: "قاشق چای‌خوری",
  serving: "پرس / بشقاب",
  ladle: "کفگیر",
  slice: "برش / کف دست",
  ml: "میلی‌لیتر",
};

export type UnitOption = {
  unit: FoodPortionUnit;
  label: string;
  gramsFactor: number; // Equivalent weight in grams (or ml) for 1 of this unit
};

export type FoodCategory =
  | "خورشت و پلو"
  | "کباب و پروتئین"
  | "نان و غلات"
  | "لبنیات و تخم‌مرغ"
  | "میوه و سبزیجات"
  | "حبوبات و خوراک"
  | "فست‌فود و ساندویچ"
  | "مغزها و تنقلات";

export type FoodItemRecord = {
  id: string;
  name: string;
  category: FoodCategory;
  defaultUnit: FoodPortionUnit;
  defaultAmount: number;
  availableUnits: UnitOption[];
  // Nutritional values per 100 grams
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

export const FOOD_DATABASE: FoodItemRecord[] = [
  /* ------------------- خورشت و پلو ------------------- */
  {
    id: "chelo_ghormeh_sabzi",
    name: "چلو خورشت قورمه‌سبزی با گوشت",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس / بشقاب استاندارد (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "ladle", label: "۱ کفگیر پلو و خورشت (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۲۵ گرم)", gramsFactor: 25 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 175,
    proteinPer100g: 7.2,
    carbsPer100g: 19.5,
    fatPer100g: 7.8,
  },
  {
    id: "chelo_gheimeh",
    name: "چلو خورشت قیمه سیب‌زمینی",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس / بشقاب کامل (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "ladle", label: "۱ کفگیر (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۲۵ گرم)", gramsFactor: 25 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 185,
    proteinPer100g: 6.8,
    carbsPer100g: 22.0,
    fatPer100g: 8.0,
  },
  {
    id: "zereshk_polo_morgh",
    name: "زرشک‌پلو با مرغ (برنج زعفرانی و سینه مرغ)",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس کامل با مرغ (۳۸۰ گرم)", gramsFactor: 380 },
      { unit: "ladle", label: "۱ کفگیر پلو مرغ (۱۴۰ گرم)", gramsFactor: 140 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 165,
    proteinPer100g: 11.5,
    carbsPer100g: 21.0,
    fatPer100g: 4.2,
  },
  {
    id: "baghali_polo_gosht",
    name: "باقالی‌پلو با گوشت بره",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس مجلسی (۴۰۰ گرم)", gramsFactor: 400 },
      { unit: "ladle", label: "۱ کفگیر (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 210,
    proteinPer100g: 10.8,
    carbsPer100g: 23.5,
    fatPer100g: 8.6,
  },
  {
    id: "fesenjan_morgh",
    name: "خورشت فسنجان ملس با مرغ",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ کاسه خورشت (۲۰۰ گرم)", gramsFactor: 200 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۳۰ گرم)", gramsFactor: 30 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 280,
    proteinPer100g: 9.5,
    carbsPer100g: 16.0,
    fatPer100g: 20.5,
  },
  {
    id: "loobia_polo",
    name: "لوبیاپلو با گوشت تکه‌ای",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ دیس متوسط (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "ladle", label: "۱ کفگیر (۱۲۰ گرم)", gramsFactor: 120 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 178,
    proteinPer100g: 7.5,
    carbsPer100g: 24.0,
    fatPer100g: 5.8,
  },
  {
    id: "adas_polo",
    name: "عدس‌پلو با گوشت چرخ‌کرده و کشمش",
    category: "خورشت و پلو",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "ladle", label: "۱ کفگیر (۱۲۰ گرم)", gramsFactor: 120 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 195,
    proteinPer100g: 8.5,
    carbsPer100g: 28.0,
    fatPer100g: 5.5,
  },
  {
    id: "tahchin_morgh",
    name: "ته‌چین مرغ زعفرانی قالبی",
    category: "خورشت و پلو",
    defaultUnit: "slice",
    defaultAmount: 1,
    availableUnits: [
      { unit: "slice", label: "۱ برش مثلثی ته‌چین (۲۰۰ گرم)", gramsFactor: 200 },
      { unit: "serving", label: "۱ پرس کامل (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 225,
    proteinPer100g: 11.0,
    carbsPer100g: 26.0,
    fatPer100g: 8.8,
  },

  /* ------------------- کباب و پروتئین ------------------- */
  {
    id: "chelo_kebab_koobideh",
    name: "چلو کباب کوبیده زعفرانی (۲ سیخ با برنج)",
    category: "کباب و پروتئین",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس کامل (۲ سیخ با چلو)", gramsFactor: 420 },
      { unit: "piece", label: "۱ سیخ کباب کوبیده تکی (۱۱۰ گرم)", gramsFactor: 110 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 230,
    proteinPer100g: 12.0,
    carbsPer100g: 18.0,
    fatPer100g: 12.5,
  },
  {
    id: "joojeh_kebab",
    name: "جوجه‌کباب زعفرانی بدون استخوان",
    category: "کباب و پروتئین",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ سیخ کامل (۲۰۰ گرم)", gramsFactor: 200 },
      { unit: "serving", label: "۱ پرس با چلو زعفرانی (۴۰۰ گرم)", gramsFactor: 400 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 170,
    proteinPer100g: 22.5,
    carbsPer100g: 1.5,
    fatPer100g: 8.2,
  },
  {
    id: "chicken_breast_boiled",
    name: "سینه مرغ پخته / گریل (رژیمی)",
    category: "کباب و پروتئین",
    defaultUnit: "g",
    defaultAmount: 150,
    availableUnits: [
      { unit: "g", label: "گرم", gramsFactor: 1 },
      { unit: "piece", label: "۱ عدد فیله سینه کامل (۱۸۰ گرم)", gramsFactor: 180 },
      { unit: "slice", label: "۱ کف دست سینه مرغ (۸۵ گرم)", gramsFactor: 85 },
    ],
    kcalPer100g: 165,
    proteinPer100g: 31.0,
    carbsPer100g: 0.0,
    fatPer100g: 3.6,
  },
  {
    id: "kebab_barg",
    name: "کباب برگ راسته گوسفندی",
    category: "کباب و پروتئین",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ سیخ کباب برگ (۱۸۰ گرم)", gramsFactor: 180 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 195,
    proteinPer100g: 26.0,
    carbsPer100g: 0.5,
    fatPer100g: 9.8,
  },
  {
    id: "tuna_fish_water",
    name: "تن ماهی رژیمی در آب‌نمک",
    category: "کباب و پروتئین",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ قوطی تن ماهی (۱۸۰ گرم)", gramsFactor: 180 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری پر (۳۰ گرم)", gramsFactor: 30 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 116,
    proteinPer100g: 26.0,
    carbsPer100g: 0.0,
    fatPer100g: 1.0,
  },
  {
    id: "salmon_grilled",
    name: "فیله ماهی سالمون گریل",
    category: "کباب و پروتئین",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ فیله متوسط (۱۶۰ گرم)", gramsFactor: 160 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 206,
    proteinPer100g: 22.0,
    carbsPer100g: 0.0,
    fatPer100g: 12.5,
  },
  {
    id: "beef_minced_lean",
    name: "گوشت چرخ‌کرده کم‌چرب گوساله (پخته)",
    category: "کباب و پروتئین",
    defaultUnit: "tbsp",
    defaultAmount: 4,
    availableUnits: [
      { unit: "tbsp", label: "۱ قاشق غذاخوری پر (۲۵ گرم)", gramsFactor: 25 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 215,
    proteinPer100g: 26.0,
    carbsPer100g: 0.0,
    fatPer100g: 11.5,
  },

  /* ------------------- نان و غلات ------------------- */
  {
    id: "rice_kateh",
    name: "برنج کته خانگی کم‌روغن",
    category: "نان و غلات",
    defaultUnit: "ladle",
    defaultAmount: 2,
    availableUnits: [
      { unit: "ladle", label: "۱ کفگیر پلو (۸۰ گرم)", gramsFactor: 80 },
      { unit: "cup", label: "۱ لیوان پلو پخته (۱۶۰ گرم)", gramsFactor: 160 },
      { unit: "serving", label: "۱ بشقاب پلو متوسط (۲۵۰ گرم)", gramsFactor: 250 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۲۰ گرم)", gramsFactor: 20 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 135,
    proteinPer100g: 2.7,
    carbsPer100g: 28.5,
    fatPer100g: 1.2,
  },
  {
    id: "bread_sangak",
    name: "نان سنگک سنتی",
    category: "نان و غلات",
    defaultUnit: "slice",
    defaultAmount: 2,
    availableUnits: [
      { unit: "slice", label: "۱ کف دست نان (۳۵ گرم)", gramsFactor: 35 },
      { unit: "piece", label: "۱ عدد نان کامل سنگک (۳۵۰ گرم)", gramsFactor: 350 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 255,
    proteinPer100g: 9.0,
    carbsPer100g: 50.0,
    fatPer100g: 1.8,
  },
  {
    id: "bread_barbari",
    name: "نان بربری کنجدی",
    category: "نان و غلات",
    defaultUnit: "slice",
    defaultAmount: 2,
    availableUnits: [
      { unit: "slice", label: "۱ کف دست (۳۵ گرم)", gramsFactor: 35 },
      { unit: "piece", label: "۱ نان بربری کامل (۳۸۰ گرم)", gramsFactor: 380 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 265,
    proteinPer100g: 8.5,
    carbsPer100g: 52.0,
    fatPer100g: 2.2,
  },
  {
    id: "bread_lavash",
    name: "نان لواش سنتی",
    category: "نان و غلات",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ عدد نان لواش کامل (۶۰ گرم)", gramsFactor: 60 },
      { unit: "slice", label: "۱ کف دست نان (۲۰ گرم)", gramsFactor: 20 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 280,
    proteinPer100g: 7.5,
    carbsPer100g: 57.0,
    fatPer100g: 1.5,
  },
  {
    id: "bread_toast_wholewheat",
    name: "نان تست جو / سبوس‌دار",
    category: "نان و غلات",
    defaultUnit: "slice",
    defaultAmount: 2,
    availableUnits: [
      { unit: "slice", label: "۱ برش تست (۳۰ گرم)", gramsFactor: 30 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 245,
    proteinPer100g: 11.0,
    carbsPer100g: 44.0,
    fatPer100g: 2.8,
  },
  {
    id: "oatmeal_raw",
    name: "جو دوسر پرک (خام)",
    category: "نان و غلات",
    defaultUnit: "tbsp",
    defaultAmount: 4,
    availableUnits: [
      { unit: "tbsp", label: "۱ قاشق غذاخوری پر (۱۰ گرم)", gramsFactor: 10 },
      { unit: "cup", label: "۱ لیوان جو دوسر (۸۰ گرم)", gramsFactor: 80 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 389,
    proteinPer100g: 16.9,
    carbsPer100g: 66.3,
    fatPer100g: 6.9,
  },
  {
    id: "potato_boiled",
    name: "سیب‌زمینی آب‌پز یا تنوری",
    category: "نان و غلات",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ عدد سیب‌زمینی متوسط (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 87,
    proteinPer100g: 1.9,
    carbsPer100g: 20.1,
    fatPer100g: 0.1,
  },
  {
    id: "pasta_cooked",
    name: "ماکارونی و پاستا پخته ساده",
    category: "نان و غلات",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ لیوان ماکارونی پخته (۱۴۰ گرم)", gramsFactor: 140 },
      { unit: "serving", label: "۱ بشقاب ماکارونی با گوشت (۳۰۰ گرم)", gramsFactor: 300 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 158,
    proteinPer100g: 5.8,
    carbsPer100g: 31.0,
    fatPer100g: 0.9,
  },

  /* ------------------- لبنیات و تخم‌مرغ ------------------- */
  {
    id: "egg_boiled",
    name: "تخم‌مرغ آب‌پز کامل",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "piece",
    defaultAmount: 2,
    availableUnits: [
      { unit: "piece", label: "۱ عدد تخم‌مرغ متوسط (۵۵ گرم)", gramsFactor: 55 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 155,
    proteinPer100g: 13.0,
    carbsPer100g: 1.1,
    fatPer100g: 11.0,
  },
  {
    id: "egg_white",
    name: "سفیده تخم‌مرغ آب‌پز (خالص)",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "piece",
    defaultAmount: 3,
    availableUnits: [
      { unit: "piece", label: "۱ عدد سفیده (۳۵ گرم)", gramsFactor: 35 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 52,
    proteinPer100g: 11.0,
    carbsPer100g: 0.7,
    fatPer100g: 0.2,
  },
  {
    id: "egg_omelet",
    name: "املت گوجه‌فرنگی سنتی",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس املت ۲ تخم‌مرغه (۲۰۰ گرم)", gramsFactor: 200 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 135,
    proteinPer100g: 8.0,
    carbsPer100g: 4.5,
    fatPer100g: 9.5,
  },
  {
    id: "milk_lowfat",
    name: "شیر کم‌چرب ۱.۵٪",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ لیوان (۲۴۰ میلی‌لیتر)", gramsFactor: 240 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۱۵ میلی‌لیتر)", gramsFactor: 15 },
      { unit: "ml", label: "میلی‌لیتر", gramsFactor: 1 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 47,
    proteinPer100g: 3.3,
    carbsPer100g: 4.8,
    fatPer100g: 1.5,
  },
  {
    id: "yogurt_greek",
    name: "ماست یونانی پرپروتئین کم‌چرب",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "tbsp",
    defaultAmount: 4,
    availableUnits: [
      { unit: "tbsp", label: "۱ قاشق غذاخوری پر (۳۰ گرم)", gramsFactor: 30 },
      { unit: "cup", label: "۱ لیوان / کاسه کوچک (۲۰۰ گرم)", gramsFactor: 200 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 72,
    proteinPer100g: 10.0,
    carbsPer100g: 4.0,
    fatPer100g: 1.8,
  },
  {
    id: "cheese_feta_white",
    name: "پنیر صبحانه سفید (ایرانی / فتا)",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "slice",
    defaultAmount: 1,
    availableUnits: [
      { unit: "slice", label: "۱ قوطی کبریت (۳۰ گرم)", gramsFactor: 30 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۲۰ گرم)", gramsFactor: 20 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 260,
    proteinPer100g: 14.2,
    carbsPer100g: 3.5,
    fatPer100g: 21.0,
  },
  {
    id: "dough_persian",
    name: "دوغ نعنایی کم‌نمک",
    category: "لبنیات و تخم‌مرغ",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ لیوان (۲۴۰ میلی‌لیتر)", gramsFactor: 240 },
      { unit: "ml", label: "میلی‌لیتر", gramsFactor: 1 },
    ],
    kcalPer100g: 32,
    proteinPer100g: 1.6,
    carbsPer100g: 2.8,
    fatPer100g: 1.4,
  },

  /* ------------------- حبوبات و خوراک ------------------- */
  {
    id: "adasi",
    name: "خوراک عدسی خانگی با روغن زیتون",
    category: "حبوبات و خوراک",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ کاسه متوسط (۲۵۰ گرم)", gramsFactor: 250 },
      { unit: "ladle", label: "۱ کفگیر (۱۲۰ گرم)", gramsFactor: 120 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 110,
    proteinPer100g: 7.0,
    carbsPer100g: 17.5,
    fatPer100g: 1.5,
  },
  {
    id: "loobia_chiti_stew",
    name: "خوراک لوبیا چیتی با قارچ",
    category: "حبوبات و خوراک",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ کاسه لوبیا چیتی (۲۵۰ گرم)", gramsFactor: 250 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 125,
    proteinPer100g: 7.5,
    carbsPer100g: 20.0,
    fatPer100g: 1.8,
  },
  {
    id: "ash_reshteh",
    name: "آش رشته با کشک و پیازداغ",
    category: "حبوبات و خوراک",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ کاسه بزرگ آش (۳۰۰ گرم)", gramsFactor: 300 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 145,
    proteinPer100g: 5.2,
    carbsPer100g: 21.0,
    fatPer100g: 4.8,
  },
  {
    id: "dizi_abgoosht",
    name: "دیزی / آبگوشت سنتی با گوشت و نخود",
    category: "حبوبات و خوراک",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ پرس کامل با گوشت‌کوبیده (۴۰۰ گرم)", gramsFactor: 400 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 180,
    proteinPer100g: 9.8,
    carbsPer100g: 14.5,
    fatPer100g: 9.5,
  },
  {
    id: "kuku_sabzi",
    name: "کوکو سبزی خانگی با گردو و زرشک",
    category: "حبوبات و خوراک",
    defaultUnit: "slice",
    defaultAmount: 1,
    availableUnits: [
      { unit: "slice", label: "۱ برش کوکو سبزی (۱۰۰ گرم)", gramsFactor: 100 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 190,
    proteinPer100g: 8.5,
    carbsPer100g: 6.0,
    fatPer100g: 15.0,
  },
  {
    id: "kotlet",
    name: "کتلت گوشت خانگی",
    category: "حبوبات و خوراک",
    defaultUnit: "piece",
    defaultAmount: 2,
    availableUnits: [
      { unit: "piece", label: "۱ عدد کتلت متوسط (۷۰ گرم)", gramsFactor: 70 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 215,
    proteinPer100g: 12.0,
    carbsPer100g: 14.0,
    fatPer100g: 12.0,
  },

  /* ------------------- میوه و سبزیجات ------------------- */
  {
    id: "banana",
    name: "موز تازه",
    category: "میوه و سبزیجات",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ عدد متوسط (۱۲۰ گرم)", gramsFactor: 120 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 89,
    proteinPer100g: 1.1,
    carbsPer100g: 22.8,
    fatPer100g: 0.3,
  },
  {
    id: "apple",
    name: "سیب درختی",
    category: "میوه و سبزیجات",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ عدد متوسط (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 52,
    proteinPer100g: 0.3,
    carbsPer100g: 13.8,
    fatPer100g: 0.2,
  },
  {
    id: "date_fruit",
    name: "خرما مضافتی بم",
    category: "میوه و سبزیجات",
    defaultUnit: "piece",
    defaultAmount: 3,
    availableUnits: [
      { unit: "piece", label: "۱ عدد خرما (۱۰ گرم)", gramsFactor: 10 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 282,
    proteinPer100g: 2.5,
    carbsPer100g: 75.0,
    fatPer100g: 0.4,
  },
  {
    id: "salad_shirazi",
    name: "سالاد شیرازی با آبغوره (بدون روغن)",
    category: "میوه و سبزیجات",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ کاسه سالاد (۱۵۰ گرم)", gramsFactor: 150 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 25,
    proteinPer100g: 1.0,
    carbsPer100g: 5.5,
    fatPer100g: 0.2,
  },
  {
    id: "broccoli_steamed",
    name: "بروکلی بخارپز",
    category: "میوه و سبزیجات",
    defaultUnit: "cup",
    defaultAmount: 1,
    availableUnits: [
      { unit: "cup", label: "۱ لیوان بروکلی (۹۰ گرم)", gramsFactor: 90 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 35,
    proteinPer100g: 2.4,
    carbsPer100g: 7.2,
    fatPer100g: 0.4,
  },

  /* ------------------- مغزها و تنقلات ------------------- */
  {
    id: "walnut",
    name: "گردو ایرانی خام",
    category: "مغزها و تنقلات",
    defaultUnit: "piece",
    defaultAmount: 4,
    availableUnits: [
      { unit: "piece", label: "۱ عدد نصفه مغز گردو (۵ گرم)", gramsFactor: 5 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری خردشده (۱۵ گرم)", gramsFactor: 15 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 654,
    proteinPer100g: 15.2,
    carbsPer100g: 13.7,
    fatPer100g: 65.2,
  },
  {
    id: "almond_raw",
    name: "بادام درختی خام",
    category: "مغزها و تنقلات",
    defaultUnit: "piece",
    defaultAmount: 10,
    availableUnits: [
      { unit: "piece", label: "۱ عدد بادام (۱.۲ گرم)", gramsFactor: 1.2 },
      { unit: "tbsp", label: "۱ قاشق غذاخوری پر (۱۵ گرم)", gramsFactor: 15 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 579,
    proteinPer100g: 21.2,
    carbsPer100g: 21.6,
    fatPer100g: 49.9,
  },
  {
    id: "peanut_butter",
    name: "کره بادام‌زمینی خالص (بدون شکر)",
    category: "مغزها و تنقلات",
    defaultUnit: "tbsp",
    defaultAmount: 1,
    availableUnits: [
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۱۶ گرم)", gramsFactor: 16 },
      { unit: "tsp", label: "۱ قاشق چای‌خوری (۵ گرم)", gramsFactor: 5 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 588,
    proteinPer100g: 25.1,
    carbsPer100g: 20.0,
    fatPer100g: 50.4,
  },
  {
    id: "olive_oil",
    name: "روغن زیتون فرابکر",
    category: "مغزها و تنقلات",
    defaultUnit: "tbsp",
    defaultAmount: 1,
    availableUnits: [
      { unit: "tbsp", label: "۱ قاشق غذاخوری (۱۴ گرم)", gramsFactor: 14 },
      { unit: "tsp", label: "۱ قاشق چای‌خوری (۵ گرم)", gramsFactor: 5 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 884,
    proteinPer100g: 0.0,
    carbsPer100g: 0.0,
    fatPer100g: 100.0,
  },

  /* ------------------- فست‌فود و ساندویچ ------------------- */
  {
    id: "pizza_mixed",
    name: "پیتزا مخلوط / پپرونی",
    category: "فست‌فود و ساندویچ",
    defaultUnit: "slice",
    defaultAmount: 2,
    availableUnits: [
      { unit: "slice", label: "۱ اسلایس پیتزا (۱۰۰ گرم)", gramsFactor: 100 },
      { unit: "serving", label: "۱ پیتزا انفرادی کامل (۳۰۰ گرم)", gramsFactor: 300 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 265,
    proteinPer100g: 11.5,
    carbsPer100g: 28.0,
    fatPer100g: 12.0,
  },
  {
    id: "burger_beef",
    name: "همبرگر گوشت کلاسیک با نان گرد",
    category: "فست‌فود و ساندویچ",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ ساندویچ کامل (۲۲۰ گرم)", gramsFactor: 220 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 250,
    proteinPer100g: 13.5,
    carbsPer100g: 22.0,
    fatPer100g: 12.5,
  },
  {
    id: "sandwich_chicken_fillet",
    name: "ساندویچ فیله مرغ گریل با نان باگت",
    category: "فست‌فود و ساندویچ",
    defaultUnit: "piece",
    defaultAmount: 1,
    availableUnits: [
      { unit: "piece", label: "۱ ساندویچ کامل (۲۵۰ گرم)", gramsFactor: 250 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 195,
    proteinPer100g: 16.0,
    carbsPer100g: 23.0,
    fatPer100g: 4.5,
  },
  {
    id: "caesar_salad_chicken",
    name: "سالاد سزار با فیله مرغ گریل",
    category: "فست‌فود و ساندویچ",
    defaultUnit: "serving",
    defaultAmount: 1,
    availableUnits: [
      { unit: "serving", label: "۱ بشقاب سالاد سزار (۳۰۰ گرم)", gramsFactor: 300 },
      { unit: "g", label: "گرم", gramsFactor: 1 },
    ],
    kcalPer100g: 140,
    proteinPer100g: 11.0,
    carbsPer100g: 6.5,
    fatPer100g: 8.0,
  },
];

/* ------------------- Search & Calculation Helpers ------------------- */

function normalizePersianText(str: string): string {
  return str
    .toLowerCase()
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width spaces
    .trim();
}

/**
 * Searches food items by query and optional category filter.
 */
export function searchFoodDatabase(query: string, category?: FoodCategory | "all"): FoodItemRecord[] {
  const normalizedQuery = normalizePersianText(query);

  return FOOD_DATABASE.filter((item) => {
    if (category && category !== "all" && item.category !== category) {
      return false;
    }
    if (!normalizedQuery) return true;

    const normalizedName = normalizePersianText(item.name);
    return normalizedName.includes(normalizedQuery);
  });
}

/**
 * Calculates accurate nutritional macros for a specific food item given an amount and portion unit.
 */
export function calculateFoodNutrition(
  item: FoodItemRecord,
  amount: number,
  unit: FoodPortionUnit,
): { grams: number; kcal: number; proteinG: number; carbsG: number; fatG: number } {
  const unitConfig = item.availableUnits.find((u) => u.unit === unit) ?? item.availableUnits[0];
  const gramsFactor = unitConfig ? unitConfig.gramsFactor : 1;
  const safeAmount = Math.max(0, amount);
  const totalGrams = safeAmount * gramsFactor;

  const ratio = totalGrams / 100;
  return {
    grams: Math.round(totalGrams),
    kcal: Math.round(ratio * item.kcalPer100g),
    proteinG: Math.round(ratio * item.proteinPer100g * 10) / 10,
    carbsG: Math.round(ratio * item.carbsPer100g * 10) / 10,
    fatG: Math.round(ratio * item.fatPer100g * 10) / 10,
  };
}
