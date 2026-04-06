import {
  Bed,
  Building2,
  Castle,
  Church,
  CircleParking,
  Coffee,
  Compass,
  Eye,
  Footprints,
  Landmark,
  MapPin,
  Mountain,
  MountainSnow,
  Music,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Store,
  TrainFront,
  TreePine,
  Umbrella,
  UtensilsCrossed,
  Wine,
  type LucideProps,
} from "lucide-react";
import type { CategoryKey } from "@/lib/location-constants";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Bed,
  Building2,
  Castle,
  Church,
  CircleParking,
  Coffee,
  Compass,
  Eye,
  Footprints,
  Landmark,
  MapPin,
  Mountain,
  MountainSnow,
  Music,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Store,
  TrainFront,
  TreePine,
  Umbrella,
  UtensilsCrossed,
  Wine,
};

import { CATEGORY_META } from "@/lib/location-constants";

interface CategoryIconProps {
  category: CategoryKey;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CategoryIcon({
  category,
  size = 16,
  className,
  style,
}: CategoryIconProps) {
  const meta = CATEGORY_META[category];
  if (!meta) return null;
  const Icon = ICON_MAP[meta.icon] ?? MapPin;
  return <Icon size={size} className={className ?? meta.text} style={style} />;
}
