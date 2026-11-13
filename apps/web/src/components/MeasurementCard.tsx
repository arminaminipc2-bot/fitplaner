import { Info } from "lucide-react";
import { Card, Chip, cx } from "./ui";
import {
  DATA_QUALITY_FA,
  METRIC_FA,
  METRIC_UNIT,
  type DataQuality,
  type MeasurementMetric,
} from "../lib/domain";
import { faDelta, faNum, faRelative } from "../lib/format";

/**
 * One body-composition figure. The quality badge is mandatory: the spec forbids
 * presenting an estimated value as if it had been measured.
 */
export function MeasurementCard({
  metric,
  value,
  previous,
  takenAt,
  quality,
  note,
  className,
}: {
  metric: MeasurementMetric;
  value: number;
  previous?: number;
  takenAt: string;
  quality: DataQuality;
  note?: string;
  className?: string;
}) {
  const unit = METRIC_UNIT[metric];
  const digits = unit === "bpm" || metric === "soreness" ? 0 : 1;
  const unitFa =
    unit === "kg"
      ? "کیلوگرم"
      : unit === "cm"
        ? "سانتی‌متر"
        : unit === "percent"
          ? "٪"
          : unit === "bpm"
            ? "ضربان در دقیقه"
            : "";
  const diff = previous === undefined ? undefined : value - previous;

  return (
    <Card tone="sunken" className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-2">
        {/* the metric name must stay readable — a truncated "درصد چربی..." would
            hide which body figure the card reports, so it wraps instead */}
        <span className="min-w-0 text-sm leading-snug text-ink-2">{METRIC_FA[metric]}</span>
        <Chip tone={quality === "measured" ? "solid" : "outline"} className="shrink-0 whitespace-nowrap">
          {DATA_QUALITY_FA[quality]}
        </Chip>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-bold tracking-tight">{faNum(value, digits)}</span>
        {unitFa ? <span className="text-2xs text-ink-3">{unitFa}</span> : null}
        {diff !== undefined ? (
          <span className="num ms-auto text-2xs text-ink-2">{faDelta(diff, 1)}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2 text-2xs text-ink-3">
        {quality === "estimated" ? (
          <Info size={11} strokeWidth={2} aria-hidden />
        ) : null}
        <span className="truncate">{faRelative(takenAt)}</span>
      </div>

      {note ? <p className="text-sm leading-relaxed text-ink-3">{note}</p> : null}
    </Card>
  );
}
