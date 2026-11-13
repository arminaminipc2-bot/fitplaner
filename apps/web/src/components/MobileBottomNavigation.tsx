import { Link, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "../lib/nav";
import { cx } from "./ui";

/**
 * Mobile Bottom Navigation:
 * Fixed dock with ergonomic RTL order:
 * 1. خانه (Home) - rightmost
 * 2. تمرینات (Workouts)
 * 3. غذاها (Meals/Nutrition) - center
 * 4. پیشرفت (Progress)
 * 5. دستیارها (Assistants)
 * 6. دکمه (+) (Quick Add action) - leftmost
 *
 * Polished with smooth micro-interactions, scale hops, glowing active indicators,
 * and rotating quick-add trigger.
 */
export function MobileBottomNavigation({ onQuickAdd }: { onQuickAdd: () => void }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get("tab");

  const isItemActive = (item: NavItem) => {
    if (item.key === "home") {
      return location.pathname === "/";
    }
    if (item.key === "workouts") {
      return location.pathname === "/workouts" || (location.pathname === "/plan" && (currentTab === "workouts" || !currentTab));
    }
    if (item.key === "nutrition") {
      return location.pathname === "/nutrition" || (location.pathname === "/plan" && currentTab === "nutrition");
    }
    if (item.key === "progress") {
      return location.pathname === "/progress";
    }
    if (item.key === "chat") {
      return location.pathname === "/chat";
    }
    return false;
  };

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto relative mx-auto flex w-full max-w-lg items-center gap-1.5 rounded-full border border-white/12 bg-card-2/85 p-2 shadow-[0_14px_45px_rgba(0,0,0,0.65)] backdrop-blur-2xl backdrop-saturate-150 before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-[1px] before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent">
        <ul className="flex min-w-0 flex-1 items-stretch gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isItemActive(item);
            const Icon = item.icon;

            return (
              <li key={item.key} className="flex-1">
                <Link
                  to={item.to}
                  className={cx(
                    "group relative flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-full px-1 py-1.5 transition-all duration-200 select-none",
                    "active:scale-90 active:duration-100",
                    active
                      ? "bg-white/12 text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
                      : "text-ink-3 hover:bg-white/[0.05] hover:text-ink-2",
                  )}
                >
                  <div
                    className={cx(
                      "relative flex items-center justify-center transition-all duration-300",
                      active ? "scale-110 -translate-y-0.5 text-ink" : "group-hover:-translate-y-0.5",
                    )}
                  >
                    <Icon
                      size={20}
                      strokeWidth={active ? 2.3 : 1.75}
                      aria-hidden
                      className={cx("transition-colors duration-200", active ? "text-ink" : "text-ink-3 group-hover:text-ink-2")}
                    />
                    {active && (
                      <span
                        className="absolute -top-1 -right-1 size-1.5 rounded-full bg-fill-strong shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse"
                        aria-hidden
                      />
                    )}
                  </div>

                  <span
                    className={cx(
                      "text-2xs leading-tight transition-all duration-200",
                      active
                        ? "font-bold text-ink scale-100"
                        : "text-ink-3 font-normal group-hover:text-ink-2",
                    )}
                  >
                    {item.label}
                  </span>

                  {active && (
                    <span
                      className="absolute bottom-1 h-0.5 w-3 rounded-full bg-fill-strong transition-all duration-300"
                      aria-hidden
                    />
                  )}
                  {active ? <span className="sr-only">(صفحه فعلی)</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Separator before Quick Add action */}
        <div className="h-7 w-[1px] bg-white/10 shrink-0" aria-hidden />

        {/* Action button: Quick Add (+) */}
        <button
          type="button"
          aria-label="افزودن سریع"
          onClick={onQuickAdd}
          className="group relative my-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-fill-strong via-white to-zinc-200 text-canvas shadow-[0_4px_18px_rgba(255,255,255,0.22)] transition-all duration-200 active:scale-85 hover:shadow-[0_6px_22px_rgba(255,255,255,0.35)]"
        >
          <span className="absolute inset-0 rounded-full bg-white/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-ping" />
          <Plus
            size={22}
            strokeWidth={2.4}
            aria-hidden
            className="transition-transform duration-300 ease-out group-hover:rotate-90 group-active:rotate-45"
          />
        </button>
      </div>
    </nav>
  );
}
