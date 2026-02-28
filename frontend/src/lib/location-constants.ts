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
