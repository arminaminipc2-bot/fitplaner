import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHead, cx } from "./ui";
import { faNum } from "../lib/format";

export type ChartPoint = { label: string; value: number | null };

/**
 * Chart shell. The plot itself is forced back to left-to-right because a time
 * axis that runs right-to-left reads as a reversed trend; only the title,
 * legend and tooltip text stay Persian and RTL.
 */
export function ChartCard({
  title,
  meta,
  points,
  unit,
  variant = "line",
  action,
  height = 180,
  className,
}: {
  title: string;
  meta?: ReactNode;
  points: ChartPoint[];
  unit?: string;
  variant?: "line" | "area";
  action?: ReactNode;
  height?: number;
  className?: string;
}) {
  const data = points.filter((p) => p.value !== null).map((p) => ({ ...p, value: p.value as number }));
  const values = data.map((d) => d.value);
  const floor = values.length ? Math.min(...values) : 0;
  const ceil = values.length ? Math.max(...values) : 1;
  const pad = Math.max(1, (ceil - floor) * 0.15);

  return (
    <Card className={cx("flex flex-col gap-4", className)}>
      <CardHead title={title} meta={meta} action={action} />

      {data.length < 2 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          برای دیدن روند، حداقل دو اندازه‌گیری لازم است.
        </p>
      ) : (
        <div style={{ direction: "ltr", height }} className="w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "area" ? (
              <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <ChartDefs floor={floor - pad} ceil={ceil + pad} unit={unit} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-fill-strong)"
                  strokeWidth={1.75}
                  fill="url(#mono-fade)"
                  dot={{ r: 2, fill: "var(--color-fill-strong)", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "var(--color-ink)", strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <ChartDefs floor={floor - pad} ceil={ceil + pad} unit={unit} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-fill-strong)"
                  strokeWidth={1.75}
                  dot={{ r: 2, fill: "var(--color-fill-mid)", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "var(--color-ink)", strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/** Axes, grid and the grayscale tooltip shared by both chart variants. */
function ChartDefs({ floor, ceil, unit }: { floor: number; ceil: number; unit?: string }) {
  return (
    <>
      <defs>
        <linearGradient id="mono-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-fill-strong)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--color-fill-strong)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke="var(--color-divider)" strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fill: "var(--color-ink-3)", fontSize: 12, fontFamily: "var(--font-sans)" }}
        axisLine={{ stroke: "var(--color-divider)" }}
        tickLine={false}
        interval="preserveStartEnd"
        minTickGap={18}
      />
      <YAxis
        domain={[floor, ceil]}
        width={48}
        // recharts draws the axis in Latin digits; the screen is Persian-first,
        // so the tick text is formatted here rather than left to the library
        tickFormatter={(v: number) => faNum(v, ceil - floor >= 20 ? 0 : 1)}
        tick={{ fill: "var(--color-ink-3)", fontSize: 12, fontFamily: "var(--font-sans)" }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0];
          return (
            <div
              dir="rtl"
              className="rounded-sm border border-line bg-card-3 px-3 py-2 text-2xs shadow-pop"
            >
              <div className="text-ink-3">{p.payload.label as string}</div>
              <div className="num mt-1 font-semibold text-ink">
                {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(
                  p.value as number,
                )}
                {unit ? ` ${unit}` : ""}
              </div>
            </div>
          );
        }}
      />
    </>
  );
}
