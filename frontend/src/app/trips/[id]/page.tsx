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
import { EditTripForm } from "@/components/trips/EditTripForm";
import { ItineraryDayCard } from "@/components/itinerary/ItineraryDayCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function AutosaveInput({
  id,
  label,
  placeholder,
  initialValue,
  onSave,
}: {
  id: string;
  label: string;
  placeholder: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  const savedRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    savedRef.current = initialValue;
  }, [initialValue]);

  const commitValue = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    await onSave(trimmed);
  }, [value, onSave]);

  return (
    <div className="flex w-full flex-col gap-1 sm:w-48">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        autoComplete="off"
        className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commitValue()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

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
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [groupByCity, setGroupByCity] = useState(false);
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
    setItinerary(null);
    setItineraryLoading(true);
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
      const newDay = await api.itinerary.createDay(tripId);
      setItinerary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: [
            ...prev.days,
            {
              id: newDay.id,
              date: newDay.date,
              sort_order: newDay.sort_order,
              options: [],
            },
          ],
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add day";
      setItineraryActionError(message);
      await fetchItinerary();
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
    if (!groupByCity) return null;
    const groups: Record<string, Location[]> = {};
    for (const loc of filteredLocations) {
      const key = loc.city || "No city";
      (groups[key] ??= []).push(loc);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLocations, groupByCity]);

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
        <Button variant="ghost" onClick={() => router.push("/trips")}>
          &larr; Back to trips
        </Button>
      </div>
    );
  }

  if (!trip) return null;

  const dateDisplay = formatDateRange(trip.start_date, trip.end_date);

  function handleTripUpdated(updated: Trip) {
    setTrip(updated);
    setEditingTrip(false);
  }

  function handleLocationAdded(location: Location) {
    setLocations((prev) => [...prev, location]);
    setAddingLocation(false);
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

  function renderLocationCard(loc: Location) {
    if (editingLocationId === loc.id) {
      return (
        <EditLocationRow
          key={loc.id}
          tripId={tripId}
          location={loc}
          onUpdated={handleLocationUpdated}
          onCancel={() => setEditingLocationId(null)}
        />
      );
    }
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
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => router.push("/trips")}
        >
          &larr; Back to trips
        </Button>

        {editingTrip ? (
          <EditTripForm
            trip={trip}
            onUpdated={handleTripUpdated}
            onCancel={() => setEditingTrip(false)}
          />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{trip.name}</h1>
              {dateDisplay && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateDisplay}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingTrip(true)}
              >
                Edit trip
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingTrip}
                  >
                    Delete trip
                  </Button>
                }
                title="Delete trip?"
                description="This will permanently delete this trip and all its locations. This action cannot be undone."
                confirmLabel="Delete trip"
                variant="destructive"
                onConfirm={handleDeleteTrip}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs: Locations | Itinerary */}
      <div className="border-b border-border">
        <nav className="flex gap-4" role="tablist" aria-label="Trip sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "locations"}
            aria-controls="tab-panel-locations"
            id="tab-locations"
            className={cn(
              "border-b-2 pb-2 text-sm font-medium transition-colors",
              activeTab === "locations"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("locations")}
          >
            Locations
            {locations.length > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                ({locations.length})
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "itinerary"}
            aria-controls="tab-panel-itinerary"
            id="tab-itinerary"
            className={cn(
              "border-b-2 pb-2 text-sm font-medium transition-colors",
              activeTab === "itinerary"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Locations
              {locations.length > 0 && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  ({locations.length})
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {cities.size >= 2 && (
                <Button
                  variant={groupByCity ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setGroupByCity((v) => !v)}
                >
                  {groupByCity ? "Ungroup" : "Group by city"}
                </Button>
              )}
              {!addingLocation && locations.length > 0 && (
                <Button size="sm" onClick={() => setAddingLocation(true)}>
                  Add location
                </Button>
              )}
            </div>
          </div>

          {/* Search by location name */}
          {locations.length > 0 && (
            <div className="mb-3">
              <input
                type="search"
                autoComplete="off"
                placeholder="Search by location name…"
                value={locationNameSearch}
                onChange={(e) => setLocationNameSearch(e.target.value)}
                className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Search by location name"
              />
            </div>
          )}

          {/* Category filter chips */}
          {categoryOptions.length >= 2 && (
            <div
              className="mb-3 flex flex-wrap gap-1.5"
              role="toolbar"
              aria-label="Filter locations by category"
            >
              <button
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  categoryFilter === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent"
                )}
                onClick={() => setCategoryFilter(null)}
              >
                All ({locations.length})
              </button>
              {categoryOptions.map(([cat, count]) => (
                <button
                  key={cat}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    categoryFilter === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === cat ? null : cat)
                  }
                >
                  {cat} ({count})
                </button>
              ))}
            </div>
          )}

          {addingLocation && (
            <div className="mb-4">
              <AddLocationForm
                tripId={tripId}
                onAdded={handleLocationAdded}
                onCancel={() => setAddingLocation(false)}
              />
            </div>
          )}

          {locations.length === 0 && !addingLocation ? (
            <EmptyState message="No locations added to this trip yet.">
              <Button onClick={() => setAddingLocation(true)}>
                Add a location
              </Button>
            </EmptyState>
          ) : filteredLocations.length === 0 && locationNameSearch.trim() ? (
            <p className="py-4 text-sm text-muted-foreground">
              No locations match &quot;{locationNameSearch.trim()}&quot;. Try a
              different search or clear the search box.
            </p>
          ) : groupedLocations ? (
            <div className="space-y-4">
              {groupedLocations.map(([cityName, locs]) => (
                <div key={cityName}>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    {cityName}{" "}
                    <span className="font-normal">({locs.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {locs.map(renderLocationCard)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
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
              <EmptyState message="No days yet. Add a day or generate days from your trip dates.">
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={handleAddDay}
                    disabled={addDayLoading || generateDaysLoading}
                  >
                    {addDayLoading ? "Adding…" : "Add day"}
                  </Button>
                  {trip.start_date && trip.end_date && (
                    <Button
                      variant="outline"
                      onClick={handleGenerateDays}
                      disabled={addDayLoading || generateDaysLoading}
                    >
                      {generateDaysLoading
                        ? "Generating…"
                        : "Generate days from dates"}
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
                  <Button
                    size="sm"
                    onClick={handleAddDay}
                    disabled={addDayLoading || generateDaysLoading}
                  >
                    {addDayLoading ? "Adding…" : "Add day"}
                  </Button>
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
                      calculatingRouteId={calculatingRouteId}
                      routeMetricsError={routeMetricsError}
                      onSelectOption={(dayId, optId) =>
                        setSelectedOptionByDay((prev) => ({
                          ...prev,
                          [dayId]: optId,
                        }))
                      }
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
    </div>
  );
}
