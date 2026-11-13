import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from "react";

/**
 * Base primitives. Monochrome by construction: there is no `variant="success"`
 * with a green, only weight-of-ink and surface-elevation differences.
 */

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* ---------- Card ---------- */

type CardProps = {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: "default" | "sunken" | "raised";
  as?: "div" | "section" | "article" | "li";
  padded?: boolean;
  role?: string;
  "aria-live"?: "polite" | "assertive" | "off";
};

const CARD_TONE: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "bg-card border-line",
  sunken: "bg-card-2 border-divider",
  raised: "bg-card-3 border-line",
};

export function Card({
  children,
  id,
  className,
  tone = "default",
  as: Tag = "div",
  padded = true,
  role,
  ...aria
}: CardProps) {
  return (
    <Tag
      id={id}
      role={role}
      aria-live={aria["aria-live"]}
      className={cx(
        "rounded-card border shadow-card",
        CARD_TONE[tone],
        padded && "p-5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Card header: Persian title on the right of the row, action on the left (RTL). */
export function CardHead({
  title,
  meta,
  action,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-ink">{title}</h3>
        {meta ? <p className="mt-1 truncate text-2xs text-ink-3">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg";
  leading?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
  loading?: boolean;
  /** React 19 passes refs as a normal prop; the primitives stay ref-forwarding. */
  ref?: Ref<HTMLButtonElement>;
};

const BTN_VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-fill-strong text-canvas hover:bg-ink font-semibold",
  secondary: "bg-card-3 text-ink border border-line hover:border-ink-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-card-3",
  outline: "border border-line text-ink hover:bg-card-3",
  // destructive stays monochrome: an alert glyph plus a hard white edge carries
  // the warning because hue is not available to us
  destructive: "border border-ink text-ink hover:bg-ink hover:text-canvas",
};

const BTN_SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-10 px-4 text-sm gap-2 rounded-full",
  md: "h-11 px-5 text-base gap-2 rounded-full",
  lg: "h-12 px-6 text-base gap-2 rounded-full",
};

export function Button({
  variant = "secondary",
  size = "md",
  leading,
  trailing,
  block,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ease-out select-none",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : leading}
      {children}
      {trailing}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
  active?: boolean;
};

/** Icon-only controls always carry a Persian accessible name. */
export function IconButton({
  label,
  size = "md",
  active,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-out select-none",
        "active:scale-90 disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-10" : "size-11",
        active ? "bg-fill-strong text-canvas shadow-sm" : "text-ink-2 hover:bg-card-3 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="در حال بارگذاری"
      className={cx(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

/* ---------- Chip ---------- */

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "solid" | "outline";
  className?: string;
}) {
  const tones = {
    neutral: "bg-card-3 text-ink-2",
    solid: "bg-fill-strong text-canvas font-semibold",
    outline: "border border-line text-ink-2",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-2xs whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Segmented control ---------- */

export type SegmentOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "flex w-full min-w-0 items-stretch gap-1 overflow-x-auto rounded-full border border-line bg-card-2 p-1 no-scrollbar shadow-inner",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cx(
              "h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-all duration-200 ease-out select-none active:scale-95",
              selected
                ? "bg-fill-strong font-semibold text-canvas shadow-sm"
                : "text-ink-2 hover:text-ink hover:bg-card-3/50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Fields ---------- */

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  const id = htmlFor ?? `fld-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  /** Latin input stays left-to-right (email, API keys) even inside the RTL shell. */
  ltr?: boolean;
};

export function TextInput({ invalid, ltr, className, ...rest }: TextInputProps) {
  return (
    <input
      dir={ltr ? "ltr" : undefined}
      aria-invalid={invalid || undefined}
      className={cx(
        "h-11 w-full rounded-full border bg-card-2 px-5 text-base text-ink placeholder:text-ink-3",
        "transition-colors duration-150 focus:border-ink focus:outline-none",
        invalid ? "border-ink" : "border-line",
        ltr && "text-left",
        className,
      )}
      {...rest}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

/** Multi-line Persian entry (notes, injuries, food preferences). */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx(
        "min-h-24 w-full resize-y rounded-3xl border bg-card-2 p-4 text-base text-ink placeholder:text-ink-3",
        "transition-colors duration-150 focus:border-ink focus:outline-none",
        invalid ? "border-ink" : "border-line",
        className,
      )}
      {...rest}
    />
  );
}

/* ---------- Choice controls ---------- */

/** Select-sized button that reads as picked: ink weight and a hard border, no hue. */
export function Choice({
  selected,
  children,
  onClick,
  disabled,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "min-h-11 rounded-full border px-5 text-sm transition-all duration-150 ease-out select-none active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-40",
        selected
          ? "border-ink bg-fill-strong font-semibold text-canvas shadow-sm"
          : "border-line bg-card-2 text-ink-2 hover:border-ink-3 hover:text-ink hover:bg-card-3/40",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- Meter ---------- */

/** Horizontal grayscale progress: white fill over the border tone. */
export function Meter({
  value,
  max = 100,
  label,
  valueLabel,
  stacked,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  /** Put the label above the value instead of opposite it — needed in narrow
   *  columns where a long Persian word and a number cannot share one line. */
  stacked?: boolean;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {label || valueLabel ? (
        <div
          className={cx(
            "gap-1",
            stacked ? "flex flex-col" : "flex items-baseline justify-between",
          )}
        >
          {label ? (
            <span className={cx("min-w-0 truncate text-sm text-ink-2", stacked && "text-2xs")}>
              {label}
            </span>
          ) : null}
          {valueLabel ? (
            <span className={cx("num shrink-0 whitespace-nowrap text-sm text-ink", stacked && "text-2xs")}>
              {valueLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-line"
      >
        <div
          className="h-full rounded-pill bg-fill-strong transition-[width] duration-300"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("my-4 border-0 border-t border-divider", className)} />;
}

/** Section heading used at the top of a page block. */
export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
