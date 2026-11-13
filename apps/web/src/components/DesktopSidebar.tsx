import { Link, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Settings, User } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "../lib/nav";
import { IconButton, cx } from "./ui";

const WIDTH = "w-[236px]";
const WIDTH_COLLAPSED = "w-[76px]";

/**
 * Desktop navigation: matching mobile order and state logic, persistent and collapsible.
 */
export function DesktopSidebar({
  collapsed,
  onToggleCollapsed,
  onOpenSettings,
  userName,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenSettings?: () => void;
  userName?: string;
}) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get("tab");

  const isItemActive = (item: NavItem) => {
    if (item.key === "home") return location.pathname === "/";
    if (item.key === "workouts") return location.pathname === "/workouts" || (location.pathname === "/plan" && (currentTab === "workouts" || !currentTab));
    if (item.key === "nutrition") return location.pathname === "/nutrition" || (location.pathname === "/plan" && currentTab === "nutrition");
    if (item.key === "progress") return location.pathname === "/progress";
    if (item.key === "chat") return location.pathname === "/chat";
    return false;
  };

  return (
    <nav
      aria-label="ناوبری اصلی"
      className={cx(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-card-2",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        "desktop:flex",
        collapsed ? WIDTH_COLLAPSED : WIDTH,
        "transition-[width] duration-200",
      )}
    >
      <div className={cx("flex items-center gap-2 px-4 py-5", collapsed && "justify-center px-0")}>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-card text-2xs font-bold text-ink-2"
          aria-hidden
        >
          FP
        </span>
        {collapsed ? null : (
          <span className="min-w-0 flex-1 truncate text-base font-bold">فیت‌پلنر</span>
        )}
        <IconButton
          label={collapsed ? "باز کردن منو" : "بستن منو"}
          size="sm"
          onClick={onToggleCollapsed}
          className={collapsed ? "" : "ms-auto"}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </IconButton>
      </div>

      <ul className="flex flex-1 flex-col gap-1.5 px-3">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(item);
          return (
            <li key={item.key}>
              <Link
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-full px-3 text-sm transition-all duration-150 active:scale-95",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-card-3 font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]"
                    : "text-ink-2 hover:bg-card-3/60 hover:text-ink",
                )}
              >
                <item.icon size={19} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {collapsed ? null : <span className="truncate">{item.label}</span>}
                {active ? <span className="sr-only">(صفحه فعلی)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={cx("flex flex-col gap-1 border-t border-divider px-3 py-4", collapsed && "items-center")}>
        <Link
          to="/profile"
          className={cx(
            "flex min-h-11 items-center gap-3 rounded-full px-3 text-sm transition-colors",
            collapsed && "justify-center px-0",
            location.pathname === "/profile" ? "bg-card-3 font-semibold text-ink" : "text-ink-2 hover:text-ink",
          )}
          title="پروفایل"
        >
          <User size={18} strokeWidth={1.75} aria-hidden />
          {collapsed ? null : <span>پروفایل کاربری</span>}
        </Link>
        <Link
          to="/settings"
          className={cx(
            "flex min-h-11 items-center gap-3 rounded-full px-3 text-sm transition-colors",
            collapsed && "justify-center px-0",
            location.pathname === "/settings" ? "bg-card-3 font-semibold text-ink" : "text-ink-2 hover:text-ink",
          )}
          title="تنظیمات"
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden />
          {collapsed ? null : <span>تنظیمات</span>}
        </Link>
        {userName && !collapsed ? (
          <span className="truncate px-3 pt-1 text-2xs text-ink-3">{userName}</span>
        ) : null}
        {onOpenSettings && !collapsed ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-3 text-start text-2xs text-ink-3 underline-offset-4 hover:text-ink hover:underline"
          >
            کلیدهای هوش مصنوعی
          </button>
        ) : null}
      </div>
    </nav>
  );
}
