"use client";

/**
 * /shared/[token] — public, unauthenticated trip view.
 *
 * Thin wrapper around the shared `<TripView>` component. This route:
 *   - Fetches `SharedTripData` from the public endpoint (rate-limited by IP)
 *   - Adapts `SharedLocationSummary[]` → `Location[]` (filling missing fields
 *     with null — PII like `added_by_email` is intentionally not in the
 *     public shape)
 *   - Builds a lightweight `ReadOnlyItineraryState` from the returned
 *     itinerary snapshot (does NOT call `useItineraryState`, which hits
 *     authenticated endpoints)
 *   - Renders `<TripView readOnly canShare={false}>` wrapped in a
 *     `ReadOnlyProvider` so every nested component's `useReadOnly()` gates
 *     fire.
 *
 * Zero-drift guarantee: all trip-body JSX lives in `TripView.tsx`. Any future
 * UI change to the owner page automatically appears here with no edits to
 * this file.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  api,
  ApiError,
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryResponse,
  type Location,
  type SharedLocationSummary,
  type SharedTripData,
  type Trip,
} from "@/lib/api";
import { ReadOnlyProvider } from "@/lib/read-only-context";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { Globe } from "lucide-react";
import { TripView } from "@/features/trip-view";
import type { ReadOnlyItineraryState } from "@/features/itinerary/itinerary-state-types";
import { usePinHighlight } from "@/features/trip-view/usePinHighlight";
import {
  getSelectedOption,
  buildItineraryLocationMap,
  buildAvailableDays,
} from "@/lib/itinerary-derived";

/**
 * Adapt the narrow public location summary to the full `Location` shape
 * expected by `TripView`. PII fields stay null — this is the security
 * boundary; don't widen the public endpoint to fix a render concern.
 */
function toLocations(shared: SharedLocationSummary[]): Location[] {
  return shared.map((s) => ({
    ...s,
    google_place_id: null,
    added_by_user_id: null,
    added_by_email: null,
    created_at: null,
  }));
}

function toTrip(info: SharedTripData["trip"]): Trip {
  return {
    id: "shared",
    name: info.name,
    start_date: info.start_date ?? null,
    end_date: info.end_date ?? null,
  };
}

/**
 * Read-only itinerary state hook for the shared route.
 *
 * Returns only the `ReadOnlyItineraryState` slice — no mutation handlers,
 * no network I/O. The `itinerary` snapshot is provided by the shared
 * endpoint in one shot, so there's nothing to fetch.
 */
function useSharedItineraryReadState(
  itinerary: ItineraryResponse
): ReadOnlyItineraryState {
  // In the shared (public) view, option selection is read-only: the viewer
  // sees whatever `active_option_id` the owner currently has persisted on
  // each day, and `selectOption` is a no-op because there's no writable
  // session. This keeps the zero-drift contract with `TripView` — the
  // component signature is identical, gating happens at the `useReadOnly()`
  // layer.
  const selectOption = useCallback((_dayId: string, _optionId: string) => {
    // intentional no-op: shared viewers cannot mutate the owner's selection
  }, []);

  const getSelectedOptionCallback = useCallback(
    (day: ItineraryDay): ItineraryOption | undefined => getSelectedOption(day),
    []
  );

  const itineraryLocationMap = useMemo(
    () => buildItineraryLocationMap(itinerary),
    [itinerary]
  );

  const availableDays = useMemo(
    () => buildAvailableDays(itinerary),
    [itinerary]
  );

  return {
    itinerary,
    itineraryLoading: false,
    itineraryError: null,
    itineraryActionError: null,
    addDayLoading: false,
    generateDaysLoading: false,
    createOptionLoading: null,
    calculatingRouteId: null,
    routeMetricsError: {},
    itineraryLocationMap,
    availableDays,
    fetchItinerary: async () => {},
    clearItineraryActionError: () => {},
    selectOption,
    getSelectedOption: getSelectedOptionCallback,
  };
}

export default function SharedTripPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<SharedTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSharedTrip() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.sharing.getSharedTrip(token);
        setData(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("This shared link is no longer valid.");
        } else {
          setError("Failed to load shared trip.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSharedTrip();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Globe size={48} className="text-muted-foreground/40" />
        <h1 className="text-xl font-bold text-foreground">
          {error ?? "Trip not found"}
        </h1>
        <p className="text-sm text-muted-foreground">
          The link may have expired or been revoked by the trip owner.
        </p>
      </div>
    );
  }

  return (
    <ReadOnlyProvider value={true}>
      <SharedTripContent data={data} />
    </ReadOnlyProvider>
  );
}

function SharedTripContent({ data }: { data: SharedTripData }) {
  const trip = useMemo(() => toTrip(data.trip), [data.trip]);
  const locations = useMemo(
    () => toLocations(data.locations),
    [data.locations]
  );
  const itineraryState = useSharedItineraryReadState(data.itinerary);

  // Map ↔ card interactions are pure UI (no data mutations), so they run in
  // shared mode too. Card click → focus the sidebar map on that location.
  // Pin click → scroll the card into view and briefly highlight it.
  const [focusedLocation, setFocusedLocation] = useState<{
    id: string;
    seq: number;
  } | null>(null);
  const focusSeqRef = useRef(0);

  // Highlight logic is shared with the owner route via usePinHighlight.
  const { highlightedLocationId, handlePinClick } = usePinHighlight();

  const handleCardClick = useCallback((locationId: string) => {
    focusSeqRef.current += 1;
    setFocusedLocation({ id: locationId, seq: focusSeqRef.current });
  }, []);

  return (
    <TripView
      trip={trip}
      tripId={trip.id}
      locations={locations}
      itineraryState={itineraryState}
      readOnly={true}
      canShare={false}
      focusedLocation={focusedLocation}
      highlightedLocationId={highlightedLocationId}
      onCardClick={handleCardClick}
      onMapPinClick={handlePinClick}
    />
  );
}
