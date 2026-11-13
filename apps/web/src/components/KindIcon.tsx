import { Dumbbell, Gauge, HeartPulse, Moon, Coffee, Trophy, Volleyball } from "lucide-react";
import type { WorkoutKind } from "../lib/domain";

const KIND = {
  strength: Dumbbell,
  cardio: HeartPulse,
  football: Volleyball,
  speed: Gauge,
  recovery: Moon,
  rest: Coffee,
  match: Trophy,
} as const;

export function KindIcon({
  kind,
  size = 16,
  className,
}: {
  kind: WorkoutKind;
  size?: number;
  className?: string;
}) {
  const Icon = KIND[kind];
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}
