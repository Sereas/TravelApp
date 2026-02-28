import {
  Landmark,
  UtensilsCrossed,
  Coffee,
  Wine,
  Footprints,
  Compass,
  Bed,
  TrainFront,
  ShoppingBag,
  TreePine,
  Umbrella,
  Eye,
  PartyPopper,
  MapPin,
  type LucideProps,
} from "lucide-react";
import type { CategoryKey } from "@/lib/location-constants";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Landmark,
  UtensilsCrossed,
  Coffee,
  Wine,
  Footprints,
  Compass,
  Bed,
  TrainFront,
  ShoppingBag,
  TreePine,
  Umbrella,
  Eye,
  PartyPopper,
  MapPin,
};

import { CATEGORY_META } from "@/lib/location-constants";

interface CategoryIconProps {
  category: CategoryKey;
  size?: number;
  className?: string;
}

export function CategoryIcon({
  category,
  size = 16,
  className,
}: CategoryIconProps) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const Icon = ICON_MAP[meta.icon] ?? MapPin;
  return <Icon size={size} className={className ?? meta.text} />;
}
