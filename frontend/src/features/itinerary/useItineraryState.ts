"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryResponse,
  type Location,
  type RouteResponse,
  type RouteWithSegmentsResponse,
} from "@/lib/api";
import type { FullItineraryState } from "@/features/itinerary/itinerary-state-types";
import {
  getSelectedOption as _getSelectedOption,
  buildItineraryLocationMap,
  buildAvailableDays,
} from "@/lib/itinerary-derived";

interface UseItineraryStateParams {
  tripId: string;
  enabled: boolean;
  locations: Location[];
}

function patchRouteInItinerary(
  prev: ItineraryResponse,
  dayId: string,
  optionId: string,
  routeId: string,
  data: RouteWithSegmentsResponse
): ItineraryResponse {
  return {
    ...prev,
    days: prev.days.map((day) => {
      if (day.id !== dayId) return day;
      return {
        ...day,
        options: day.options.map((option) => {
          if (option.id !== optionId) return option;
          return {
            ...option,
            routes: option.routes.map((route) =>
              route.route_id === routeId
                ? {
                    ...route,
                    duration_seconds: data.duration_seconds,
                    distance_meters: data.distance_meters,
                    route_status: data.route_status,
                    segments: data.segments.map((segment) => ({
                      segment_order: segment.segment_order,
                      duration_seconds: segment.duration_seconds,
                      distance_meters: segment.distance_meters,
                      encoded_polyline: segment.encoded_polyline,
                    })),
                  }
                : route
            ),
          };
        }),
      };
    }),
  };
}

export function useItineraryState({
  tripId,
  enabled,
  locations,
}: UseItineraryStateParams): FullItineraryState {
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [addDayLoading, setAddDayLoading] = useState(false);
  const [generateDaysLoading, setGenerateDaysLoading] = useState(false);
  const [itineraryActionError, setItineraryActionError] = useState<
    string | null
  >(null);
  const [createOptionLoading, setCreateOptionLoading] = useState<string | null>(
    null
  );
  const [calculatingRouteId, setCalculatingRouteId] = useState<string | null>(
    null
  );
  const [routeMetricsError, setRouteMetricsError] = useState<
    Record<string, string>
  >({});
  const hasFetchedRef = useRef(false);
  const calculatingRouteIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchItinerary = useCallback(async () => {
    setItineraryError(null);
    if (!hasFetchedRef.current) setItineraryLoading(true);
    try {
      const data = await api.itinerary.get(tripId);
      setItinerary(data);

      // Auto-recalculate routes with missing segments (e.g. after a stop was
      // deleted and some segments were removed). Only fire once per route to
      // avoid loops — skip if we're already calculating.
      // Only trigger when segments is an explicit array (present in tree data)
      // but shorter than expected — not when segments is undefined.
      for (const day of data.days) {
        for (const option of day.options) {
          for (const route of option.routes ?? []) {
            const expectedSegments = route.option_location_ids.length - 1;
            const hasSegmentsArray = Array.isArray(route.segments);
            const actualSegments = hasSegmentsArray
              ? route.segments!.length
              : 0;
            if (
              expectedSegments > 0 &&
              hasSegmentsArray &&
              actualSegments < expectedSegments &&
              !calculatingRouteIdRef.current
            ) {
              // Trigger recalculation in the background
              void (async () => {
                calculatingRouteIdRef.current = route.route_id;
                setCalculatingRouteId(route.route_id);
                try {
                  const withSegments = await api.itinerary.getRouteWithSegments(
                    tripId,
                    day.id,
                    option.id,
                    route.route_id
                  );
                  setItinerary((prev) =>
                    prev
                      ? patchRouteInItinerary(
                          prev,
                          day.id,
                          option.id,
                          route.route_id,
                          withSegments
                        )
                      : prev
                  );
                } catch {
                  // Silently fail — user can retry manually
                } finally {
                  calculatingRouteIdRef.current = null;
                  setCalculatingRouteId(null);
                }
              })();
              return; // Only recalculate one route at a time
            }
          }
        }
      }
    } catch (err) {
      setItineraryError(
        err instanceof Error ? err.message : "Failed to load itinerary"
      );
    } finally {
      hasFetchedRef.current = true;
      setItineraryLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    hasFetchedRef.current = false;
    setItinerary(null);
    setItineraryError(null);
  }, [tripId]);

  useEffect(() => {
    if (!enabled) return;
    void fetchItinerary();
  }, [enabled, fetchItinerary]);

  const getSelectedOption = useCallback(
    (day: ItineraryDay): ItineraryOption | undefined => _getSelectedOption(day),
    []
  );

  const itineraryLocationMap = useMemo(
    () =>
      itinerary
        ? buildItineraryLocationMap(itinerary)
        : new Map<string, string[]>(),
    [itinerary]
  );

  const availableDays = useMemo(
    () => (itinerary ? buildAvailableDays(itinerary) : []),
    [itinerary]
  );

  const getOrphanedDays = useCallback(
    (newStart: string, newEnd: string): ItineraryDay[] => {
      if (!itinerary) return [];
      return itinerary.days.filter(
        (day) => day.date && (day.date < newStart || day.date > newEnd)
      );
    },
    [itinerary]
  );

  const selectOption = useCallback(
    (dayId: string, optionId: string) => {
      // Optimistically patch the itinerary tree so the switch is instant in
      // the UI, then persist to the server. On failure, roll back to the
      // previous `active_option_id` for this day and surface an error.
      //
      // We capture `previous` synchronously BEFORE calling `setItinerary` so
      // the rollback path doesn't rely on mutating a closure variable inside
      // an updater — under React StrictMode, updaters are invoked twice with
      // the same input, which is safe here but subtle. Capturing up-front
      // also side-steps any stale-closure risk from a concurrent refetch.
      const previous =
        itinerary?.days.find((day) => day.id === dayId)?.active_option_id ??
        null;
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) =>
            day.id === dayId ? { ...day, active_option_id: optionId } : day
          ),
        };
      });

      void (async () => {
        try {
          await api.itinerary.updateDay(tripId, dayId, {
            active_option_id: optionId,
          });
        } catch (err) {
          // Roll back to the previous pointer so the UI stays consistent
          // with server state.
          setItinerary((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              days: prev.days.map((day) =>
                day.id === dayId ? { ...day, active_option_id: previous } : day
              ),
            };
          });
          setItineraryActionError(
            err instanceof Error
              ? err.message
              : "Failed to save option selection"
          );
        }
      })();
    },
    [itinerary, tripId]
  );

  const clearItineraryActionError = useCallback(() => {
    setItineraryActionError(null);
  }, []);

  const handleAddDay = useCallback(async () => {
    setItineraryActionError(null);
    setAddDayLoading(true);
    try {
      await api.itinerary.createDay(tripId);
      await fetchItinerary();
    } catch (err) {
      setItineraryActionError(
        err instanceof Error ? err.message : "Failed to add day"
      );
    } finally {
      setAddDayLoading(false);
    }
  }, [fetchItinerary, tripId]);

  const handleGenerateDays = useCallback(async () => {
    setItineraryActionError(null);
    setGenerateDaysLoading(true);
    try {
      await api.itinerary.generateDays(tripId);
      await fetchItinerary();
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 409
      ) {
        setItineraryActionError(
          "Trip already has days. Cannot generate from dates."
        );
      } else {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to generate days"
        );
      }
    } finally {
      setGenerateDaysLoading(false);
    }
  }, [fetchItinerary, tripId]);

  const handleSaveOptionDetails = useCallback(
    async (
      dayId: string,
      optionId: string,
      updates: {
        starting_city?: string | null;
        ending_city?: string | null;
        created_by?: string | null;
      }
    ) => {
      if (
        !("starting_city" in updates) &&
        !("ending_city" in updates) &&
        !("created_by" in updates)
      ) {
        return;
      }

      setItineraryActionError(null);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  options: day.options.map((option) =>
                    option.id === optionId ? { ...option, ...updates } : option
                  ),
                }
              : day
          ),
        };
      });

      try {
        await api.itinerary.updateOption(tripId, dayId, optionId, updates);
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to update option details"
        );
        await fetchItinerary();
      }
    },
    [fetchItinerary, tripId]
  );

  const handleUpdateDayDate = useCallback(
    async (
      dayId: string,
      date: string | null,
      optionId: string | undefined
    ) => {
      setItineraryActionError(null);
      try {
        if (date && optionId) {
          await api.itinerary.reassignDayDate(tripId, dayId, date, optionId);
        } else {
          await api.itinerary.updateDay(tripId, dayId, { date });
        }
        await fetchItinerary();
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to update day date"
        );
      }
    },
    [fetchItinerary, tripId]
  );

  const handleCreateAlternative = useCallback(
    async (dayId: string, name?: string) => {
      setItineraryActionError(null);
      setCreateOptionLoading(dayId);
      const label = name?.trim() || undefined;
      try {
        let newOption = await api.itinerary.createOption(tripId, dayId, {
          created_by: label ?? null,
        });
        // If PostgREST omitted created_by in the insert payload, persist the label explicitly.
        if (label && !newOption.created_by) {
          newOption = await api.itinerary.updateOption(
            tripId,
            dayId,
            newOption.id,
            { created_by: label }
          );
        }
        setItinerary((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            days: prev.days.map((day) =>
              day.id === dayId
                ? {
                    ...day,
                    options: [
                      ...day.options,
                      {
                        id: newOption.id,
                        option_index: newOption.option_index,
                        starting_city: newOption.starting_city,
                        ending_city: newOption.ending_city,
                        created_by: newOption.created_by ?? label ?? null,
                        created_at: newOption.created_at,
                        locations: [],
                        routes: [],
                      },
                    ],
                  }
                : day
            ),
          };
        });
        return newOption.id;
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to create alternative"
        );
        await fetchItinerary();
        return null;
      } finally {
        setCreateOptionLoading(null);
      }
    },
    [fetchItinerary, tripId]
  );

  const handleDeleteOption = useCallback(
    async (dayId: string, optionId: string) => {
      setItineraryActionError(null);
      // Optimistically remove the option and, if it was the active pointer,
      // clear `active_option_id` so `getSelectedOption` falls back to Main
      // immediately. The DB mirrors this via the `ON DELETE SET NULL` FK on
      // `trip_days.active_option_id → day_options(option_id)` so the server
      // state converges without a second request.
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  active_option_id:
                    day.active_option_id === optionId
                      ? null
                      : day.active_option_id,
                  options: day.options.filter(
                    (option) => option.id !== optionId
                  ),
                }
              : day
          ),
        };
      });

      try {
        await api.itinerary.deleteOption(tripId, dayId, optionId);
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to delete alternative"
        );
        await fetchItinerary();
      }
    },
    [fetchItinerary, tripId]
  );

  const handleAddLocationsToOption = useCallback(
    async (dayId: string, optionId: string, locationIds: string[]) => {
      setItineraryActionError(null);
      const currentOption = itinerary?.days
        .find((day) => day.id === dayId)
        ?.options.find((option) => option.id === optionId);
      const maxSortOrder =
        currentOption && currentOption.locations.length > 0
          ? Math.max(
              ...currentOption.locations.map((location) => location.sort_order)
            )
          : -1;
      const startOrder = maxSortOrder + 1;
      const items = locationIds.map((locationId, index) => ({
        location_id: locationId,
        sort_order: startOrder + index,
        time_period: "morning" as const,
      }));

      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  options: day.options.map((option) => {
                    if (option.id !== optionId) return option;
                    const newLocations = locationIds.map(
                      (locationId, index) => {
                        const loc = locations.find((l) => l.id === locationId);
                        return {
                          id: crypto.randomUUID(),
                          location_id: locationId,
                          sort_order: startOrder + index,
                          time_period: "morning",
                          location: loc
                            ? {
                                id: loc.id,
                                name: loc.name,
                                city: loc.city,
                                address: loc.address,
                                google_link: loc.google_link,
                                category: loc.category,
                                note: loc.note,
                                working_hours: loc.working_hours,
                                requires_booking: loc.requires_booking,
                                latitude: loc.latitude,
                                longitude: loc.longitude,
                                image_url: loc.image_url,
                                user_image_url: loc.user_image_url,
                                attribution_name: loc.attribution_name,
                                attribution_uri: loc.attribution_uri,
                              }
                            : {
                                id: locationId,
                                name: "Loading...",
                                city: null,
                                address: null,
                                google_link: null,
                                category: null,
                                note: null,
                                working_hours: null,
                                requires_booking: null,
                                latitude: null,
                                longitude: null,
                                image_url: null,
                                user_image_url: null,
                                attribution_name: null,
                                attribution_uri: null,
                              },
                        };
                      }
                    );
                    return {
                      ...option,
                      locations: [...option.locations, ...newLocations],
                    };
                  }),
                }
              : day
          ),
        };
      });

      try {
        await api.itinerary.batchAddLocationsToOption(
          tripId,
          dayId,
          optionId,
          items
        );
        void fetchItinerary();
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to add locations"
        );
        await fetchItinerary();
        throw err;
      }
    },
    [fetchItinerary, itinerary, locations, tripId]
  );

  const handleRemoveLocationFromOption = useCallback(
    async (dayId: string, optionId: string, olId: string) => {
      setItineraryActionError(null);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) =>
            d.id === dayId
              ? {
                  ...d,
                  options: d.options.map((o) => {
                    if (o.id !== optionId) return o;
                    const nextLocations = o.locations.filter(
                      (location) => location.id !== olId
                    );
                    const nextRoutes =
                      o.routes.length > 0
                        ? (o.routes
                            .map((route) => {
                              const remainingIds =
                                route.option_location_ids.filter(
                                  (id) => id !== olId
                                );
                              if (remainingIds.length < 2) return null;
                              return {
                                ...route,
                                option_location_ids: remainingIds,
                              };
                            })
                            .filter(Boolean) as typeof o.routes)
                        : o.routes;
                    return {
                      ...o,
                      locations: nextLocations,
                      routes: nextRoutes,
                    };
                  }),
                }
              : d
          ),
        };
      });

      try {
        await api.itinerary.removeLocationFromOption(
          tripId,
          dayId,
          optionId,
          olId
        );
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to remove location"
        );
        await fetchItinerary();
      }
    },
    [fetchItinerary, itinerary, tripId]
  );

  const handleUpdateLocationTimePeriod = useCallback(
    async (
      dayId: string,
      optionId: string,
      olId: string,
      timePeriod: string
    ) => {
      setItineraryActionError(null);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) =>
            day.id === dayId
              ? {
                  ...day,
                  options: day.options.map((option) =>
                    option.id === optionId
                      ? {
                          ...option,
                          locations: option.locations.map((location) =>
                            location.id === olId
                              ? { ...location, time_period: timePeriod }
                              : location
                          ),
                        }
                      : option
                  ),
                }
              : day
          ),
        };
      });

      try {
        await api.itinerary.updateOptionLocation(
          tripId,
          dayId,
          optionId,
          olId,
          { time_period: timePeriod }
        );
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to update time of day"
        );
        await fetchItinerary();
      }
    },
    [fetchItinerary, tripId]
  );

  /**
   * Fire-and-forget helper: fetch route segments from the API and patch them
   * into local state.  Owns the `calculatingRouteId` lifecycle — sets it to
   * null in the finally block.  Silently guards against post-unmount state
   * updates via `isMountedRef`.
   *
   * Extracted so both `handleRouteCreated` and `handleRetryRouteMetrics` share
   * exactly the same background fetch logic.
   */
  const _fetchAndPatchRouteMetrics = useCallback(
    (dayId: string, optionId: string, routeId: string) => {
      void (async () => {
        try {
          const withSegments = await api.itinerary.getRouteWithSegments(
            tripId,
            dayId,
            optionId,
            routeId
          );
          if (!isMountedRef.current) return;
          setItinerary((prev) =>
            prev
              ? patchRouteInItinerary(
                  prev,
                  dayId,
                  optionId,
                  routeId,
                  withSegments
                )
              : prev
          );
        } catch (err) {
          if (!isMountedRef.current) return;
          setRouteMetricsError((prev) => ({
            ...prev,
            [routeId]:
              err instanceof Error
                ? err.message
                : "Could not calculate distance and duration",
          }));
        } finally {
          if (isMountedRef.current) {
            setCalculatingRouteId(null);
          }
        }
      })();
    },
    [tripId]
  );

  const handleRouteCreated = useCallback(
    async (dayId: string, optionId: string, routeResponse: RouteResponse) => {
      const routeId = routeResponse.route_id;
      setRouteMetricsError((prev) => {
        const next = { ...prev };
        delete next[routeId];
        return next;
      });
      setCalculatingRouteId(routeId);
      // Refresh the itinerary tree first (fast — single RPC, no Google calls).
      await fetchItinerary();
      // Kick off segment fetch in the background so the user isn't blocked.
      // `calculatingRouteId` stays set until the background fetch completes
      // (or fails) — the spinner stays visible, but the rest of the UI is
      // immediately interactive.
      _fetchAndPatchRouteMetrics(dayId, optionId, routeId);
    },
    [fetchItinerary, _fetchAndPatchRouteMetrics]
  );

  const handleRetryRouteMetrics = useCallback(
    (dayId: string, optionId: string, routeId: string) => {
      setRouteMetricsError((prev) => {
        const next = { ...prev };
        delete next[routeId];
        return next;
      });
      setCalculatingRouteId(routeId);
      _fetchAndPatchRouteMetrics(dayId, optionId, routeId);
    },
    [_fetchAndPatchRouteMetrics]
  );

  const handleReorderOptionLocations = useCallback(
    async (dayId: string, optionId: string, newOrderedOlIds: string[]) => {
      if (!itinerary) return;
      const day = itinerary.days.find((currentDay) => currentDay.id === dayId);
      const option = day?.options.find(
        (currentOption) => currentOption.id === optionId
      );
      if (!option) return;

      const locationByOlId = new Map(
        option.locations.map((location) => [location.id, location])
      );
      const reordered = newOrderedOlIds
        .map((olId, index) => {
          const location = locationByOlId.get(olId);
          return location ? { ...location, sort_order: index } : null;
        })
        .filter(Boolean) as typeof option.locations;
      if (reordered.length !== newOrderedOlIds.length) return;

      setItineraryActionError(null);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((currentDay) =>
            currentDay.id !== dayId
              ? currentDay
              : {
                  ...currentDay,
                  options: currentDay.options.map((currentOption) =>
                    currentOption.id !== optionId
                      ? currentOption
                      : { ...currentOption, locations: reordered }
                  ),
                }
          ),
        };
      });

      try {
        await api.itinerary.reorderOptionLocations(tripId, dayId, optionId, {
          ol_ids: newOrderedOlIds,
        });
      } catch (err) {
        setItineraryActionError(
          err instanceof Error ? err.message : "Failed to reorder locations"
        );
        await fetchItinerary();
      }
    },
    [fetchItinerary, itinerary, tripId]
  );

  const handleScheduleLocationToDay = useCallback(
    async (locationId: string, dayId: string) => {
      if (!itinerary) return;
      const day = itinerary.days.find((currentDay) => currentDay.id === dayId);
      if (!day) return;

      const location = locations.find(
        (currentLocation) => currentLocation.id === locationId
      );
      if (location) {
        setItinerary((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            days: prev.days.map((currentDay) => {
              if (currentDay.id !== dayId) return currentDay;
              const mainOption = currentDay.options.find(
                (option) => option.option_index === 1
              );
              if (!mainOption) return currentDay;
              return {
                ...currentDay,
                options: currentDay.options.map((option) =>
                  option.id === mainOption.id
                    ? {
                        ...option,
                        locations: [
                          ...option.locations,
                          {
                            id: crypto.randomUUID(),
                            location_id: locationId,
                            sort_order: option.locations.length,
                            time_period: "morning",
                            location: {
                              id: location.id,
                              name: location.name,
                              city: location.city,
                              address: location.address,
                              google_link: location.google_link,
                              category: location.category,
                              note: location.note,
                              working_hours: location.working_hours,
                              requires_booking: location.requires_booking,
                              latitude: location.latitude,
                              longitude: location.longitude,
                              image_url: location.image_url,
                              user_image_url: location.user_image_url,
                              attribution_name: location.attribution_name,
                              attribution_uri: location.attribution_uri,
                            },
                          },
                        ],
                      }
                    : option
                ),
              };
            }),
          };
        });
      }

      try {
        let optionId: string;
        const mainOption = day.options.find(
          (option) => option.option_index === 1
        );
        if (mainOption) {
          optionId = mainOption.id;
        } else {
          const created = await api.itinerary.createOption(tripId, dayId);
          optionId = created.id;
        }

        const existingCount =
          day.options.find((option) => option.id === optionId)?.locations
            .length ?? 0;

        await api.itinerary.addLocationToOption(tripId, dayId, optionId, {
          location_id: locationId,
          sort_order: existingCount,
          time_period: "morning",
        });

        void fetchItinerary();
      } catch (err) {
        setItineraryError(
          err instanceof Error ? err.message : "Failed to schedule location"
        );
        void fetchItinerary();
      }
    },
    [fetchItinerary, itinerary, locations, tripId]
  );

  const syncLocationSummary = useCallback(
    (
      locationId: string,
      updater: (location: Location) => Partial<Location>
    ) => {
      const source = locations.find((location) => location.id === locationId);
      if (!source) return;
      const patch = updater(source);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => ({
            ...day,
            options: day.options.map((option) => ({
              ...option,
              locations: option.locations.map((optionLocation) =>
                optionLocation.location_id === locationId
                  ? {
                      ...optionLocation,
                      location: {
                        ...optionLocation.location,
                        ...patch,
                      },
                    }
                  : optionLocation
              ),
            })),
          })),
        };
      });
    },
    [locations]
  );

  return {
    itinerary,
    itineraryLoading,
    itineraryError,
    itineraryActionError,
    addDayLoading,
    generateDaysLoading,
    createOptionLoading,
    calculatingRouteId,
    routeMetricsError,
    itineraryLocationMap,
    availableDays,
    fetchItinerary,
    clearItineraryActionError,
    selectOption,
    getSelectedOption,
    getOrphanedDays,
    handleAddDay,
    handleGenerateDays,
    handleSaveOptionDetails,
    handleUpdateDayDate,
    handleCreateAlternative,
    handleDeleteOption,
    handleAddLocationsToOption,
    handleRemoveLocationFromOption,
    handleUpdateLocationTimePeriod,
    handleRouteCreated,
    handleRetryRouteMetrics,
    handleReorderOptionLocations,
    handleScheduleLocationToDay,
    syncLocationSummary,
    // These are implemented at the page level (trips/[id]/page.tsx) where
    // `setLocations` is available. The page merges them into the mutations
    // object before passing to TripView → ItineraryTab → SidebarMap.
    handleLocationNoteSave: undefined,
    handleLocationDelete: undefined,
  };
}
