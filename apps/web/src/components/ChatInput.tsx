import { useEffect, useRef, useState } from "react";
import { Image, Mic, Send } from "lucide-react";
import { IconButton, cx } from "./ui";

/**
 * Message composer. Enter sends, Shift+Enter adds a line — the same contract on
 * a Persian keyboard. Voice and image attach only appear when the host page has
 * a real handler for them.
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  onVoice,
  onAttach,
  placeholder = "پیام خود را بنویسید…",
  disabled,
  busy,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onVoice?: () => void;
  onAttach?: () => void;
  placeholder?: string;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // three lines of visible growth, then it scrolls
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value]);

  const send = () => {
    if (disabled || busy || !value.trim()) return;
    onSend();
  };

  return (
    <div
      className={cx(
        "flex items-end gap-2 rounded-card border bg-card p-2 transition-colors",
        focused ? "border-ink-3" : "border-line",
        className,
      )}
    >
      {onVoice ? (
        <IconButton label="ورود صوتی" onClick={onVoice} disabled={disabled}>
          <Mic size={17} strokeWidth={1.75} aria-hidden />
        </IconButton>
      ) : null}

      {onAttach ? (
        <IconButton label="افزودن تصویر غذا" onClick={onAttach} disabled={disabled}>
          <Image size={17} strokeWidth={1.75} aria-hidden />
        </IconButton>
      ) : null}

      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="متن پیام"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-[132px] min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-relaxed outline-none placeholder:text-ink-3 disabled:opacity-50"
      />

      <IconButton
        label="ارسال پیام"
        onClick={send}
        disabled={disabled || busy || !value.trim()}
        className="bg-fill-strong text-canvas hover:bg-ink"
      >
        {busy ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          // the paper plane points along the reading direction
          <Send size={17} strokeWidth={2} className="-scale-x-100" aria-hidden />
        )}
      </IconButton>
    </div>
  );
}
