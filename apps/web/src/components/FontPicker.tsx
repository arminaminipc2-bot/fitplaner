import { useEffect, useRef, useState, type RefObject } from "react";
import { Card, CardHead, Chip, cx } from "./ui";
import {
  CATEGORY_FA,
  DEFAULT_FONT_ID,
  FONT_OPTIONS,
  ensureFont,
  selectFont,
  storedFontId,
  type FontOption,
} from "../lib/fonts";

type LoadState = "idle" | "loading" | "ready" | "failed";

const SAMPLE_SENTENCE = "برنامهٔ تمرین و تغذیه";
const SAMPLE_NUMBERS = "۱۲۳۴۵۶۷۸۹۰ · ٪ · ۱۲:۳۰";
const SAMPLE_PERSIAN_GLYPHS = "گ پ چ ژ ی ک ء";

/**
 * Previews are 15 webfonts, so only the cards actually on screen ask the network
 * for their face. A card that scrolls into view loads once and keeps its result.
 */
function useInView<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function FontOptionRow({
  option,
  current,
  onPick,
}: {
  option: FontOption;
  current: string;
  onPick: (id: string) => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [state, setState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!inView || !option.css) return;
    let active = true;
    setState("loading");
    void ensureFont(option.id).then((outcome) => {
      if (active) setState(outcome.ok ? "ready" : "failed");
    });
    return () => {
      active = false;
    };
  }, [inView, option.css, option.id]);

  const isCurrent = option.id === current;
  const badge =
    option.css === null
      ? { tone: "outline" as const, text: "بدون اینترنت" }
      : state === "ready"
        ? { tone: "neutral" as const, text: "آماده" }
        : state === "loading"
          ? { tone: "neutral" as const, text: "در حال بارگذاری" }
          : state === "failed"
            ? { tone: "outline" as const, text: "بارگذاری نشد" }
            : null;

  return (
    <div
      ref={ref}
      className={cx(
        "relative rounded-md border transition-colors duration-150",
        isCurrent ? "border-ink bg-card-3" : "border-line bg-card-2 hover:border-ink-3",
      )}
    >
      <label className="flex cursor-pointer flex-col gap-2 p-4">
        <span className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name="app-font"
              className="h-3.5 w-3.5 shrink-0 accent-[var(--color-ink)]"
              checked={isCurrent}
              onChange={() => onPick(option.id)}
            />
            <span className="text-sm font-semibold text-ink">{option.label}</span>
          </span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {isCurrent ? <Chip tone="solid">انتخاب شما</Chip> : null}
            {badge ? <Chip tone={badge.tone}>{badge.text}</Chip> : null}
          </span>
        </span>

        {/* the preview is the whole point of the control: the family itself, at the
            sizes the app actually uses */}
        <span
          className="block leading-snug text-ink"
          style={{ fontFamily: `"${option.family}", "Vazirmatn", sans-serif` }}
        >
          <span className="block text-lg">{SAMPLE_SENTENCE}</span>
          <span className="num block text-2xs text-ink-2">{SAMPLE_NUMBERS}</span>
          <span className="block text-2xs text-ink-3">{SAMPLE_PERSIAN_GLYPHS}</span>
        </span>

        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
          <span>{CATEGORY_FA[option.category]}</span>
          <span aria-hidden>·</span>
          <span>{option.note}</span>
        </span>
      </label>
    </div>
  );
}

export function FontPicker() {
  const [current, setCurrent] = useState<string>(() => storedFontId() ?? DEFAULT_FONT_ID);
  const [notice, setNotice] = useState<string | null>(null);

  const pick = async (id: string) => {
    setCurrent(id);
    setNotice(null);
    const outcome = await selectFont(id);
    const option = FONT_OPTIONS.find((f) => f.id === id);
    if (!option) return;
    if (outcome.ok) {
      setNotice(`فونت «${option.label}» اعمال شد.`);
    } else {
      setNotice(
        `فونت «${option.label}» بارگذاری نشد؛ برنامه با وزیرمتن ادامه می‌دهد. اتصال به اینترنت لازم است.`,
      );
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardHead
        title="فونت و تایپوگرافی"
        meta="پیش‌نمایش هر قلم را همان‌جا می‌بینید؛ انتخاب فقط در همین مرورگر می‌ماند."
      />

      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
        <p>
          پانزده خانوادهٔ فارسی و عربی در دسترس است. به‌جز وزیرمتن که داخل خودِ برنامه
          ذخیره شده، بقیهٔ قلم‌ها هنگام دیدن پیش‌نمایش از اینترنت بارگذاری می‌شوند؛
          اگر آفلاین باشید یا بارگذاری یک قلم شکست بخورد، برنامه همان‌جا می‌گوید و
          بی‌درنگ به وزیرمتن برمی‌گردد تا هیچ متنی ناخوانا نماند.
        </p>
        <p>
          این انتخاب فقط قلم را عوض می‌کند: رنگ‌ها، چیدمان راست‌به‌چپ، تقویم جلالی و
          ارقام فارسی ثابت می‌مانند. چون سلسله‌مراتب در این برنامه با وزن و سطوح
          خاکستری ساخته شده، بعضی قلم‌های تیتری برای متن ریز مناسب نیستند و در
          پیش‌نمایش همین را نشان می‌دهند.
        </p>
      </div>

      <fieldset data-font-picker className="grid grid-cols-1 gap-2 border-0 p-0 tablet:grid-cols-2">
        <legend className="sr-only">فونت برنامه</legend>
        {FONT_OPTIONS.map((option) => (
          <FontOptionRow key={option.id} option={option} current={current} onPick={(id) => void pick(id)} />
        ))}
      </fieldset>

      {notice ? (
        <p role="status" aria-live="polite" className="text-sm text-ink">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
