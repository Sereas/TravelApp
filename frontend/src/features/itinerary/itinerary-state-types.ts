/**
 * Split interface for `useItineraryState`: read-path vs mutation-path.
 *
 * Why: the shared trip page (`/shared/[token]`) must render the same
 * `ItineraryTab` as the owner page (`/trips/[id]`) but without any ability
 * to fire mutations. Passing a fake object with 20 no-op handlers (the
 * previous approach) silently drifts every time a new handler is added.
 *
 * Solution: `ItineraryTab` accepts two props —
 *   - `itineraryState: ReadOnlyItineraryState` — always required
 *   - `itineraryMutations?: ItineraryMutations` — only passed in edit mode
 *
 * `useItineraryState`'s return type is typed as
 * `ReadOnlyItineraryState & ItineraryMutations`, so adding a new member to
 * the hook without adding it to one of these interfaces is a compile error.
 * That gives us zero-drift enforcement at the type level.
 */

import type {
  ItineraryDay,
  ItineraryOption,
  ItineraryResponse,
  Location,
  RouteResponse,
} from "@/lib/api";

/** Read-only slice of the itinerary state — safe to render in any context. */
export interface ReadOnlyItineraryState {
  itinerary: ItineraryResponse | null;
  itineraryLoading: boolean;
  itineraryError: string | null;
  itineraryActionError: string | null;
  addDayLoading: boolean;
  generateDaysLoading: boolean;
  createOptionLoading: string | null;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  itineraryLocationMap: Map<string, string[]>;
  availableDays: { id: string; label: string }[];
  fetchItinerary: () => Promise<void>;
  clearItineraryActionError: () => void;
  selectOption: (dayId: string, optionId: string) => void;
  getSelectedOption: (day: ItineraryDay) => ItineraryOption | undefined;
}

/** Mutation handlers — only present in edit mode. */
export interface ItineraryMutations {
  handleAddDay: () => Promise<void>;
  handleGenerateDays: () => Promise<void>;
  handleUpdateDayDate: (
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) => void;
  handleCreateAlternative: (
    dayId: string,
    name?: string
  ) => Promise<string | null>;
  handleDeleteOption: (dayId: string, optionId: string) => void;
  handleSaveOptionDetails: (
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) => void;
  handleAddLocationsToOption: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => Promise<void>;
  handleRemoveLocationFromOption: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
  handleUpdateLocationTimePeriod: (
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) => void;
  handleReorderOptionLocations: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => void;
  handleRouteCreated: (
    dayId: string,
    optionId: string,
    routeResponse: RouteResponse
  ) => Promise<void>;
  handleRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => Promise<void>;
  handleScheduleLocationToDay: (
    locationId: string,
    dayId: string
  ) => Promise<void>;
}

/**
 * The full itinerary state — what `useItineraryState()` returns.
 *
 * Defined here (rather than inferring via `ReturnType<typeof useItineraryState>`)
 * so the hook must explicitly satisfy the split. If a new member is added to
 * the hook without being declared here, TypeScript fails the hook's return
 * annotation — not some silent `any` in the shared page.
 *
 * Note: extends both, plus any pass-through helpers that don't fit either
 * category (like `getOrphanedDays` and `syncLocationSummary`).
 */
export interface FullItineraryState
  extends ReadOnlyItineraryState, ItineraryMutations {
  getOrphanedDays: (newStart: string, newEnd: string) => ItineraryDay[];
  syncLocationSummary: (
    locationId: string,
    updater: (location: Location) => Partial<Location>
  ) => void;
}
