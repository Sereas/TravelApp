/**
 * Pure itinerary mutation helpers.
 *
 * These are zero-React, zero-async, zero-side-effect reducer functions.
 * Each accepts an ItineraryResponse + identifiers + an updater function,
 * and returns a new ItineraryResponse without mutating the input.
 *
 * Unchanged day / option / location references are preserved so downstream
 * memoization (useMemo, React.memo) can skip reconciliation work.
 */

import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryOptionLocation,
  ItineraryResponse,
  Location,
  LocationSummary,
} from "@/lib/api";

/**
 * Return a new itinerary where the day matching `dayId` has been replaced by
 * `updater(day)`. All other days keep the same object reference.
 * If `dayId` is not found the input is returned unchanged.
 */
export function mutateDay(
  itinerary: ItineraryResponse,
  dayId: string,
  updater: (day: ItineraryDay) => ItineraryDay
): ItineraryResponse {
  return {
    ...itinerary,
    days: itinerary.days.map((day) => (day.id === dayId ? updater(day) : day)),
  };
}

/**
 * Return a new itinerary where the option matching `optionId` inside the day
 * matching `dayId` has been replaced by `updater(option)`.
 * Unchanged days and options keep the same object reference.
 * If either id is not found the input is returned unchanged.
 */
export function mutateOption(
  itinerary: ItineraryResponse,
  dayId: string,
  optionId: string,
  updater: (option: ItineraryOption) => ItineraryOption
): ItineraryResponse {
  return mutateDay(itinerary, dayId, (day) => ({
    ...day,
    options: day.options.map((option) =>
      option.id === optionId ? updater(option) : option
    ),
  }));
}

/**
 * Return a new itinerary where the option-location matching `olId` inside
 * `optionId` / `dayId` has been replaced by `updater(ol)`.
 * Unchanged references are preserved throughout.
 * If any id is not found the input is returned unchanged.
 */
export function mutateOptionLocation(
  itinerary: ItineraryResponse,
  dayId: string,
  optionId: string,
  olId: string,
  updater: (ol: ItineraryOptionLocation) => ItineraryOptionLocation
): ItineraryResponse {
  return mutateOption(itinerary, dayId, optionId, (option) => ({
    ...option,
    locations: option.locations.map((ol) =>
      ol.id === olId ? updater(ol) : ol
    ),
  }));
}

/**
 * Return a new itinerary with the option-location `olId` removed from the
 * option `optionId` in day `dayId`.
 * If any id is not found the input is returned unchanged (no-op, no throw).
 */
export function removeOptionLocation(
  itinerary: ItineraryResponse,
  dayId: string,
  optionId: string,
  olId: string
): ItineraryResponse {
  return mutateOption(itinerary, dayId, optionId, (option) => ({
    ...option,
    locations: option.locations.filter((ol) => ol.id !== olId),
  }));
}

/**
 * Return a new itinerary with `ol` appended to the locations of the option
 * `optionId` in day `dayId`.
 * If either `dayId` or `optionId` is not found the input is returned
 * unchanged (no-op, no throw).
 */
export function addOptionLocation(
  itinerary: ItineraryResponse,
  dayId: string,
  optionId: string,
  ol: ItineraryOptionLocation
): ItineraryResponse {
  return mutateOption(itinerary, dayId, optionId, (option) => ({
    ...option,
    locations: [...option.locations, ol],
  }));
}

/**
 * Build a `LocationSummary` from a full `Location` object.
 * Used when building optimistic option-location entries for the itinerary tree.
 */
export function locationSummaryFromLocation(loc: Location): LocationSummary {
  return {
    id: loc.id,
    name: loc.name,
    city: loc.city,
    address: loc.address,
    google_link: loc.google_link,
    category: loc.category,
    note: loc.note,
    working_hours: loc.working_hours,
    useful_link: loc.useful_link,
    requires_booking: loc.requires_booking,
    latitude: loc.latitude,
    longitude: loc.longitude,
    image_url: loc.image_url,
    user_image_url: loc.user_image_url,
    attribution_name: loc.attribution_name,
    attribution_uri: loc.attribution_uri,
  };
}

/**
 * Build a placeholder `LocationSummary` for an optimistic entry where the full
 * location data isn't available yet.
 */
export function locationSummaryPlaceholder(
  locationId: string
): LocationSummary {
  return {
    id: locationId,
    name: "Loading...",
    city: null,
    address: null,
    google_link: null,
    category: null,
    note: null,
    working_hours: null,
    useful_link: null,
    requires_booking: null,
    latitude: null,
    longitude: null,
    image_url: null,
    user_image_url: null,
    attribution_name: null,
    attribution_uri: null,
  };
}
