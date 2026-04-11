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

  const getSelectedOption = useCallback(
    (day: ItineraryDay): ItineraryOption | undefined => {
      // Mirror the authenticated `useItineraryState.getSelectedOption`:
      // server-persisted `active_option_id` wins, then Main, then first.
      if (day.active_option_id) {
        const active = day.options.find((o) => o.id === day.active_option_id);
        if (active) return active;
      }
      return day.options.find((o) => o.option_index === 1) ?? day.options[0];
    },
    []
  );

  const itineraryLocationMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const day of itinerary.days) {
      const dayLabel = day.date
        ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : `Day ${day.sort_order + 1}`;
      for (const option of day.options) {
        for (const loc of option.locations) {
          const existing = map.get(loc.location_id);
          if (existing) {
            if (!existing.includes(dayLabel)) existing.push(dayLabel);
          } else {
            map.set(loc.location_id, [dayLabel]);
          }
        }
      }
    }
    return map;
  }, [itinerary]);

  const availableDays = useMemo(
    () =>
      itinerary.days.map((d, i) => ({
        id: d.id,
        label: d.date
          ? new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : `Day ${i + 1}`,
      })),
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
    getSelectedOption,
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

// Sidebar pin click → scroll-to-card + highlight-pulse timing. Matches the
// owner route's timings so both views feel identical.
const HIGHLIGHT_START_DELAY_MS = 350;
const HIGHLIGHT_ANIMATION_MS = 2000;

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
  const [highlightedLocationId, setHighlightedLocationId] = useState<
    string | null
  >(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleCardClick = useCallback((locationId: string) => {
    focusSeqRef.current += 1;
    setFocusedLocation({ id: locationId, seq: focusSeqRef.current });
  }, []);

  const handlePinClick = useCallback((locationId: string) => {
    if (highlightTimeoutRef.current != null) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedLocationId(null);

    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-location-id="${CSS.escape(locationId)}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedLocationId(locationId);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedLocationId((prev) => (prev === locationId ? null : prev));
        highlightTimeoutRef.current = null;
      }, HIGHLIGHT_ANIMATION_MS);
    }, HIGHLIGHT_START_DELAY_MS);
  }, []);

  // Cancel any pending highlight timeout on unmount.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current != null) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
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
