import { useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Droplets,
  Dumbbell,
  MessageCircle,
  Plus,
  Scale,
  Settings,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileBottomNavigation } from "./MobileBottomNavigation";
import { IconButton, cx } from "./ui";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/useMediaQuery";

export type QuickAction = "meal" | "food-photo" | "weight" | "workout" | "water" | "ask-ai";

const QUICK: ReadonlyArray<{ id: QuickAction; label: string; icon: typeof Plus }> = [
  { id: "meal", label: "افزودن وعده", icon: Plus },
  { id: "food-photo", label: "تحلیل تصویر غذا", icon: Sparkles },
  { id: "weight", label: "ثبت وزن", icon: Scale },
  { id: "workout", label: "افزودن تمرین", icon: Dumbbell },
  { id: "water", label: "ثبت آب", icon: Droplets },
  { id: "ask-ai", label: "پرسش از دستیار", icon: MessageCircle },
];

/**
 * The single application frame: header, scrolling content, and exactly one
 * navigation surface — tab bar under 1080, persistent sidebar at and above it.
 */
export function AppShell({
  userName,
  onQuickAction,
  onOpenSettings,
}: {
  userName?: string;
  onQuickAction?: (action: QuickAction) => void;
  onOpenSettings?: () => void;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [collapsed, setCollapsed] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const tab = new URLSearchParams(search).get("tab");
  let title = "فیت‌پلنر";
  if (pathname === "/") title = "خانه";
  else if (pathname === "/workouts") title = "برنامه تمرینات";
  else if (pathname === "/nutrition") title = "برنامه غذا و تغذیه";
  else if (pathname === "/plan") title = tab === "nutrition" ? "برنامه غذا و تغذیه" : "برنامه تمرینات";
  else if (pathname === "/progress") title = "پیشرفت و روند";
  else if (pathname === "/chat") title = "دستیارهای هوش مصنوعی";
  else if (pathname === "/profile") title = "پروفایل کاربری";
  else if (pathname === "/settings") title = "تنظیمات";
  else if (pathname === "/gallery") title = "گالری کامپوننت‌ها";

  /** The bar's plus never invents an action: it opens the real sheet at every width. */
  const handleQuick = (id: QuickAction) => {
    setQuickOpen(false);
    if (onQuickAction) {
      onQuickAction(id);
      return;
    }
    if (id === "ask-ai") navigate("/chat");
    else if (id === "weight") navigate("/progress");
    else if (id === "workout") navigate("/workouts");
    else if (id === "meal" || id === "food-photo") navigate("/nutrition");
    else navigate("/", { state: { quick: id } });
  };

  return (
    <div className="flex min-h-dvh bg-canvas">
      <DesktopSidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        onOpenSettings={onOpenSettings}
        userName={userName}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cx(
            "sticky top-0 z-20 border-b border-divider bg-canvas/90 backdrop-blur",
            "pt-[env(safe-area-inset-top)]",
            desktop ? "px-7" : "px-4",
          )}
        >
          <div className={cx("mx-auto flex h-14 items-center gap-3", desktop ? "max-w-[1040px]" : "max-w-[640px]")}>
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>

            <span className="hidden desktop:inline-flex">
              <IconButton label="افزودن سریع" onClick={() => setQuickOpen(true)}>
                <Plus size={18} strokeWidth={2} aria-hidden />
              </IconButton>
            </span>
            <IconButton label="پروفایل" onClick={() => navigate("/profile")}>
              <User size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
            <IconButton label="تنظیمات" onClick={() => navigate("/settings")}>
              <Settings size={18} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </div>
        </header>

        <main
          id="main"
          className={cx(
            // the tab bar is fixed, so content needs its exact height as bottom
            // padding or the last card hides behind it
            "flex-1 pb-28 desktop:pb-8",
            desktop ? "px-7" : "px-4",
          )}
        >
          <div className={cx("mx-auto w-full", desktop ? "max-w-[1040px]" : "max-w-[640px]")}>
            <Outlet />
          </div>
        </main>
      </div>

      {desktop ? null : <MobileBottomNavigation onQuickAdd={() => setQuickOpen(true)} />}

      {quickOpen ? <QuickAddSheet onClose={() => setQuickOpen(false)} onPick={handleQuick} /> : null}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
function QuickAddSheet({
  onClose,
  onPick,
  children,
}: {
  onClose: () => void;
  onPick: (id: QuickAction) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-canvas/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-title"
        className="w-full max-w-lg animate-rise rounded-t-[32px] border border-white/10 bg-card-2/85 p-5 shadow-pop backdrop-blur-2xl backdrop-saturate-150 sm:rounded-[32px]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="quick-title" className="text-lg font-bold">
            افزودن سریع
          </h2>
          <IconButton label="بستن" size="sm" onClick={onClose}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {QUICK.map((q) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onPick(q.id)}
                className="flex min-h-16 w-full items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-start text-sm text-ink-2 transition-all duration-150 active:scale-95 hover:border-white/20 hover:bg-white/[0.07] hover:text-ink"
              >
                <q.icon size={17} strokeWidth={1.75} className="shrink-0" aria-hidden />
                <span className="min-w-0">{q.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </div>
  );
}
