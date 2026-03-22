export const REQUIRES_BOOKING_OPTIONS = [
  { value: "", label: "—" },
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "yes_done", label: "Yes (done)" },
] as const;

export const CATEGORY_OPTIONS = [
  "Museum",
  "Restaurant",
  "Café",
  "Bar",
  "Walking around",
  "Excursion",
  "Accommodation",
  "Transport",
  "Shopping",
  "Park / nature",
  "Beach",
  "Viewpoint",
  "Event",
  "Other",
] as const;

export interface DayChoice {
  id: string;
  /** e.g. "May 15" or "Day 3" */
  label: string;
}

export type CategoryKey = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_META: Record<
  CategoryKey,
  { icon: string; bg: string; text: string; gradient: string }
> = {
  Museum: {
    icon: "Landmark",
    bg: "bg-slate-100",
    text: "text-slate-700",
    gradient: "from-slate-200 to-slate-100",
  },
  Restaurant: {
    icon: "UtensilsCrossed",
    bg: "bg-orange-50",
    text: "text-orange-700",
    gradient: "from-orange-100 to-orange-50",
  },
  Café: {
    icon: "Coffee",
    bg: "bg-amber-50",
    text: "text-amber-700",
    gradient: "from-amber-100 to-amber-50",
  },
  Bar: {
    icon: "Wine",
    bg: "bg-purple-50",
    text: "text-purple-700",
    gradient: "from-purple-100 to-purple-50",
  },
  "Walking around": {
    icon: "Footprints",
    bg: "bg-teal-50",
    text: "text-teal-700",
    gradient: "from-teal-100 to-teal-50",
  },
  Excursion: {
    icon: "Compass",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    gradient: "from-emerald-100 to-emerald-50",
  },
  Accommodation: {
    icon: "Bed",
    bg: "bg-blue-50",
    text: "text-blue-700",
    gradient: "from-blue-100 to-blue-50",
  },
  Transport: {
    icon: "TrainFront",
    bg: "bg-slate-100",
    text: "text-slate-700",
    gradient: "from-slate-200 to-slate-100",
  },
  Shopping: {
    icon: "ShoppingBag",
    bg: "bg-blue-50",
    text: "text-blue-700",
    gradient: "from-blue-100 to-blue-50",
  },
  "Park / nature": {
    icon: "TreePine",
    bg: "bg-green-50",
    text: "text-green-700",
    gradient: "from-green-100 to-green-50",
  },
  Beach: {
    icon: "Umbrella",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    gradient: "from-cyan-100 to-cyan-50",
  },
  Viewpoint: {
    icon: "Eye",
    bg: "bg-violet-50",
    text: "text-violet-700",
    gradient: "from-violet-100 to-violet-50",
  },
  Event: {
    icon: "PartyPopper",
    bg: "bg-rose-50",
    text: "text-rose-700",
    gradient: "from-rose-100 to-rose-50",
  },
  Other: {
    icon: "MapPin",
    bg: "bg-gray-50",
    text: "text-gray-600",
    gradient: "from-gray-100 to-gray-50",
  },
};
