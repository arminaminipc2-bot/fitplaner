import { Mic, MicOff, Square } from "lucide-react";
import { Button, Card, Field, TextInput, cx } from "./ui";

/**
 * Voice capture (§10.3). The engine is reported honestly: browser
 * SpeechRecognition is network-backed and absent on some devices, so an
 * unsupported device gets an explicit state plus the text fallback instead of a
 * microphone button that silently does nothing.
 */

export type SttStatus = "idle" | "listening" | "processing" | "unsupported" | "denied" | "error";

export const STT_STATUS_FA: Record<SttStatus, string> = {
  idle: "آماده ضبط",
  listening: "در حال گوش دادن…",
  processing: "در حال تبدیل گفتار به متن…",
  unsupported: "این دستگاه پشتیبانی نمی‌کند",
  denied: "دسترسی میکروفن داده نشده",
  error: "تشخیص گفتار شکست خورد",
};

export function VoiceInput({
  status,
  engineLabel,
  needsNetwork,
  transcript,
  onTranscriptChange,
  onStart,
  onStop,
  onConfirm,
  error,
  className,
}: {
  status: SttStatus;
  /** Which engine is actually running — «موتور مرورگر», «محلی», or none. */
  engineLabel?: string;
  /** Browser engines round-trip to the vendor; say so rather than implying offline. */
  needsNetwork?: boolean;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onConfirm: () => void;
  error?: string;
  className?: string;
}) {
  const blocked = status === "unsupported" || status === "denied";
  const listening = status === "listening";

  return (
    <Card tone="sunken" className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {blocked ? (
            <MicOff size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
          ) : (
            <Mic
              size={16}
              strokeWidth={1.75}
              className={cx("shrink-0", listening ? "text-ink" : "text-ink-2")}
              aria-hidden
            />
          )}
          <span className={cx("truncate", listening && "animate-pulse-dot")}>
            {STT_STATUS_FA[status]}
          </span>
        </span>
        {engineLabel ? (
          <span className="shrink-0 rounded-pill border border-line px-2 py-1 text-2xs text-ink-3">
            {engineLabel}
          </span>
        ) : null}
      </div>

      {status === "unsupported" ? (
        <p className="text-sm leading-relaxed text-ink-2">
          مرورگر شما تشخیص گفتار فارسی ندارد. می‌توانید وعده را از همین‌جا تایپ کنید؛ متن
          همان مسیری را طی می‌کند که گفتار طی می‌کرد.
        </p>
      ) : needsNetwork && !blocked ? (
        <p className="text-sm leading-relaxed text-ink-3">
          این موتور برای تبدیل گفتار به متن به اینترنت نیاز دارد. برای حفظ حریم خصوصی،
          صدا فقط برای تبدیل استفاده می‌شود و ذخیره نمی‌شود.
        </p>
      ) : null}

      <Field label="متن تشخیص‌داده‌شده" hint="می‌توانید پیش از ارسال اصلاحش کنید.">
        <TextInput
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder="مثلاً: صد گرم برنج، یک سینه مرغ و یک قاشق روغن زیتون"
          aria-label="متن وعده غذایی"
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant={listening ? "primary" : "secondary"}
          leading={listening ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
          onClick={listening ? onStop : onStart}
          disabled={blocked || status === "processing"}
        >
          {listening ? "توقف ضبط" : "شروع ضبط"}
        </Button>
        <Button variant="primary" onClick={onConfirm} disabled={transcript.trim().length === 0}>
          محاسبه ارزش غذایی
        </Button>
      </div>
    </Card>
  );
}
