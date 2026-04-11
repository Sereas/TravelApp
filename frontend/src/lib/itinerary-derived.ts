/**
 * Pure itinerary-derived helpers — no React imports.
 *
 * These functions were previously inlined in three places:
 *   - `useItineraryState.ts` (getSelectedOption, itineraryLocationMap, availableDays)
 *   - `shared/[token]/page.tsx` → `useSharedItineraryReadState` (same three)
 *
 * Both sites now import from here. The zero-drift invariant is enforced at
 * the source level: one implementation, two consumers.
 *
 * Label semantics (match both previous inline sites):
 *   - Day with a date: `new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })`
 *   - Day without a date:
 *     - `buildItineraryLocationMap` uses `sort_order + 1` (matches `useItineraryState`)
 *     - `buildAvailableDays` uses array index + 1 (matches both inline sites)
 */

import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryResponse,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// getSelectedOption
// ---------------------------------------------------------------------------

/**
 * Returns the currently-selected option for a given day.
 *
 * Priority:
 *   1. `day.active_option_id` — server-persisted pointer (survives refresh,
 *      shared between authenticated and shared views).
 *   2. The option with `option_index === 1` ("Main" plan).
 *   3. The first option in the array (emergency fallback).
 *   4. `undefined` when the day has no options.
 *
 * The stale-pointer case (active_option_id references a deleted option) falls
 * through to step 2 just as the previous inline implementations did.
 */
export function getSelectedOption(
  day: ItineraryDay
): ItineraryOption | undefined {
  if (day.active_option_id) {
    const active = day.options.find((o) => o.id === day.active_option_id);
    if (active) return active;
  }
  return (
    day.options.find((option) => option.option_index === 1) ?? day.options[0]
  );
}

// ---------------------------------------------------------------------------
// buildItineraryLocationMap
// ---------------------------------------------------------------------------

/**
 * Builds a map from `location_id` → list of day labels (human-readable).
 *
 * A location that appears in multiple options on the SAME day is deduplicated:
 * the day label appears only once. A location that appears on multiple
 * different days will have multiple entries.
 *
 * Day label:
 *   - With date: `toLocaleDateString("en-US", { month: "short", day: "numeric" })`
 *   - Without: `Day ${sort_order + 1}` (matches `useItineraryState` behaviour)
 */
export function buildItineraryLocationMap(
  itinerary: ItineraryResponse
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const day of itinerary.days) {
    const dayLabel = day.date
      ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : `Day ${day.sort_order + 1}`;

    for (const option of day.options) {
      for (const optionLocation of option.locations) {
        const existing = map.get(optionLocation.location_id);
        if (existing) {
          if (!existing.includes(dayLabel)) existing.push(dayLabel);
        } else {
          map.set(optionLocation.location_id, [dayLabel]);
        }
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// buildAvailableDays
// ---------------------------------------------------------------------------

/**
 * Returns an ordered list of `{ id, label }` for all days in the itinerary.
 *
 * Day label:
 *   - With date: `toLocaleDateString("en-US", { month: "short", day: "numeric" })`
 *   - Without: `Day ${index + 1}` where `index` is the array position
 *     (matches both `useItineraryState` and `shared/[token]/page.tsx`).
 */
export function buildAvailableDays(
  itinerary: ItineraryResponse
): Array<{ id: string; label: string }> {
  return itinerary.days.map((day, index) => ({
    id: day.id,
    label: day.date
      ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : `Day ${index + 1}`,
  }));
}
