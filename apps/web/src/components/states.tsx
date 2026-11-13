import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";
import { Button, Card, Spinner, cx } from "./ui";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const Icon = icon ?? <Inbox size={22} strokeWidth={1.5} aria-hidden />;
  return (
    <div className={cx("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-full border border-line bg-card-2 text-ink-3">
        {Icon}
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-[34ch] text-sm leading-relaxed text-ink-3">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Skeleton block; `rows` reproduces the shape of the content being loaded. */
export function LoadingState({
  label = "در حال بارگذاری",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Card
      role="status"
      aria-live="polite"
      className={cx("flex flex-col gap-3", className)}
      // role="status" on a Card is enough; the visible label carries the meaning
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-2 text-sm text-ink-2">
        <Spinner />
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton h-3.5 rounded-pill" style={{ width: `${100 - i * 12}%` }} />
        ))}
      </div>
    </Card>
  );
}

export function ErrorState({
  title = "مشکلی رخ داد",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card
      tone="sunken"
      role="alert"
      className={cx("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}
    >
      <span className="flex size-11 items-center justify-center rounded-full border border-ink-3 text-ink">
        <AlertTriangle size={19} strokeWidth={1.75} aria-hidden />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-[38ch] text-sm text-ink-2">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" leading={<RotateCcw size={13} />} onClick={onRetry}>
          تلاش دوباره
        </Button>
      ) : null}
    </Card>
  );
}
