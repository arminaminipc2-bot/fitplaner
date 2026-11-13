import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, cx } from "./ui";

/**
 * Collapsible settings block used by Profile (§12) and the AI settings screen
 * (§13). Sections start open when they contain unsaved required input, so a
 * collapsed panel can never hide a validation error.
 */
export function SettingsSection({
  title,
  description,
  summary,
  defaultOpen = true,
  required,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Right-aligned status text visible while collapsed, e.g. «۳ مورد تنظیم‌شده». */
  summary?: string;
  defaultOpen?: boolean;
  /** Marks a section the user must fill before the app can compute anything. */
  required?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `sec-${title.replace(/\s+/g, "-")}`;

  return (
    <Card padded={false} className={cx("overflow-hidden", className)}>
      <div className="flex items-center gap-3 p-5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
        >
          <ChevronDown
            size={16}
            strokeWidth={2}
            className={cx(
              "shrink-0 text-ink-3 transition-transform duration-200",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-base font-semibold">{title}</span>
              {required ? (
                <span className="shrink-0 rounded-pill border border-line px-2 py-1 text-2xs text-ink-2">
                  لازم
                </span>
              ) : null}
            </span>
            {description ? (
              <span
                className={cx(
                  "block truncate text-2xs text-ink-3",
                  open && "whitespace-normal",
                )}
              >
                {description}
              </span>
            ) : null}
          </span>
        </button>
        {open ? null : summary ? (
          <span className="shrink-0 text-2xs text-ink-3">{summary}</span>
        ) : null}
        {action}
      </div>

      {open ? (
        <div id={panelId} className="border-t border-divider p-5">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
