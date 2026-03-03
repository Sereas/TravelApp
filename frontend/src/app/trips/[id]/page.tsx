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
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
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

  useEffect(() => {
    if (activeTab === "itinerary" && trip) {
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

                  return (
                    <Card key={day.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-semibold">{dayLabel}</h3>
                          {/* Option selector dropdown */}
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
                                  {opt.created_by ? ` (${opt.created_by})` : ""}
                                </option>
                              ))}
                            </select>
                          )}
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
                              <p className="text-sm text-muted-foreground">
                                No locations
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {currentOption.locations
                                  .sort((a, b) => a.sort_order - b.sort_order)
                                  .map((ol) => (
                                    <li
                                      key={ol.location_id}
                                      className="flex items-center gap-2 text-sm"
                                    >
                                      <span className="capitalize text-muted-foreground">
                                        {ol.time_period}:
                                      </span>
                                      <span>
                                        {ol.location.name}
                                        {ol.location.city && (
                                          <span className="text-muted-foreground">
                                            {" "}
                                            ({ol.location.city})
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </>
                        )}
                        {!currentOption && (
                          <p className="text-sm text-muted-foreground">
                            No locations
                          </p>
                        )}
                        <div className="mt-3 border-t border-border pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateAlternative(day.id)}
                            disabled={createOptionLoading === day.id}
                          >
                            {createOptionLoading === day.id
                              ? "Creating…"
                              : "+ Add an alternative plan"}
                          </Button>
                        </div>
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
