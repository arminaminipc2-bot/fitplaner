import type { ReactNode } from "react";
import { Dumbbell, Salad, User } from "lucide-react";
import { cx } from "./ui";
import { CHAT_ROLE_FA, type ChatRole } from "../lib/domain";
import { faTime } from "../lib/format";

/** Shape, not colour, tells the two coaches apart in a monochrome palette. */
const ROLE_ICON: Record<ChatRole, typeof User> = {
  user: User,
  coach: Dumbbell,
  nutritionist: Salad,
};

/**
 * One chat turn. Each turn is labelled in Persian and carries its own mark, so
 * the user, the coach and the nutritionist stay distinguishable without colour.
 */
export function ChatMessage({
  role,
  content,
  at,
  streaming,
  attachments,
  children,
}: {
  role: ChatRole;
  content: string;
  at: string | Date;
  /** The model is still producing text: show the caret, never a fake partial. */
  streaming?: boolean;
  attachments?: ReactNode;
  /** Structured payloads the turn produced — plan-change cards, nutrition cards. */
  children?: ReactNode;
}) {
  const mine = role === "user";
  const Icon = ROLE_ICON[role];

  return (
    <div className={cx("flex w-full gap-3", mine ? "flex-row-reverse" : "flex-row")}>
      <span
        className={cx(
          "mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border text-2xs",
          mine ? "border-line bg-card-2 text-ink-3" : "border-ink bg-fill-strong text-canvas",
        )}
        aria-hidden
      >
        <Icon size={14} strokeWidth={2} />
      </span>

      <div className={cx("flex min-w-0 max-w-[min(100%,34rem)] flex-col gap-2", mine && "items-end")}>
        <span className="px-1 text-2xs text-ink-3">{CHAT_ROLE_FA[role]}</span>

        <div
          className={cx(
            "rounded-card border px-4 py-3 text-base leading-[1.8]",
            mine
              ? "border-line bg-card-3 text-ink"
              : "border-divider bg-card text-ink whitespace-pre-line",
          )}
        >
          {content ? (
            <p className="min-w-0 break-words">{content}</p>
          ) : streaming ? (
            /* before the first token arrives the bubble would otherwise be an
               empty pill — say what is actually happening */
            <p className="text-ink-3">در حال نوشتن…</p>
          ) : null}
          {streaming ? (
            <span
              role="status"
              aria-label="در حال نوشتن پاسخ"
              className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-full bg-ink-2 align-middle"
            />
          ) : null}
          {attachments}
        </div>

        {children}

        <time className="num px-1 text-2xs text-ink-4" dateTime={new Date(at).toISOString()}>
          {faTime(at)}
        </time>
      </div>
    </div>
  );
}
