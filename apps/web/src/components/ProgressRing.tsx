import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Grayscale progress ring — the reference home screen uses these instead of bars.
 * Tones are chosen by ink weight, never by colour, so a full ring and an empty
 * one are distinguishable without hue.
 */

type RingTone = "strong" | "mid" | "weak" | "hollow";

const RING_STROKE: Record<RingTone, string> = {
  strong: "var(--color-fill-strong)",
  mid: "var(--color-fill-mid)",
  // a low ring reads as faint fill rather than a different colour
  weak: "var(--color-ink-3)",
  hollow: "transparent",
};

export function ProgressRing({
  value,
  max = 100,
  size = 64,
  stroke = 5,
  tone = "strong",
  label,
  center,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tone?: RingTone;
  /** Announced to screen readers; the visual number in `center` is decorative. */
  label: string;
  center?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const pct = Math.round(ratio * 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${pct}٪`}
        // rings are geometric: keep them LTR so the sweep starts at twelve
        // o'clock regardless of the document direction
        style={{ direction: "ltr" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={RING_STROKE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      {center ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {center}
        </div>
      ) : null}
    </div>
  );
}

/** Small dot indicator for calendar cells and legends. */
export function StatusDot({
  tone,
  className,
}: {
  tone: "strong" | "mid" | "weak" | "hollow" | "ring";
  className?: string;
}) {
  const map = {
    strong: "bg-fill-strong",
    mid: "bg-fill-mid",
    weak: "bg-fill-weak",
    hollow: "bg-transparent border border-line",
    ring: "bg-transparent border-2 border-ink",
  } as const;
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", map[tone], className)} />;
}
