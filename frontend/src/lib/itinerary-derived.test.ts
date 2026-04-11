/**
 * Phase 0 — placeholder tests for itinerary-derived helper functions.
 *
 * The helpers do not exist yet. These cases will be flipped from `it.todo`
 * to full implementations in Phase 2 once the module is created at
 * `frontend/src/lib/itinerary-derived.ts`.
 *
 * Expected helpers (to be implemented in Phase 2):
 *
 *   getSelectedOption(day, selectionMap) → ItineraryOption | undefined
 *     - Returns the option pointed to by the active selection pointer.
 *     - Falls back to the option with option_index === 1 (main plan).
 *     - Falls back further to the first option when no main plan exists.
 *
 *   buildItineraryLocationMap(itinerary) → Map<locationId, ScheduledInfo>
 *     - Deduplicates by location_id (same location in multiple options appears once).
 *     - Attaches a human-readable dayLabel (date string or "Day N").
 *
 *   buildAvailableDays(itinerary) → AvailableDay[]
 *     - Uses the ISO date when the day has one, otherwise a numeric day index.
 */

import { describe, it } from "vitest";

describe("getSelectedOption", () => {
  it.todo("getSelectedOption uses active pointer when set");
  it.todo("getSelectedOption falls back to main option (option_index 1)");
  it.todo("getSelectedOption falls back to first when no main");
});

describe("buildItineraryLocationMap", () => {
  it.todo("buildItineraryLocationMap dedupes by location_id");
  it.todo("buildItineraryLocationMap uses dayLabel or sort_order");
});

describe("buildAvailableDays", () => {
  it.todo("buildAvailableDays uses iso date or day index");
});
