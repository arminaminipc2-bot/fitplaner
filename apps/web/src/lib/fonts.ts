/**
 * Typography is a user choice, so the families are fetched from a CDN on demand.
 * Vazirmatn stays self-hosted: it is both the default and the fallback, which
 * means a missing font file — or no internet — can never leave the app unreadable.
 */

export type FontCategory = "text" | "naskh" | "nastaliq" | "display";

export type FontOption = {
  id: string;
  /** Persian name shown in the picker. */
  label: string;
  /** The exact family name declared by the stylesheet. */
  family: string;
  /** null = already bundled, needs no network. */
  css: string | null;
  category: FontCategory;
  note: string;
};

const NPM = "https://cdn.jsdelivr.net/npm";

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: "vazirmatn",
    label: "وزیرمتن",
    family: "Vazirmatn",
    css: null,
    category: "text",
    note: "پیش‌فرض؛ در همین برنامه ذخیره شده و بدون اینترنت هم کار می‌کند.",
  },
  {
    id: "estedad",
    label: "استقامت",
    family: "Estedad Variable",
    css: `${NPM}/@fontsource-variable/estedad/index.css`,
    category: "text",
    note: "متن دقیق با کشیدگی کنترل‌شده.",
  },
  {
    id: "parastoo",
    label: "پرستو",
    family: "Parastoo Variable",
    css: `${NPM}/@fontsource-variable/parastoo/index.css`,
    category: "text",
    note: "متن نرم و گرد.",
  },
  {
    id: "changa",
    label: "چنگا",
    family: "Changa",
    css: `${NPM}/@fontsource/changa/index.css`,
    category: "text",
    note: "پهن‌تر؛ برای سربرگ‌ها و تیترهای کوچک خوب است.",
  },
  {
    id: "cairo",
    label: "کایرو",
    family: "Cairo Variable",
    css: `${NPM}/@fontsource-variable/cairo/index.css`,
    category: "text",
    note: "هندسی و باز.",
  },
  {
    id: "ibm-plex-sans-arabic",
    label: "پلکس عربی",
    family: "IBM Plex Sans Arabic",
    css: `${NPM}/@fontsource/ibm-plex-sans-arabic/index.css`,
    category: "text",
    note: "رسمی و جدی؛ وزن‌های ثابت.",
  },
  {
    id: "noto-sans-arabic",
    label: "نوتو سنس",
    family: "Noto Sans Arabic Variable",
    css: `${NPM}/@fontsource-variable/noto-sans-arabic/index.css`,
    category: "text",
    note: "سانس‌سریال گسترده با پوشش کامل حرف‌های فارسی.",
  },
  {
    id: "beiruti",
    label: "بیروتی",
    family: "Beiruti Variable",
    css: `${NPM}/@fontsource-variable/beiruti/index.css`,
    category: "text",
    note: "کوفی مدرن با حس تیتر.",
  },
  {
    id: "alexandria",
    label: "الکساندریا",
    family: "Alexandria Variable",
    css: `${NPM}/@fontsource-variable/alexandria/index.css`,
    category: "text",
    note: "هندسی و یکنواخت.",
  },
  {
    id: "handjet",
    label: "هندجت",
    family: "Handjet Variable",
    css: `${NPM}/@fontsource-variable/handjet/index.css`,
    category: "display",
    note: "فشرده و نمایشی؛ برای متن ریز مناسب نیست.",
  },
  {
    id: "lalezar",
    label: "لاله‌زار",
    family: "Lalezar",
    css: `${NPM}/@fontsource/lalezar/index.css`,
    category: "display",
    note: "تیتر ضخیم؛ فقط یک وزن دارد.",
  },
  {
    id: "markazi-text",
    label: "مرکزی",
    family: "Markazi Text Variable",
    css: `${NPM}/@fontsource-variable/markazi-text/index.css`,
    category: "naskh",
    note: "نسخ کشیده؛ در اندازهٔ بزرگ خواناتر است.",
  },
  {
    id: "noto-naskh-arabic",
    label: "نسخ نوتا",
    family: "Noto Naskh Arabic Variable",
    css: `${NPM}/@fontsource-variable/noto-naskh-arabic/index.css`,
    category: "naskh",
    note: "نسخ استاندارد و ساده.",
  },
  {
    id: "noto-nastaliq-urdu",
    label: "نستعلیق نوتا",
    family: "Noto Nastaliq Urdu Variable",
    css: `${NPM}/@fontsource-variable/noto-nastaliq-urdu/index.css`,
    category: "nastaliq",
    note: "نستعلیق؛ سطرها بلندتر می‌شوند.",
  },
  {
    id: "gulzar",
    label: "گلزار",
    family: "Gulzar",
    css: `${NPM}/@fontsource/gulzar/index.css`,
    category: "nastaliq",
    note: "نستعلیق ریز؛ برای تیتر و یک جمله، نه کل صفحه.",
  },
];

export const DEFAULT_FONT_ID = "vazirmatn";

const STORAGE_KEY = "fitplaner.font";

export const CATEGORY_FA: Record<FontCategory, string> = {
  text: "متن و رابط",
  naskh: "نسخ و کلاسیک",
  nastaliq: "نستعلیق",
  display: "تیتر و نمایش",
};

export function fontById(id: string | null | undefined): FontOption | null {
  if (!id) return null;
  return FONT_OPTIONS.find((f) => f.id === id) ?? null;
}

/** The choice lives in this browser only — it is presentation, not health data. */
export function storedFontId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw !== null && fontById(raw) ? raw : null;
  } catch {
    return null;
  }
}

function rememberFontId(id: string | null): void {
  try {
    if (id === null || id === DEFAULT_FONT_ID) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode: the choice simply does not survive the tab */
  }
}

const stackFor = (family: string): string =>
  `"${family}", "Vazirmatn", ui-sans-serif, system-ui, "Segoe UI", Tahoma, sans-serif`;

/** Applies the family to the token every component already reads. */
function writeVars(option: FontOption | null): void {
  const root = document.documentElement;
  if (!option || option.id === DEFAULT_FONT_ID) {
    root.style.removeProperty("--font-sans");
    root.removeAttribute("data-font");
    root.removeAttribute("data-font-category");
    return;
  }
  root.style.setProperty("--font-sans", stackFor(option.family));
  root.dataset.font = option.id;
  root.dataset.fontCategory = option.category;
}

const cssPromises = new Map<string, Promise<boolean>>();

/** One stylesheet per family, injected at most once per page life. */
function loadCss(option: FontOption): Promise<boolean> {
  if (!option.css) return Promise.resolve(true);
  const href = option.css;
  const known = cssPromises.get(option.id);
  if (known) return known;
  const p = new Promise<boolean>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    // print-media first: a stylesheet fetched over the network must not block the
    // page it is only decorating.
    link.media = "print";
    link.addEventListener("load", () => {
      link.media = "all";
      resolve(true);
    });
    link.addEventListener("error", () => {
      cssPromises.delete(option.id);
      link.remove();
      resolve(false);
    });
    document.head.appendChild(link);
  });
  cssPromises.set(option.id, p);
  return p;
}

export type FontOutcome = { ok: boolean; reason: "local" | "loaded" | "no-css" | "no-face" };

/**
 * Load the family and confirm the browser actually has a face for Persian text.
 * A false result is not an error to hide: the picker shows it and the app keeps
 * working on Vazirmatn.
 */
export async function ensureFont(id: string): Promise<FontOutcome> {
  const option = fontById(id);
  if (!option) return { ok: false, reason: "no-face" };
  if (!option.css) return { ok: true, reason: "local" };
  if (!(await loadCss(option))) return { ok: false, reason: "no-css" };
  try {
    const faces = await document.fonts.load(`16px "${option.family}"`, "ابپژچگیک ۱۲۳");
    if (faces.length === 0) return { ok: false, reason: "no-face" };
    await Promise.all(faces.map((f) => f.loaded.catch(() => undefined)));
    return { ok: true, reason: "loaded" };
  } catch {
    return { ok: false, reason: "no-face" };
  }
}

export async function selectFont(id: string | null): Promise<FontOutcome> {
  const option = fontById(id);
  rememberFontId(option ? option.id : null);
  if (!option || option.id === DEFAULT_FONT_ID) {
    writeVars(null);
    return { ok: true, reason: "local" };
  }
  const outcome = await ensureFont(option.id);
  // Keep the chosen stack even when the face failed: the fallback chain covers
  // the gap and the picker has already reported the failure.
  writeVars(outcome.ok ? option : null);
  return outcome;
}

/** Called before the first paint so the screen does not flash the default font. */
export function bootFont(): void {
  const id = storedFontId();
  const option = fontById(id);
  if (!option || option.id === DEFAULT_FONT_ID) return;
  writeVars(option);
  void ensureFont(option.id).then((outcome) => {
    if (!outcome.ok && storedFontId() === option.id) writeVars(null);
  });
}
