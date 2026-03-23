"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type Trip,
  type Location,
  type ItineraryResponse,
  type ItineraryDay,
  type ItineraryOption,
  type RouteResponse,
  type RouteWithSegmentsResponse,
} from "@/lib/api";
import { LocationCard } from "@/components/locations/LocationCard";
import { AddLocationForm } from "@/components/locations/AddLocationForm";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import {
  EditTripForm,
  type TripUpdatePayload,
} from "@/components/trips/EditTripForm";
import {
  DateChangeDialog,
  type DateChangeResult,
} from "@/components/trips/DateChangeDialog";
import { ItineraryDayCard } from "@/components/itinerary/ItineraryDayCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { format } from "date-fns";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  MapPin,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} \u2014 ${formatDate(end)}`;
  if (start) return `Starts ${formatDate(start)}`;
  return `Ends ${formatDate(end!)}`;
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params.id;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTrip, setEditingTrip] = useState(false);
  const [dateChangeDialog, setDateChangeDialog] = useState<{
    payload: TripUpdatePayload;
    resolve: (trip: Trip) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [groupByCity, setGroupByCity] = useState(false);
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [locationNameSearch, setLocationNameSearch] = useState("");

  const [activeTab, setActiveTab] = useState<"locations" | "itinerary">(
    "locations"
  );
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [addDayLoading, setAddDayLoading] = useState(false);
  const [generateDaysLoading, setGenerateDaysLoading] = useState(false);
  const [itineraryActionError, setItineraryActionError] = useState<
    string | null
  >(null);
  const [updatingDayId, setUpdatingDayId] = useState<string | null>(null);
  const [selectedOptionByDay, setSelectedOptionByDay] = useState<
    Record<string, string>
  >({});
  const [createOptionLoading, setCreateOptionLoading] = useState<string | null>(
    null
  );
  const [calculatingRouteId, setCalculatingRouteId] = useState<string | null>(
    null
  );
  const [routeMetricsError, setRouteMetricsError] = useState<
    Record<string, string>
  >({});

  async function fetchData() {
    setError(null);
    setLoading(true);
    try {
      const [tripData, locationsData] = await Promise.all([
        api.trips.get(tripId),
        api.locations.list(tripId),
      ]);
      setTrip(tripData);
      setLocations(locationsData);
    } catch (err) {
      if (
        err instanceof Error &&
        "status" in err &&
        (err as any).status === 404
      ) {
        setError("Trip not found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load trip");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Prefetch itinerary as soon as we have the trip so the Itinerary tab is ready when opened.
  useEffect(() => {
    if (trip && tripId) {
      fetchItinerary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, tripId]);

  async function fetchItinerary() {
    setItineraryError(null);
    // Only show loading spinner if we have no data yet (first load).
    if (!itinerary) setItineraryLoading(true);
    try {
      const data = await api.itinerary.get(tripId);
      setItinerary(data);
    } catch (err) {
      setItineraryError(
        err instanceof Error ? err.message : "Failed to load itinerary"
      );
    } finally {
      setItineraryLoading(false);
    }
  }

  // Refetch itinerary when switching to tab if we don't have data (e.g. prefetch failed or was skipped).
  useEffect(() => {
    if (
      activeTab === "itinerary" &&
      trip &&
      itinerary === null &&
      !itineraryLoading
    ) {
      fetchItinerary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tripId]);

  async function handleAddDay() {
    setItineraryActionError(null);
    setAddDayLoading(true);
    try {
      await api.itinerary.createDay(tripId);
      await fetchItinerary();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add day";
      setItineraryActionError(message);
    } finally {
      setAddDayLoading(false);
    }
  }

  async function handleGenerateDays() {
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
        const message =
          err instanceof Error ? err.message : "Failed to generate days";
        setItineraryActionError(message);
      }
    } finally {
      setGenerateDaysLoading(false);
    }
  }

  async function handleSaveOptionDetails(
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) {
    if (
      !("starting_city" in updates) &&
      !("ending_city" in updates) &&
      !("created_by" in updates)
    ) {
      return;
    }
    setItineraryActionError(null);
    setUpdatingDayId(dayId);
    try {
      await api.itinerary.updateOption(tripId, dayId, optionId, updates);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) =>
            d.id === dayId
              ? {
                  ...d,
                  options: d.options.map((o) =>
                    o.id === optionId ? { ...o, ...updates } : o
                  ),
                }
              : d
          ),
        };
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update option details";
      setItineraryActionError(message);
    } finally {
      setUpdatingDayId(null);
    }
  }

  async function handleUpdateDayDate(
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) {
    setItineraryActionError(null);
    try {
      if (date && optionId) {
        await api.itinerary.reassignDayDate(tripId, dayId, date, optionId);
      } else {
        await api.itinerary.updateDay(tripId, dayId, { date });
      }
      // Full refetch to get correct option state after potential swap
      await fetchItinerary();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update day date";
      setItineraryActionError(message);
    }
  }

  async function handleCreateAlternative(dayId: string) {
    setItineraryActionError(null);
    setCreateOptionLoading(dayId);
    try {
      const newOption = await api.itinerary.createOption(tripId, dayId);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) =>
            d.id === dayId
              ? {
                  ...d,
                  options: [
                    ...d.options,
                    {
                      id: newOption.id,
                      option_index: newOption.option_index,
                      starting_city: newOption.starting_city,
                      ending_city: newOption.ending_city,
                      created_by: newOption.created_by,
                      locations: [],
                      routes: [],
                    },
                  ],
                }
              : d
          ),
        };
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create alternative";
      setItineraryActionError(message);
      await fetchItinerary();
    } finally {
      setCreateOptionLoading(null);
    }
  }

  function getSelectedOption(day: ItineraryDay): ItineraryOption | undefined {
    const selId = selectedOptionByDay[day.id];
    if (selId) {
      const found = day.options.find((o) => o.id === selId);
      if (found) return found;
    }
    return day.options.find((o) => o.option_index === 1) ?? day.options[0];
  }

  async function handleDeleteOption(dayId: string, optionId: string) {
    setItineraryActionError(null);
    try {
      await api.itinerary.deleteOption(tripId, dayId, optionId);
      setSelectedOptionByDay((prev) => {
        const next = { ...prev };
        delete next[dayId];
        return next;
      });
      await fetchItinerary();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete alternative";
      setItineraryActionError(message);
    }
  }

  async function handleAddLocationsToOption(
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) {
    setItineraryActionError(null);
    const currentOption = itinerary?.days
      .find((d) => d.id === dayId)
      ?.options.find((o) => o.id === optionId);
    // Append new locations after the current highest sort_order, not just by count.
    const maxSortOrder =
      currentOption && currentOption.locations.length > 0
        ? Math.max(...currentOption.locations.map((l) => l.sort_order))
        : -1;
    const startOrder = maxSortOrder + 1;

    const items = locationIds.map((lid, i) => ({
      location_id: lid,
      sort_order: startOrder + i,
      time_period: "morning" as const,
    }));

    try {
      await api.itinerary.batchAddLocationsToOption(
        tripId,
        dayId,
        optionId,
        items
      );
      await fetchItinerary();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add locations";
      setItineraryActionError(message);
      throw err;
    }
  }

  async function handleRemoveLocationFromOption(
    dayId: string,
    optionId: string,
    locationId: string
  ) {
    setItineraryActionError(null);
    // Optimistically update locations and routes for this option so UI reacts immediately.
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
                  // Remove location from option locations
                  const nextLocations = o.locations.filter(
                    (l) => l.location_id !== locationId
                  );
                  // Update routes: drop this location from each route; delete routes with < 2 stops
                  const nextRoutes =
                    o.routes?.length > 0
                      ? (o.routes
                          .map((r) => {
                            const remainingIds = r.location_ids.filter(
                              (id) => id !== locationId
                            );
                            if (remainingIds.length < 2) {
                              return null;
                            }
                            return { ...r, location_ids: remainingIds };
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
        locationId
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove location";
      setItineraryActionError(message);
      // Backend rejected the change; refresh from server to correct optimistic state.
      await fetchItinerary();
    }
  }

  async function handleUpdateLocationTimePeriod(
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) {
    setItineraryActionError(null);
    // Optimistic UI update for snappier interaction
    setItinerary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.id === dayId
            ? {
                ...d,
                options: d.options.map((o) =>
                  o.id === optionId
                    ? {
                        ...o,
                        locations: o.locations.map((l) =>
                          l.location_id === locationId
                            ? { ...l, time_period: timePeriod }
                            : l
                        ),
                      }
                    : o
                ),
              }
            : d
        ),
      };
    });
    try {
      await api.itinerary.updateOptionLocation(
        tripId,
        dayId,
        optionId,
        locationId,
        { time_period: timePeriod }
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update time of day";
      setItineraryActionError(message);
      // Refresh from server to avoid stale/incorrect optimistic state
      await fetchItinerary();
    }
  }

  async function handleRouteCreated(
    dayId: string,
    optionId: string,
    routeResponse: RouteResponse
  ) {
    const routeId = routeResponse.route_id;
    setRouteMetricsError((prev) => {
      const next = { ...prev };
      delete next[routeId];
      return next;
    });
    setCalculatingRouteId(routeId);
    await fetchItinerary();
    try {
      const withSegments = await api.itinerary.getRouteWithSegments(
        tripId,
        dayId,
        optionId,
        routeId
      );
      setItinerary((prev) => {
        if (!prev) return prev;
        return patchRouteInItinerary(
          prev,
          dayId,
          optionId,
          routeId,
          withSegments
        );
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not calculate distance and duration";
      setRouteMetricsError((prev) => ({ ...prev, [routeId]: message }));
    } finally {
      setCalculatingRouteId(null);
    }
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
      days: prev.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          options: d.options.map((o) => {
            if (o.id !== optionId) return o;
            return {
              ...o,
              routes: o.routes.map((r) =>
                r.route_id === routeId
                  ? {
                      ...r,
                      duration_seconds: data.duration_seconds,
                      distance_meters: data.distance_meters,
                      route_status: data.route_status,
                      segments: data.segments.map((s) => ({
                        segment_order: s.segment_order,
                        duration_seconds: s.duration_seconds,
                        distance_meters: s.distance_meters,
                        encoded_polyline: s.encoded_polyline,
                      })),
                    }
                  : r
              ),
            };
          }),
        };
      }),
    };
  }

  async function handleRetryRouteMetrics(
    dayId: string,
    optionId: string,
    routeId: string
  ) {
    setRouteMetricsError((prev) => {
      const next = { ...prev };
      delete next[routeId];
      return next;
    });
    setCalculatingRouteId(routeId);
    try {
      const withSegments = await api.itinerary.getRouteWithSegments(
        tripId,
        dayId,
        optionId,
        routeId
      );
      setItinerary((prev) => {
        if (!prev) return prev;
        return patchRouteInItinerary(
          prev,
          dayId,
          optionId,
          routeId,
          withSegments
        );
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not calculate distance and duration";
      setRouteMetricsError((prev) => ({ ...prev, [routeId]: message }));
    } finally {
      setCalculatingRouteId(null);
    }
  }

  async function handleReorderOptionLocations(
    dayId: string,
    optionId: string,
    newOrderedLocationIds: string[]
  ) {
    if (!itinerary) return;
    const day = itinerary.days.find((d) => d.id === dayId);
    const option = day?.options.find((o) => o.id === optionId);
    if (!option) return;
    const idToLoc = new Map(option.locations.map((l) => [l.location_id, l]));
    const reordered = newOrderedLocationIds
      .map((id, idx) => {
        const loc = idToLoc.get(id);
        return loc ? { ...loc, sort_order: idx } : null;
      })
      .filter(Boolean) as typeof option.locations;
    if (reordered.length !== newOrderedLocationIds.length) return;
    setItineraryActionError(null);
    setItinerary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.id !== dayId
            ? d
            : {
                ...d,
                options: d.options.map((o) =>
                  o.id !== optionId ? o : { ...o, locations: reordered }
                ),
              }
        ),
      };
    });
    try {
      await api.itinerary.reorderOptionLocations(tripId, dayId, optionId, {
        location_ids: newOrderedLocationIds,
      });
    } catch (err) {
      setItineraryActionError(
        err instanceof Error ? err.message : "Failed to reorder locations"
      );
      await fetchItinerary();
    }
  }

  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const loc of locations) {
      const cat = loc.category ?? "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [locations]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      if (loc.city) set.add(loc.city);
    }
    return set;
  }, [locations]);

  const addedByEmails = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      if (loc.added_by_email) set.add(loc.added_by_email);
    }
    return set;
  }, [locations]);

  const filteredLocations = useMemo(() => {
    let list = locations;
    if (categoryFilter) {
      list = list.filter(
        (loc) => (loc.category ?? "Uncategorized") === categoryFilter
      );
    }
    if (locationNameSearch.trim()) {
      const q = locationNameSearch.trim().toLowerCase();
      list = list.filter((loc) => (loc.name ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [locations, categoryFilter, locationNameSearch]);

  const groupedLocations = useMemo(() => {
    if (!groupByCity && !groupByPerson) return null;
    const groups: Record<string, Location[]> = {};
    for (const loc of filteredLocations) {
      const key = groupByCity
        ? loc.city || "No city"
        : loc.added_by_email || "Unknown";
      (groups[key] ??= []).push(loc);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLocations, groupByCity, groupByPerson]);

  // Map location IDs → day labels for "in itinerary" indicator on location cards.
  const itineraryLocationMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!itinerary) return map;
    for (const day of itinerary.days) {
      const dayLabel = day.date
        ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : `Day ${day.sort_order + 1}`;
      for (const option of day.options) {
        for (const ol of option.locations) {
          const existing = map.get(ol.location_id);
          if (existing) {
            if (!existing.includes(dayLabel)) existing.push(dayLabel);
          } else {
            map.set(ol.location_id, [dayLabel]);
          }
        }
      }
    }
    return map;
  }, [itinerary]);

  // Build day choices for "Schedule to day" selectors.
  const availableDays = useMemo(() => {
    if (!itinerary) return [];
    return itinerary.days.map((day, idx) => ({
      id: day.id,
      label: day.date
        ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : `Day ${idx + 1}`,
    }));
  }, [itinerary]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={fetchData} />
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-content-muted transition-colors hover:text-content-primary"
          onClick={() => router.push("/trips")}
        >
          <ChevronLeft size={14} className="shrink-0" />
          All trips
        </button>
      </div>
    );
  }

  if (!trip) return null;

  const dateDisplay = formatDateRange(trip.start_date, trip.end_date);

  function handleTripUpdated(updated: Trip) {
    setTrip(updated);
    setEditingTrip(false);
    fetchItinerary();
  }

  /**
   * Compute which existing dated days fall outside a new date range.
   */
  function getOrphanedDays(newStart: string, newEnd: string): ItineraryDay[] {
    if (!itinerary) return [];
    return itinerary.days.filter(
      (d) => d.date && (d.date < newStart || d.date > newEnd)
    );
  }

  /**
   * Called by EditTripForm before saving when dates change.
   * If reconciliation is needed, shows the dialog and returns a promise
   * that resolves when the user picks an action and the save completes.
   */
  async function handleBeforeTripSave(
    payload: TripUpdatePayload
  ): Promise<Trip> {
    const hasNewDates = payload.start_date && payload.end_date;
    const hadOldDates = trip!.start_date && trip!.end_date;

    // If no new dates or no itinerary, just save directly
    if (!hasNewDates || !itinerary || itinerary.days.length === 0) {
      return api.trips.update(tripId, payload);
    }

    const orphaned = getOrphanedDays(payload.start_date!, payload.end_date!);

    // No days affected — save directly
    if (orphaned.length === 0) {
      return api.trips.update(tripId, payload);
    }

    // Show reconciliation dialog and wait for user choice
    return new Promise<Trip>((resolve, reject) => {
      setDateChangeDialog({ payload, resolve, reject });
    });
  }

  async function handleDateChangeConfirm(result: DateChangeResult) {
    if (!dateChangeDialog) return;
    const { payload, resolve, reject } = dateChangeDialog;

    try {
      // 1. Execute the reconciliation action
      await api.itinerary.reconcileDays(tripId, {
        action: result.action,
        offset_days: result.offsetDays,
        day_ids: result.dayIds,
      });

      // 2. Now save the trip dates
      const updated = await api.trips.update(tripId, payload);

      setDateChangeDialog(null);
      resolve(updated);
    } catch (err) {
      reject(
        err instanceof Error ? err : new Error("Failed to reconcile days")
      );
      throw err; // re-throw so the dialog stays open
    }
  }

  async function handleScheduleLocationToDay(
    locationId: string,
    dayId: string
  ) {
    if (!itinerary) return;
    const day = itinerary.days.find((d) => d.id === dayId);
    if (!day) return;

    // Optimistic update: immediately show the location as scheduled.
    const loc = locations.find((l) => l.id === locationId);
    if (loc) {
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) => {
            if (d.id !== dayId) return d;
            const mainOpt = d.options.find((o) => o.option_index === 1);
            if (!mainOpt) return d;
            return {
              ...d,
              options: d.options.map((o) =>
                o.id === mainOpt.id
                  ? {
                      ...o,
                      locations: [
                        ...o.locations,
                        {
                          location_id: locationId,
                          sort_order: o.locations.length,
                          time_period: "morning",
                          location: {
                            id: loc.id,
                            name: loc.name,
                            city: loc.city,
                            address: loc.address,
                            google_link: loc.google_link,
                            category: loc.category,
                            note: loc.note,
                            working_hours: loc.working_hours,
                            requires_booking: loc.requires_booking,
                            image_url: loc.image_url,
                            user_image_url: loc.user_image_url,
                            attribution_name: loc.attribution_name,
                            attribution_uri: loc.attribution_uri,
                          },
                        },
                      ],
                    }
                  : o
              ),
            };
          }),
        };
      });
    }

    try {
      // Use the main option (option_index 1), or create one if none exists.
      let optionId: string;
      const mainOption = day.options.find((o) => o.option_index === 1);
      if (mainOption) {
        optionId = mainOption.id;
      } else {
        const created = await api.itinerary.createOption(tripId, dayId);
        optionId = created.id;
      }

      // Append at end of the option's locations.
      const existingCount =
        day.options.find((o) => o.id === optionId)?.locations.length ?? 0;

      await api.itinerary.addLocationToOption(tripId, dayId, optionId, {
        location_id: locationId,
        sort_order: existingCount,
        time_period: "morning",
      });

      // Background refetch to reconcile with server state (no UI flicker).
      fetchItinerary();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to schedule location"
      );
      // Revert optimistic update on error.
      fetchItinerary();
    }
  }

  async function handlePhotoUpload(locationId: string, file: File) {
    const updated = await api.locations.uploadPhoto(tripId, locationId, file);
    setLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? updated : loc))
    );
    // Update itinerary LocationSummary too
    setItinerary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => ({
          ...d,
          options: d.options.map((o) => ({
            ...o,
            locations: o.locations.map((l) =>
              l.location_id === locationId
                ? {
                    ...l,
                    location: {
                      ...l.location,
                      user_image_url: updated.user_image_url,
                    },
                  }
                : l
            ),
          })),
        })),
      };
    });
  }

  async function handlePhotoReset(locationId: string) {
    await api.locations.deletePhoto(tripId, locationId);
    setLocations((prev) =>
      prev.map((loc) =>
        loc.id === locationId ? { ...loc, user_image_url: null } : loc
      )
    );
    setItinerary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => ({
          ...d,
          options: d.options.map((o) => ({
            ...o,
            locations: o.locations.map((l) =>
              l.location_id === locationId
                ? {
                    ...l,
                    location: { ...l.location, user_image_url: null },
                  }
                : l
            ),
          })),
        })),
      };
    });
  }

  function handleLocationAdded(
    location: Location,
    scheduleDayId?: string | null
  ) {
    setLocations((prev) => [...prev, location]);
    setAddingLocation(false);
    if (scheduleDayId) {
      handleScheduleLocationToDay(location.id, scheduleDayId);
    }
  }

  function handleLocationUpdated(updated: Location) {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === updated.id ? updated : loc))
    );
    setEditingLocationId(null);
    // Itinerary tab embeds LocationSummary (name, note, etc.); refetch so it shows the update.
    fetchItinerary();
  }

  async function handleDeleteTrip() {
    setDeletingTrip(true);
    try {
      await api.trips.delete(tripId);
      router.push("/trips");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
      setDeletingTrip(false);
    }
  }

  async function handleDeleteLocation(locationId: string) {
    try {
      await api.locations.delete(tripId, locationId);
      setLocations((prev) => prev.filter((loc) => loc.id !== locationId));
      fetchItinerary(); // Itinerary embeds LocationSummary; refetch so removed location is updated.
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete location"
      );
    }
  }

  const editingLocation = editingLocationId
    ? (locations.find((l) => l.id === editingLocationId) ?? null)
    : null;

  function renderLocationCard(loc: Location) {
    const dayLabels = itineraryLocationMap.get(loc.id);
    return (
      <LocationCard
        key={loc.id}
        id={loc.id}
        name={loc.name}
        address={loc.address}
        google_link={loc.google_link}
        note={loc.note}
        city={loc.city}
        category={loc.category}
        requires_booking={loc.requires_booking}
        working_hours={loc.working_hours}
        added_by_email={loc.added_by_email}
        image_url={loc.image_url}
        user_image_url={loc.user_image_url}
        attribution_name={loc.attribution_name}
        attribution_uri={loc.attribution_uri}
        onPhotoUpload={(file) => handlePhotoUpload(loc.id, file)}
        onPhotoReset={() => handlePhotoReset(loc.id)}
        inItinerary={dayLabels != null}
        itineraryDayLabel={dayLabels?.join(", ") ?? null}
        availableDays={dayLabels == null ? availableDays : undefined}
        onScheduleToDay={
          dayLabels == null
            ? (dayId) => handleScheduleLocationToDay(loc.id, dayId)
            : undefined
        }
        onEdit={() => setEditingLocationId(loc.id)}
        deleteTrigger={
          <ConfirmDialog
            trigger={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={14} />
                Delete
              </button>
            }
            title="Delete location?"
            description={`"${loc.name}" will be permanently removed from this trip.`}
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={() => handleDeleteLocation(loc.id)}
          />
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          className="mb-3 -ml-1 inline-flex items-center gap-1 text-xs font-medium text-content-muted transition-colors hover:text-content-primary"
          onClick={() => router.push("/trips")}
        >
          <ChevronLeft size={14} className="shrink-0" />
          All trips
        </button>

        {editingTrip ? (
          <EditTripForm
            trip={trip}
            onUpdated={handleTripUpdated}
            onCancel={() => setEditingTrip(false)}
            onDelete={handleDeleteTrip}
            onBeforeSave={handleBeforeTripSave}
          />
        ) : (
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-content-primary">
              {trip.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {dateDisplay && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-light px-3 py-1 text-xs font-medium text-brand-green-dark">
                  <Calendar size={12} />
                  {dateDisplay}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warm-border px-3 py-1 text-xs font-medium text-content-muted">
                <Users size={12} />1 Traveler
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-warm-border px-4 py-1.5 text-sm font-medium text-content-primary transition-colors hover:bg-brand-green-light"
                aria-label="Share trip"
              >
                <Share2 size={14} />
                Share
              </button>
              <Button
                className="rounded-full bg-brand-terracotta px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-terracotta-dark"
                onClick={() => setEditingTrip(true)}
                aria-label="Edit trip"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit Trip
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs: Locations | Itinerary */}
      <div className="border-b border-warm-border">
        <nav className="flex gap-6" role="tablist" aria-label="Trip sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "locations"}
            aria-controls="tab-panel-locations"
            id="tab-locations"
            className={cn(
              "border-b-[3px] pb-3 text-xs font-semibold uppercase tracking-wider transition-colors",
              activeTab === "locations"
                ? "border-brand-green text-brand-green"
                : "border-transparent text-content-muted hover:text-content-primary"
            )}
            onClick={() => setActiveTab("locations")}
          >
            Locations
            {locations.length > 0 && (
              <span className="ml-1.5">({locations.length})</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "itinerary"}
            aria-controls="tab-panel-itinerary"
            id="tab-itinerary"
            className={cn(
              "border-b-[3px] pb-3 text-xs font-semibold uppercase tracking-wider transition-colors",
              activeTab === "itinerary"
                ? "border-brand-green text-brand-green"
                : "border-transparent text-content-muted hover:text-content-primary"
            )}
            onClick={() => setActiveTab("itinerary")}
          >
            Itinerary
          </button>
        </nav>
      </div>

      {activeTab === "locations" && (
        <section
          id="tab-panel-locations"
          role="tabpanel"
          aria-labelledby="tab-locations"
        >
          {/* Toolbar row */}
          {locations.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
                />
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Search locations…"
                  value={locationNameSearch}
                  onChange={(e) => setLocationNameSearch(e.target.value)}
                  className="h-9 w-full rounded-full border border-warm-border bg-surface-card pl-9 pr-4 text-sm placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-green"
                  aria-label="Search by location name"
                />
              </div>
              {cities.size >= 2 && (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-warm-border px-3 py-1.5 text-sm font-medium transition-colors",
                    groupByCity
                      ? "bg-brand-green-light text-brand-green-dark"
                      : "text-content-primary hover:bg-brand-green-light"
                  )}
                  onClick={() => {
                    setGroupByCity((v) => !v);
                    if (!groupByCity) setGroupByPerson(false);
                  }}
                >
                  <Building2 size={14} />
                  {groupByCity ? "Ungrouped" : "Group by City"}
                </button>
              )}
              {addedByEmails.size >= 2 && (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-warm-border px-3 py-1.5 text-sm font-medium transition-colors",
                    groupByPerson
                      ? "bg-brand-green-light text-brand-green-dark"
                      : "text-content-primary hover:bg-brand-green-light"
                  )}
                  onClick={() => {
                    setGroupByPerson((v) => !v);
                    if (!groupByPerson) setGroupByCity(false);
                  }}
                >
                  <User size={14} />
                  {groupByPerson ? "Ungrouped" : "Group by Person"}
                </button>
              )}
              {/* Add Location dropdown — pushed to far right */}
              {!addingLocation && (
                <>
                  <div className="flex-1" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-terracotta px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-terracotta-dark"
                      >
                        <Plus size={16} strokeWidth={2.5} />
                        Add Location
                        <ChevronDown size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-52 p-1.5"
                      align="end"
                      sideOffset={6}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-content-primary transition-colors hover:bg-brand-green-light"
                        onClick={() => setAddingLocation(true)}
                      >
                        <MapPin size={16} className="text-brand-terracotta" />
                        Paste Link
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-content-muted"
                        disabled
                      >
                        <Upload size={16} className="opacity-40" />
                        <span className="opacity-60">Upload Locations</span>
                      </button>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          )}

          {/* Category filter pills */}
          {categoryOptions.length >= 2 && (
            <div
              className="mb-4 flex flex-wrap gap-1.5"
              role="toolbar"
              aria-label="Filter locations by category"
            >
              <button
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  categoryFilter === null
                    ? "bg-brand-green text-white"
                    : "border border-warm-border bg-surface-card text-content-muted hover:bg-brand-green-light"
                )}
                onClick={() => setCategoryFilter(null)}
              >
                All Locations
              </button>
              {categoryOptions.map(([cat]) => (
                <button
                  key={cat}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    categoryFilter === cat
                      ? "bg-brand-green text-white"
                      : "border border-warm-border bg-surface-card text-content-muted hover:bg-brand-green-light"
                  )}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === cat ? null : cat)
                  }
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {addingLocation && (
            <AddLocationForm
              tripId={tripId}
              existingLocations={locations}
              availableDays={availableDays}
              onAdded={handleLocationAdded}
              onCancel={() => setAddingLocation(false)}
            />
          )}

          {editingLocation && (
            <EditLocationRow
              tripId={tripId}
              location={editingLocation}
              onUpdated={handleLocationUpdated}
              onCancel={() => setEditingLocationId(null)}
            />
          )}

          {locations.length === 0 && !addingLocation ? (
            <EmptyState message="No locations added to this trip yet.">
              <Button onClick={() => setAddingLocation(true)}>
                Add a location
              </Button>
            </EmptyState>
          ) : filteredLocations.length === 0 && locationNameSearch.trim() ? (
            <p className="py-4 text-sm text-content-muted">
              No locations match &quot;{locationNameSearch.trim()}&quot;. Try a
              different search or clear the search box.
            </p>
          ) : groupedLocations ? (
            <div className="space-y-6">
              {groupedLocations.map(([groupName, locs]) => (
                <div key={groupName}>
                  <h3 className="mb-3 text-sm font-semibold text-content-muted">
                    {groupName}{" "}
                    <span className="font-normal">({locs.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {locs.map(renderLocationCard)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredLocations.map(renderLocationCard)}
            </div>
          )}
        </section>
      )}

      {activeTab === "itinerary" && (
        <section
          id="tab-panel-itinerary"
          role="tabpanel"
          aria-labelledby="tab-itinerary"
        >
          {itineraryLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          )}
          {itineraryError && !itineraryLoading && (
            <ErrorBanner message={itineraryError} onRetry={fetchItinerary} />
          )}
          {itineraryActionError && !itineraryLoading && (
            <ErrorBanner
              message={itineraryActionError}
              onRetry={() => setItineraryActionError(null)}
            />
          )}
          {!itineraryLoading &&
            !itineraryError &&
            itinerary?.days.length === 0 && (
              <EmptyState
                message={
                  trip.start_date && trip.end_date
                    ? "No days yet. Generate days from your trip dates."
                    : "No days yet. Add a day to get started."
                }
              >
                <div className="mt-3 flex flex-wrap gap-2">
                  {trip.start_date && trip.end_date ? (
                    <Button
                      onClick={handleGenerateDays}
                      disabled={addDayLoading || generateDaysLoading}
                    >
                      {generateDaysLoading
                        ? "Generating…"
                        : "Generate days from dates"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleAddDay}
                      disabled={addDayLoading || generateDaysLoading}
                    >
                      {addDayLoading ? "Adding…" : "Add day"}
                    </Button>
                  )}
                </div>
              </EmptyState>
            )}
          {!itineraryLoading &&
            !itineraryError &&
            itinerary &&
            itinerary.days.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Days</h2>
                  {trip.start_date && trip.end_date ? (
                    (() => {
                      const coveredDates = new Set(
                        itinerary.days.map((d) => d.date).filter(Boolean)
                      );
                      const start = new Date(trip.start_date + "T00:00:00");
                      const end = new Date(trip.end_date + "T00:00:00");
                      let hasMissing = false;
                      for (
                        let d = new Date(start);
                        d <= end;
                        d.setDate(d.getDate() + 1)
                      ) {
                        if (!coveredDates.has(format(d, "yyyy-MM-dd"))) {
                          hasMissing = true;
                          break;
                        }
                      }
                      return hasMissing ? (
                        <Button
                          size="sm"
                          onClick={handleGenerateDays}
                          disabled={addDayLoading || generateDaysLoading}
                        >
                          {generateDaysLoading
                            ? "Generating…"
                            : "Generate missing days"}
                        </Button>
                      ) : null;
                    })()
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleAddDay}
                      disabled={addDayLoading || generateDaysLoading}
                    >
                      {addDayLoading ? "Adding…" : "Add day"}
                    </Button>
                  )}
                </div>
                {itinerary.days.map((day) => {
                  const currentOption = getSelectedOption(day);
                  return (
                    <ItineraryDayCard
                      key={day.id}
                      day={day}
                      tripId={tripId}
                      currentOption={currentOption}
                      tripLocations={locations}
                      createOptionLoading={createOptionLoading === day.id}
                      tripStartDate={trip.start_date}
                      tripEndDate={trip.end_date}
                      calculatingRouteId={calculatingRouteId}
                      routeMetricsError={routeMetricsError}
                      onSelectOption={(dayId, optId) =>
                        setSelectedOptionByDay((prev) => ({
                          ...prev,
                          [dayId]: optId,
                        }))
                      }
                      onUpdateDayDate={handleUpdateDayDate}
                      onCreateAlternative={handleCreateAlternative}
                      onDeleteOption={handleDeleteOption}
                      onSaveOptionDetails={handleSaveOptionDetails}
                      onAddLocations={handleAddLocationsToOption}
                      onRemoveLocation={handleRemoveLocationFromOption}
                      onUpdateTimePeriod={handleUpdateLocationTimePeriod}
                      onReorderLocations={handleReorderOptionLocations}
                      onRoutesChanged={fetchItinerary}
                      onRouteCreated={handleRouteCreated}
                      onRetryRouteMetrics={handleRetryRouteMetrics}
                    />
                  );
                })}
              </div>
            )}
        </section>
      )}

      {dateChangeDialog &&
        (() => {
          const { payload } = dateChangeDialog;
          const newStart = payload.start_date!;
          const newEnd = payload.end_date!;
          const orphaned = getOrphanedDays(newStart, newEnd);
          const oldStart = trip?.start_date ?? newStart;
          const oldEnd = trip?.end_date ?? newEnd;

          // Compute offset and whether shift is viable
          const hasOldDates = !!(trip?.start_date && trip?.end_date);
          const offsetMs = hasOldDates
            ? new Date(newStart + "T00:00:00").getTime() -
              new Date(oldStart + "T00:00:00").getTime()
            : 0;
          const offsetDays = Math.round(offsetMs / 86400000);

          // Shift is viable when old dates existed and every dated day,
          // after shifting, falls in the new range
          const canShift =
            hasOldDates &&
            offsetDays !== 0 &&
            itinerary != null &&
            itinerary.days
              .filter((d) => d.date)
              .every((d) => {
                const shifted = new Date(d.date! + "T00:00:00");
                shifted.setDate(shifted.getDate() + offsetDays);
                const iso = format(shifted, "yyyy-MM-dd");
                return iso >= newStart && iso <= newEnd;
              });

          return (
            <DateChangeDialog
              open
              onClose={() => {
                dateChangeDialog.reject(new Error("Cancelled"));
                setDateChangeDialog(null);
              }}
              onConfirm={handleDateChangeConfirm}
              orphanedDays={orphaned}
              oldStart={oldStart}
              oldEnd={oldEnd}
              newStart={newStart}
              newEnd={newEnd}
              canShift={canShift}
              offsetDays={offsetDays}
            />
          );
        })()}
    </div>
  );
}
