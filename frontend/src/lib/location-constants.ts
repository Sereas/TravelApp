export const REQUIRES_BOOKING_OPTIONS = [
  { value: "", label: "—" },
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "yes_done", label: "Yes (done)" },
] as const;

export const CATEGORY_OPTIONS = [
  "Accommodation",
  "Bar",
  "Beach",
  "Café",
  "Church",
  "City",
  "Event",
  "Excursion",
  "Hiking",
  "Historic site",
  "Market",
  "Museum",
  "Nature",
  "Nightlife",
  "Park",
  "Parking",
  "Restaurant",
  "Shopping",
  "Spa / Wellness",
  "Transport",
  "Viewpoint",
  "Walking around",
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
  {
    icon: string;
    bg: string;
    text: string;
    gradient: string;
    hexBg: string;
    hexText: string;
  }
> = {
  Museum: {
    icon: "Landmark",
    bg: "bg-slate-100",
    text: "text-slate-700",
    gradient: "from-slate-200 to-slate-100",
    hexBg: "#f1f5f9",
    hexText: "#334155",
  },
  Restaurant: {
    icon: "UtensilsCrossed",
    bg: "bg-orange-50",
    text: "text-orange-700",
    gradient: "from-orange-100 to-orange-50",
    hexBg: "#fff7ed",
    hexText: "#c2410c",
  },
  Café: {
    icon: "Coffee",
    bg: "bg-amber-50",
    text: "text-amber-700",
    gradient: "from-amber-100 to-amber-50",
    hexBg: "#fffbeb",
    hexText: "#b45309",
  },
  Bar: {
    icon: "Wine",
    bg: "bg-purple-50",
    text: "text-purple-700",
    gradient: "from-purple-100 to-purple-50",
    hexBg: "#faf5ff",
    hexText: "#7e22ce",
  },
  "Walking around": {
    icon: "Footprints",
    bg: "bg-teal-50",
    text: "text-teal-700",
    gradient: "from-teal-100 to-teal-50",
    hexBg: "#f0fdfa",
    hexText: "#0f766e",
  },
  Excursion: {
    icon: "Compass",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    gradient: "from-emerald-100 to-emerald-50",
    hexBg: "#ecfdf5",
    hexText: "#047857",
  },
  Accommodation: {
    icon: "Bed",
    bg: "bg-blue-50",
    text: "text-blue-700",
    gradient: "from-blue-100 to-blue-50",
    hexBg: "#eff6ff",
    hexText: "#1d4ed8",
  },
  Transport: {
    icon: "TrainFront",
    bg: "bg-slate-100",
    text: "text-slate-700",
    gradient: "from-slate-200 to-slate-100",
    hexBg: "#f1f5f9",
    hexText: "#334155",
  },
  Shopping: {
    icon: "ShoppingBag",
    bg: "bg-blue-50",
    text: "text-blue-700",
    gradient: "from-blue-100 to-blue-50",
    hexBg: "#eff6ff",
    hexText: "#1d4ed8",
  },
  Park: {
    icon: "TreePine",
    bg: "bg-green-50",
    text: "text-green-700",
    gradient: "from-green-100 to-green-50",
    hexBg: "#f0fdf4",
    hexText: "#15803d",
  },
  Parking: {
    icon: "CircleParking",
    bg: "bg-slate-50",
    text: "text-slate-600",
    gradient: "from-slate-100 to-slate-50",
    hexBg: "#f8fafc",
    hexText: "#475569",
  },
  Nature: {
    icon: "Mountain",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    gradient: "from-emerald-100 to-emerald-50",
    hexBg: "#ecfdf5",
    hexText: "#047857",
  },
  Beach: {
    icon: "Umbrella",
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    gradient: "from-cyan-100 to-cyan-50",
    hexBg: "#ecfeff",
    hexText: "#0e7490",
  },
  Viewpoint: {
    icon: "Eye",
    bg: "bg-violet-50",
    text: "text-violet-700",
    gradient: "from-violet-100 to-violet-50",
    hexBg: "#f5f3ff",
    hexText: "#6d28d9",
  },
  Event: {
    icon: "PartyPopper",
    bg: "bg-rose-50",
    text: "text-rose-700",
    gradient: "from-rose-100 to-rose-50",
    hexBg: "#fff1f2",
    hexText: "#be123c",
  },
  Church: {
    icon: "Church",
    bg: "bg-stone-50",
    text: "text-stone-700",
    gradient: "from-stone-100 to-stone-50",
    hexBg: "#fafaf9",
    hexText: "#44403c",
  },
  City: {
    icon: "Building2",
    bg: "bg-zinc-50",
    text: "text-zinc-700",
    gradient: "from-zinc-100 to-zinc-50",
    hexBg: "#fafafa",
    hexText: "#3f3f46",
  },
  Hiking: {
    icon: "MountainSnow",
    bg: "bg-lime-50",
    text: "text-lime-700",
    gradient: "from-lime-100 to-lime-50",
    hexBg: "#f7fee7",
    hexText: "#4d7c0f",
  },
  "Historic site": {
    icon: "Castle",
    bg: "bg-amber-100",
    text: "text-amber-800",
    gradient: "from-amber-200 to-amber-100",
    hexBg: "#fef3c7",
    hexText: "#92400e",
  },
  Market: {
    icon: "Store",
    bg: "bg-orange-50",
    text: "text-orange-600",
    gradient: "from-orange-100 to-orange-50",
    hexBg: "#fff7ed",
    hexText: "#ea580c",
  },
  Nightlife: {
    icon: "Music",
    bg: "bg-fuchsia-50",
    text: "text-fuchsia-700",
    gradient: "from-fuchsia-100 to-fuchsia-50",
    hexBg: "#fdf4ff",
    hexText: "#a21caf",
  },
  "Spa / Wellness": {
    icon: "Sparkles",
    bg: "bg-sky-50",
    text: "text-sky-700",
    gradient: "from-sky-100 to-sky-50",
    hexBg: "#f0f9ff",
    hexText: "#0369a1",
  },
  Other: {
    icon: "MapPin",
    bg: "bg-gray-50",
    text: "text-gray-600",
    gradient: "from-gray-100 to-gray-50",
    hexBg: "#f9fafb",
    hexText: "#4b5563",
  },
};
