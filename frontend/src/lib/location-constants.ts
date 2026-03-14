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

export const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export type CategoryKey = (typeof CATEGORY_OPTIONS)[number];

export const CATEGORY_META: Record<
  CategoryKey,
  { icon: string; bg: string; text: string }
> = {
  Museum: { icon: "Landmark", bg: "bg-slate-100", text: "text-slate-700" },
  Restaurant: {
    icon: "UtensilsCrossed",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
  Café: { icon: "Coffee", bg: "bg-amber-50", text: "text-amber-700" },
  Bar: { icon: "Wine", bg: "bg-purple-50", text: "text-purple-700" },
  "Walking around": {
    icon: "Footprints",
    bg: "bg-teal-50",
    text: "text-teal-700",
  },
  Excursion: {
    icon: "Compass",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  Accommodation: { icon: "Bed", bg: "bg-blue-50", text: "text-blue-700" },
  Transport: {
    icon: "TrainFront",
    bg: "bg-slate-100",
    text: "text-slate-700",
  },
  Shopping: { icon: "ShoppingBag", bg: "bg-blue-50", text: "text-blue-700" },
  "Park / nature": {
    icon: "TreePine",
    bg: "bg-green-50",
    text: "text-green-700",
  },
  Beach: { icon: "Umbrella", bg: "bg-cyan-50", text: "text-cyan-700" },
  Viewpoint: { icon: "Eye", bg: "bg-violet-50", text: "text-violet-700" },
  Event: { icon: "PartyPopper", bg: "bg-rose-50", text: "text-rose-700" },
  Other: { icon: "MapPin", bg: "bg-gray-50", text: "text-gray-600" },
};
