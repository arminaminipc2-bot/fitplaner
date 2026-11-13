import type { ReactNode } from "react";
import { ArrowUpRight, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, cx } from "./ui";
import { faDelta, faNum } from "../lib/format";

/**
 * Headline number card: a 2-up grid on phones, a 4-up rail on desktop.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon: Icon,
  onClick,
  className,
  children,
}: {
  label: string;
  /** Already formatted in Persian digits, or a plain number. */
  value: number | string;
  unit?: string;
  /** Positive means "towards the goal" — the caller decides the semantics, not the sign. */
  delta?: number;
  deltaLabel?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cx("relative flex flex-col gap-3", onClick && "transition-colors hover:border-ink-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm text-ink-2">{label}</span>
        {Icon ? <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden /> : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="num text-3xl font-bold tracking-tight">
          {typeof value === "number" ? faNum(value) : value}
        </span>
        {unit ? <span className="text-sm text-ink-3">{unit}</span> : null}
      </div>

      {delta !== undefined || deltaLabel ? (
        <div className="flex items-center gap-2 text-2xs text-ink-3">
          {delta !== undefined ? (
            <span className="num inline-flex items-center gap-1 text-ink-2">
              {delta >= 0 ? (
                <ArrowUpRight size={12} strokeWidth={2} aria-hidden />
              ) : (
                <TrendingDown size={12} strokeWidth={2} aria-hidden />
              )}
              {faDelta(delta, 1)}
            </span>
          ) : null}
          {deltaLabel ? <span className="truncate">{deltaLabel}</span> : null}
        </div>
      ) : null}

      {children}

      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${label}: مشاهده جزئیات`}
          className="absolute inset-0 rounded-card"
        />
      ) : null}
    </Card>
  );
}
