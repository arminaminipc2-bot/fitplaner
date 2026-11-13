import { ChartLine, Dumbbell, House, Sparkles, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  key: "home" | "workouts" | "nutrition" | "progress" | "chat";
};

/**
 * The bottom navigation bar destinations, ordered strictly according to RTL ergonomics:
 * 1. خانه (Home) - rightmost
 * 2. تمرینات (Workouts)
 * 3. غذاها (Meals/Nutrition) - center
 * 4. پیشرفت (Progress)
 * 5. دستیارها (AI Assistants) - leftmost before the quick-add (+) action
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "خانه", icon: House, key: "home" },
  { to: "/workouts", label: "تمرینات", icon: Dumbbell, key: "workouts" },
  { to: "/nutrition", label: "غذاها", icon: UtensilsCrossed, key: "nutrition" },
  { to: "/progress", label: "پیشرفت", icon: ChartLine, key: "progress" },
  { to: "/chat", label: "دستیارها", icon: Sparkles, key: "chat" },
];
