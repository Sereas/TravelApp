"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Trip, type Location } from "@/lib/api";
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
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useItineraryState } from "@/features/itinerary/useItineraryState";

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
  const itineraryState = useItineraryState({
    tripId,
    enabled: !!trip,
    locations,
  });
  const {
    itinerary,
    availableDays,
    itineraryLocationMap,
    fetchItinerary,
    getOrphanedDays,
    handleScheduleLocationToDay,
    syncLocationSummary,
  } = itineraryState;

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
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
   * Called by EditTripForm before saving when dates change.
   * If reconciliation is needed, shows the dialog and returns a promise
   * that resolves when the user picks an action and the save completes.
   */
  async function handleBeforeTripSave(
    payload: TripUpdatePayload
  ): Promise<Trip> {
    const hasNewDates = payload.start_date && payload.end_date;

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

  async function handlePhotoUpload(locationId: string, file: File) {
    const updated = await api.locations.uploadPhoto(tripId, locationId, file);
    setLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? updated : loc))
    );
    syncLocationSummary(locationId, () => ({
      user_image_url: updated.user_image_url,
    }));
  }

  async function handlePhotoReset(locationId: string) {
    await api.locations.deletePhoto(tripId, locationId);
    setLocations((prev) =>
      prev.map((loc) =>
        loc.id === locationId ? { ...loc, user_image_url: null } : loc
      )
    );
    syncLocationSummary(locationId, () => ({ user_image_url: null }));
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
          className="mb-3 -ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
              {trip.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {dateDisplay && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand-strong">
                  <Calendar size={12} />
                  {dateDisplay}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                <Users size={12} />1 Traveler
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                aria-label="Share trip"
              >
                <Share2 size={14} />
                Share
              </button>
              <Button
                className="rounded-full bg-primary px-5 py-1.5 text-sm font-semibold text-white hover:bg-primary-strong"
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
      <div className="border-b border-border">
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
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
                ? "border-brand text-brand"
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
          {/* Toolbar row */}
          {locations.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:max-w-xs">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="search"
                  autoComplete="off"
                  placeholder="Search locations…"
                  value={locationNameSearch}
                  onChange={(e) => setLocationNameSearch(e.target.value)}
                  className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  aria-label="Search by location name"
                />
              </div>
              {cities.size >= 2 && (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                    groupByCity
                      ? "bg-brand-muted text-brand-strong"
                      : "text-foreground hover:bg-brand-muted"
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
                    "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                    groupByPerson
                      ? "bg-brand-muted text-brand-strong"
                      : "text-foreground hover:bg-brand-muted"
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
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong"
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
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                        onClick={() => setAddingLocation(true)}
                      >
                        <MapPin size={16} className="text-primary" />
                        Paste Link
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground"
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
                    ? "bg-brand text-white"
                    : "border border-border bg-card text-muted-foreground hover:bg-brand-muted"
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
                      ? "bg-brand text-white"
                      : "border border-border bg-card text-muted-foreground hover:bg-brand-muted"
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
            <p className="py-4 text-sm text-muted-foreground">
              No locations match &quot;{locationNameSearch.trim()}&quot;. Try a
              different search or clear the search box.
            </p>
          ) : groupedLocations ? (
            <div className="space-y-6">
              {groupedLocations.map(([groupName, locs]) => (
                <div key={groupName}>
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
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
        <ItineraryTab
          trip={trip}
          tripId={tripId}
          locations={locations}
          itineraryState={itineraryState}
        />
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
