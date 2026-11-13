import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui";
import type { PlanChange } from "../lib/domain";

/**
 * Human-in-the-loop gate (§11). A model's proposal is shown as a preview with the
 * exact list of writes it will perform; nothing reaches the database until the
 * user presses the confirm button, and destructive changes are labelled as such.
 */
export function ConfirmationDialog({
  open,
  title,
  description,
  changes,
  destructive,
  confirmLabel = "اعمال تغییرات",
  cancelLabel = "انصراف",
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** The concrete writes this approval authorises. */
  changes?: PlanChange[];
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // keep focus inside the dialog rather than letting Tab escape into the page
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const isDestructive = destructive || changes?.some((c) => c.destructive);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-lg animate-rise rounded-card border border-line bg-card p-5 shadow-pop"
      >
        <div className="flex items-start gap-3">
          {isDestructive ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ink text-ink">
              <AlertTriangle size={16} strokeWidth={2} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-lg font-bold">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p>
            ) : null}
          </div>
        </div>

        {changes && changes.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3 rounded-xl border border-divider bg-card-2 p-3">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{c.summary}</span>
                {c.detail.length > 0 ? (
                  <ul className="flex flex-col gap-1 ps-3 text-2xs text-ink-3">
                    {c.detail.map((d) => (
                      <li key={d} className="list-disc">
                        {d}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {c.destructive ? (
                  <span className="text-2xs text-ink-2">این تغییر قابل بازگشت نیست.</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-4 text-sm leading-relaxed text-ink-3">
          پیشنهادهای هوش مصنوعی پیش از تأیید شما هیچ داده‌ای را تغییر نمی‌دهند.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Button
            ref={confirmRef}
            variant={isDestructive ? "destructive" : "primary"}
            block
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
