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
} from "@/lib/api";
import { LocationCard } from "@/components/locations/LocationCard";
import { AddLocationForm } from "@/components/locations/AddLocationForm";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import { EditTripForm } from "@/components/trips/EditTripForm";
import { AddLocationsToOptionDialog } from "@/components/itinerary/AddLocationsToOptionDialog";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sunrise, Sun, Sunset, Moon, ExternalLink, Ticket } from "lucide-react";

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
  const [openTimePicker, setOpenTimePicker] = useState<{
    dayId: string;
    optionId: string;
    locationId: string;
  } | null>(null);
  const [expandedNoteKey, setExpandedNoteKey] = useState<string | null>(null);
  const [expandedNameKey, setExpandedNameKey] = useState<string | null>(null);

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

  async function handleCreateAlternative(dayId: string) {
    setItineraryActionError(null);
    setCreateOptionLoading(dayId);
    try {
      await api.itinerary.createOption(tripId, dayId);
      await fetchItinerary();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create alternative";
      setItineraryActionError(message);
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
    const startOrder = currentOption?.locations.length ?? 0;

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
    try {
      await api.itinerary.removeLocationFromOption(
        tripId,
        dayId,
        optionId,
        locationId
      );
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
                          locations: o.locations.filter(
                            (l) => l.location_id !== locationId
                          ),
                        }
                      : o
                  ),
                }
              : d
          ),
        };
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove location";
      setItineraryActionError(message);
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

  const TIME_PERIOD_META: Record<
    string,
    {
      label: string;
      icon: React.ComponentType<{ className?: string; size?: number | string }>;
      bg: string;
      text: string;
    }
  > = {
    morning: {
      label: "Morning",
      icon: Sunrise,
      bg: "bg-amber-50",
      text: "text-amber-800",
    },
    afternoon: {
      label: "Afternoon",
      icon: Sun,
      bg: "bg-sky-50",
      text: "text-sky-800",
    },
    evening: {
      label: "Evening",
      icon: Sunset,
      bg: "bg-purple-50",
      text: "text-purple-800",
    },
    night: {
      label: "Night",
      icon: Moon,
      bg: "bg-slate-800",
      text: "text-slate-50",
    },
  };

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

  const filteredLocations = useMemo(
    () =>
      categoryFilter
        ? locations.filter(
            (loc) => (loc.category ?? "Uncategorized") === categoryFilter
          )
        : locations,
    [locations, categoryFilter]
  );

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
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingLocationId(loc.id)}
            >
              Edit
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  Delete
                </Button>
              }
              title="Delete location?"
              description={`"${loc.name}" will be permanently removed from this trip.`}
              confirmLabel="Delete"
              variant="destructive"
              onConfirm={() => handleDeleteLocation(loc.id)}
            />
          </>
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
                  const dayLabel = day.date
                    ? formatDate(day.date)
                    : `Day ${day.sort_order + 1}`;
                  const hasMultipleOptions = day.options.length > 1;
                  const alreadyAddedIds = new Set(
                    currentOption?.locations.map((l) => l.location_id) ?? []
                  );
                  const canDeleteOption = day.options.length > 1;

                  return (
                    <Card key={day.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold">{dayLabel}</h3>
                          <div className="flex items-center gap-2">
                            {hasMultipleOptions && (
                              <select
                                aria-label={`Select option for ${dayLabel}`}
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={currentOption?.id ?? ""}
                                onChange={(e) =>
                                  setSelectedOptionByDay((prev) => ({
                                    ...prev,
                                    [day.id]: e.target.value,
                                  }))
                                }
                              >
                                {day.options.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.option_index === 1
                                      ? "Main plan"
                                      : `Alternative ${opt.option_index - 1}`}
                                    {opt.created_by
                                      ? ` (${opt.created_by})`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                            {canDeleteOption && currentOption && (
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-destructive hover:text-destructive"
                                    aria-label="Delete this alternative"
                                  >
                                    ✕
                                  </Button>
                                }
                                title="Delete this plan?"
                                description={`"${currentOption.option_index === 1 ? "Main plan" : `Alternative ${currentOption.option_index - 1}`}" and its locations will be removed. The next plan will become the main plan if needed.`}
                                confirmLabel="Delete"
                                variant="destructive"
                                onConfirm={() =>
                                  handleDeleteOption(day.id, currentOption.id)
                                }
                              />
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 whitespace-nowrap"
                              onClick={() => handleCreateAlternative(day.id)}
                              disabled={createOptionLoading === day.id}
                            >
                              {createOptionLoading === day.id
                                ? "Creating…"
                                : "+ Alternative"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {currentOption && (
                          <>
                            <div className="mb-4 flex flex-wrap items-end gap-3">
                              <AutosaveInput
                                key={`start-${currentOption.id}`}
                                id={`starting-city-${currentOption.id}`}
                                label="Start City"
                                placeholder="e.g. Paris"
                                initialValue={currentOption.starting_city ?? ""}
                                onSave={async (val) => {
                                  const normalized = val === "" ? null : val;
                                  if (
                                    normalized ===
                                    (currentOption.starting_city ?? null)
                                  )
                                    return;
                                  await handleSaveOptionDetails(
                                    day.id,
                                    currentOption.id,
                                    { starting_city: normalized }
                                  );
                                }}
                              />
                              <AutosaveInput
                                key={`end-${currentOption.id}`}
                                id={`ending-city-${currentOption.id}`}
                                label="End City"
                                placeholder="e.g. Nice"
                                initialValue={currentOption.ending_city ?? ""}
                                onSave={async (val) => {
                                  const normalized = val === "" ? null : val;
                                  if (
                                    normalized ===
                                    (currentOption.ending_city ?? null)
                                  )
                                    return;
                                  await handleSaveOptionDetails(
                                    day.id,
                                    currentOption.id,
                                    { ending_city: normalized }
                                  );
                                }}
                              />
                              <AutosaveInput
                                key={`creator-${currentOption.id}`}
                                id={`created-by-${currentOption.id}`}
                                label="Created by"
                                placeholder="e.g. Alice"
                                initialValue={currentOption.created_by ?? ""}
                                onSave={async (val) => {
                                  const normalized = val === "" ? null : val;
                                  if (
                                    normalized ===
                                    (currentOption.created_by ?? null)
                                  )
                                    return;
                                  await handleSaveOptionDetails(
                                    day.id,
                                    currentOption.id,
                                    { created_by: normalized }
                                  );
                                }}
                              />
                            </div>
                            {currentOption.locations.length === 0 ? (
                              <p className="py-2 text-sm text-muted-foreground">
                                No locations yet — add some from your trip
                                collection.
                              </p>
                            ) : (
                              <div className="space-y-1 overflow-x-auto">
                                {/* Table-like grid: fixed column widths + header row (Illuminator: docs/design/day-option-location-row.md) */}
                                <div
                                  className="grid w-full min-w-[640px] grid-cols-[7rem_minmax(4rem,7rem)_6rem_7rem_6rem_minmax(5rem,1fr)_2.5rem_2rem] gap-3 px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground border-b border-border"
                                  role="row"
                                >
                                  <div role="columnheader">Time</div>
                                  <div role="columnheader">Location</div>
                                  <div role="columnheader">City</div>
                                  <div role="columnheader">Hours</div>
                                  <div role="columnheader">Booking</div>
                                  <div role="columnheader">Note</div>
                                  <div
                                    role="columnheader"
                                    className="text-center"
                                  >
                                    Map
                                  </div>
                                  <div role="columnheader" aria-label="Remove">
                                    <span className="sr-only">Remove</span>
                                  </div>
                                </div>
                                {currentOption.locations
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((ol) => {
                                    const timeKey = ol.time_period || "morning";
                                    const timeMeta =
                                      TIME_PERIOD_META[timeKey] ??
                                      TIME_PERIOD_META.morning;
                                    const TimeIcon = timeMeta.icon;
                                    const rowKey = `${day.id}-${currentOption.id}-${ol.location_id}`;
                                    const noteKey = rowKey;
                                    const nameKey = `name-${rowKey}`;
                                    const isNoteExpanded =
                                      expandedNoteKey === noteKey;
                                    const isNameExpanded =
                                      expandedNameKey === nameKey;
                                    const hasNote = Boolean(
                                      ol.location.note?.trim()
                                    );
                                    const nameLongEnoughToTruncate =
                                      (ol.location.name?.length ?? 0) > 28;
                                    const noteLongEnoughToTruncate =
                                      (ol.location.note?.length ?? 0) > 55;
                                    const booking =
                                      ol.location.requires_booking ?? "no";
                                    const isBooked = booking === "yes_done";
                                    const showBookingPill =
                                      booking !== "no" && booking != null;

                                    return (
                                      <div
                                        key={ol.location_id}
                                        className="group grid w-full min-w-[640px] grid-cols-[7rem_minmax(4rem,7rem)_6rem_7rem_6rem_minmax(5rem,1fr)_2.5rem_2rem] gap-3 items-start rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                                      >
                                        {/* Time */}
                                        <div className="relative min-w-0">
                                          <button
                                            type="button"
                                            className={cn(
                                              "inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors",
                                              "border border-transparent hover:border-border",
                                              timeMeta.bg,
                                              timeMeta.text
                                            )}
                                            onClick={() => {
                                              setOpenTimePicker((prev) =>
                                                prev &&
                                                prev.dayId === day.id &&
                                                prev.optionId ===
                                                  currentOption.id &&
                                                prev.locationId ===
                                                  ol.location_id
                                                  ? null
                                                  : {
                                                      dayId: day.id,
                                                      optionId:
                                                        currentOption.id,
                                                      locationId:
                                                        ol.location_id,
                                                    }
                                              );
                                            }}
                                            aria-label={`Select time of day for ${ol.location.name}`}
                                          >
                                            <TimeIcon
                                              className="h-3.5 w-3.5 shrink-0"
                                              size={14}
                                            />
                                            <span>{timeMeta.label}</span>
                                          </button>
                                          {openTimePicker &&
                                            openTimePicker.dayId === day.id &&
                                            openTimePicker.optionId ===
                                              currentOption.id &&
                                            openTimePicker.locationId ===
                                              ol.location_id && (
                                              <div className="absolute left-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-popover p-1 text-xs shadow-md">
                                                {[
                                                  "morning",
                                                  "afternoon",
                                                  "evening",
                                                  "night",
                                                ].map((key) => {
                                                  const m =
                                                    TIME_PERIOD_META[key];
                                                  const Ico = m.icon;
                                                  return (
                                                    <button
                                                      key={key}
                                                      type="button"
                                                      className={cn(
                                                        "flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left",
                                                        key === timeKey
                                                          ? "bg-accent text-accent-foreground"
                                                          : "hover:bg-accent hover:text-accent-foreground"
                                                      )}
                                                      onClick={() => {
                                                        setOpenTimePicker(null);
                                                        void handleUpdateLocationTimePeriod(
                                                          day.id,
                                                          currentOption.id,
                                                          ol.location_id,
                                                          key
                                                        );
                                                      }}
                                                    >
                                                      <span
                                                        className={cn(
                                                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                                                          m.bg,
                                                          m.text
                                                        )}
                                                      >
                                                        <Ico
                                                          className="h-3 w-3"
                                                          size={12}
                                                        />
                                                      </span>
                                                      <span>{m.label}</span>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                        </div>
                                        {/* Name (expandable only when long) */}
                                        <div className="min-w-0">
                                          {isNameExpanded ? (
                                            <div className="space-y-0.5">
                                              <p className="break-words text-sm font-medium">
                                                {ol.location.name}
                                              </p>
                                              <button
                                                type="button"
                                                className="text-xs text-primary hover:underline"
                                                onClick={() =>
                                                  setExpandedNameKey(null)
                                                }
                                                aria-expanded={true}
                                              >
                                                Show less
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="space-y-0.5">
                                              <p
                                                className={cn(
                                                  "text-sm font-medium",
                                                  nameLongEnoughToTruncate &&
                                                    "truncate"
                                                )}
                                                title={ol.location.name}
                                              >
                                                {ol.location.name}
                                              </p>
                                              {nameLongEnoughToTruncate && (
                                                <button
                                                  type="button"
                                                  className="text-xs text-primary hover:underline"
                                                  onClick={() =>
                                                    setExpandedNameKey(nameKey)
                                                  }
                                                  aria-expanded={false}
                                                >
                                                  Show more
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {/* City */}
                                        <div
                                          className="min-w-0 truncate text-sm text-muted-foreground"
                                          title={ol.location.city ?? undefined}
                                        >
                                          {ol.location.city ?? "—"}
                                        </div>
                                        {/* Working hours */}
                                        <div
                                          className="min-w-0 truncate text-xs text-muted-foreground"
                                          title={
                                            ol.location.working_hours ??
                                            undefined
                                          }
                                        >
                                          {ol.location.working_hours ?? "—"}
                                        </div>
                                        {/* Booking */}
                                        <div className="min-w-0">
                                          {showBookingPill ? (
                                            <span
                                              className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-tight",
                                                isBooked
                                                  ? "bg-green-50 text-green-700"
                                                  : "bg-amber-50 text-amber-700"
                                              )}
                                            >
                                              <Ticket size={12} />
                                              {isBooked
                                                ? "Booked \u2713"
                                                : "Booking needed"}
                                            </span>
                                          ) : null}
                                        </div>
                                        {/* Note (expandable only when long) */}
                                        <div className="min-w-0">
                                          {!hasNote ? (
                                            <span className="text-xs text-muted-foreground">
                                              —
                                            </span>
                                          ) : isNoteExpanded ? (
                                            <div className="space-y-0.5">
                                              <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground max-h-24 overflow-y-auto">
                                                {ol.location.note}
                                              </p>
                                              <button
                                                type="button"
                                                className="text-xs text-primary hover:underline"
                                                onClick={() =>
                                                  setExpandedNoteKey(null)
                                                }
                                                aria-expanded={true}
                                              >
                                                Show less
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="space-y-0.5">
                                              <p
                                                className={cn(
                                                  "text-xs text-muted-foreground",
                                                  noteLongEnoughToTruncate &&
                                                    "truncate"
                                                )}
                                                title={
                                                  ol.location.note ?? undefined
                                                }
                                              >
                                                {ol.location.note}
                                              </p>
                                              {noteLongEnoughToTruncate && (
                                                <button
                                                  type="button"
                                                  className="text-xs text-primary hover:underline"
                                                  onClick={() =>
                                                    setExpandedNoteKey(noteKey)
                                                  }
                                                  aria-expanded={false}
                                                >
                                                  Show more
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {/* Map link */}
                                        <div className="flex items-center">
                                          {ol.location.google_link ? (
                                            <a
                                              href={ol.location.google_link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-primary hover:underline"
                                              aria-label={`Open ${ol.location.name} in Google Maps`}
                                            >
                                              <ExternalLink
                                                size={14}
                                                className="shrink-0"
                                              />
                                            </a>
                                          ) : (
                                            <span className="text-muted-foreground/50">
                                              —
                                            </span>
                                          )}
                                        </div>
                                        {/* Remove */}
                                        <div className="flex items-center">
                                          <button
                                            type="button"
                                            className="text-xs text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                            aria-label={`Remove ${ol.location.name}`}
                                            onClick={() =>
                                              handleRemoveLocationFromOption(
                                                day.id,
                                                currentOption.id,
                                                ol.location_id
                                              )
                                            }
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                            <div className="mt-3">
                              <AddLocationsToOptionDialog
                                trigger={
                                  <Button variant="outline" size="sm">
                                    + Add locations
                                  </Button>
                                }
                                allLocations={locations}
                                alreadyAddedIds={alreadyAddedIds}
                                startingCity={currentOption.starting_city}
                                endingCity={currentOption.ending_city}
                                onConfirm={(ids) =>
                                  handleAddLocationsToOption(
                                    day.id,
                                    currentOption.id,
                                    ids
                                  )
                                }
                              />
                            </div>
                          </>
                        )}
                        {!currentOption && (
                          <p className="text-sm text-muted-foreground">
                            No locations
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
        </section>
      )}
    </div>
  );
}
