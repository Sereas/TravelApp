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
import { ShareTripDialog } from "@/components/trips/ShareTripDialog";
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
  Route,
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
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [groupByCity, setGroupByCity] = useState(false);
  const [groupByPerson, setGroupByPerson] = useState(false);
  const [locationNameSearch, setLocationNameSearch] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [isPickMode, setIsPickMode] = useState(false);

  const [activeTab, setActiveTab] = useState<"locations" | "itinerary">(
    "locations"
  );
  const itineraryState = useItineraryState({
    tripId,
    enabled: true,
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
    const base = cityFilter
      ? locations.filter((loc) => (loc.city || "No city") === cityFilter)
      : locations;
    const counts: Record<string, number> = {};
    for (const loc of base) {
      const cat = loc.category ?? "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [locations, cityFilter]);

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
    if (cityFilter) {
      list = list.filter((loc) => (loc.city || "No city") === cityFilter);
    }
    if (locationNameSearch.trim()) {
      const q = locationNameSearch.trim().toLowerCase();
      list = list.filter((loc) => (loc.name ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [locations, categoryFilter, cityFilter, locationNameSearch]);

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
    <div>
      {/* Trip hero banner */}
      <div
        className={cn(
          "grain-overlay -mx-4 -mt-4 overflow-hidden rounded-b-3xl bg-gradient-to-br from-brand/10 via-background to-primary/8 px-4 pb-6 pt-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 transition-opacity duration-300",
          isPickMode && "opacity-20 pointer-events-none"
        )}
      >
        <button
          type="button"
          className="mb-4 -ml-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
          <div className="space-y-4">
            {/* Title row */}
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm ring-1 ring-brand/10">
                <MapPin size={28} className="text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {trip.name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {dateDisplay && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-brand-strong shadow-sm ring-1 ring-brand/10">
                      <Calendar size={12} />
                      {dateDisplay}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-white"
                  aria-label="Share trip"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 size={14} />
                  Share
                </button>
                <Button
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-primary-strong"
                  onClick={() => setEditingTrip(true)}
                  aria-label="Edit trip"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit Trip
                </Button>
              </div>
            </div>

            {/* Quick stats + avatars row */}
            <div className="flex items-center gap-3">
              {/* Quick stats */}
              <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border/50">
                <MapPin size={11} className="text-brand" />
                <span className="font-semibold text-foreground">
                  {locations.length}
                </span>{" "}
                {locations.length === 1 ? "place" : "places"}
              </div>
              {itinerary && itinerary.days.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border/50">
                  <Calendar size={11} className="text-brand" />
                  <span className="font-semibold text-foreground">
                    {itinerary.days.length}
                  </span>{" "}
                  days
                </div>
              )}
              {itinerary &&
                (() => {
                  const cities = new Set<string>();
                  itinerary.days.forEach((day) =>
                    day.options.forEach((opt) => {
                      if (opt.starting_city) cities.add(opt.starting_city);
                      if (opt.ending_city) cities.add(opt.ending_city);
                    })
                  );
                  return cities.size > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border/50">
                      <Route size={11} className="text-brand" />
                      <span className="font-semibold text-foreground">
                        {cities.size}
                      </span>{" "}
                      {cities.size === 1 ? "city" : "cities"}
                    </div>
                  ) : null;
                })()}

              <div className="flex-1" />

              {/* Travelers */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border/50 transition-colors hover:bg-white hover:text-foreground"
                  >
                    <Users size={13} className="text-brand" />
                    <div className="flex -space-x-1.5">
                      {Array.from(addedByEmails)
                        .slice(0, 3)
                        .map((email) => (
                          <div
                            key={email}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold uppercase text-brand ring-2 ring-white"
                            title={email}
                          >
                            {email[0]}
                          </div>
                        ))}
                      {addedByEmails.size === 0 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 ring-2 ring-white">
                          <User size={10} className="text-brand" />
                        </div>
                      )}
                      {addedByEmails.size > 3 && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-white">
                          +{addedByEmails.size - 3}
                        </div>
                      )}
                    </div>
                    <span className="font-medium">
                      {addedByEmails.size || 1}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-0">
                  <div className="border-b px-3 py-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Travelers
                    </h4>
                  </div>
                  <div className="max-h-48 overflow-y-auto py-1">
                    {addedByEmails.size === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        No travelers yet
                      </div>
                    )}
                    {Array.from(addedByEmails).map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-2.5 px-3 py-1.5"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold uppercase text-brand">
                          {email[0]}
                        </div>
                        <span className="min-w-0 truncate text-sm text-foreground">
                          {email}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t px-3 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand transition-colors hover:bg-brand/10"
                      onClick={() => {
                        /* TODO: invite flow */
                      }}
                    >
                      <Plus size={14} />
                      Invite traveler
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Trip progress bar */}
            {itinerary &&
              itinerary.days.length > 0 &&
              (() => {
                const totalDays = itinerary.days.length;
                const plannedDays = itinerary.days.filter((day) =>
                  day.options.some((opt) => opt.locations.length > 0)
                ).length;
                const pct = Math.round((plannedDays / totalDays) * 100);
                return (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Planning progress</span>
                      <span>
                        {plannedDays}/{totalDays} days ·{" "}
                        <span className="text-brand">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-border/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Sticky tabs bar */}
      <nav
        className={cn(
          "sticky top-14 z-30 -mx-4 flex gap-2 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 transition-opacity duration-300",
          isPickMode && "opacity-20 pointer-events-none"
        )}
        role="tablist"
        aria-label="Trip sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "locations"}
          aria-controls="tab-panel-locations"
          id="tab-locations"
          className={cn(
            "rounded-full px-5 py-2 text-sm font-semibold tracking-wide transition-all",
            activeTab === "locations"
              ? "bg-brand text-white shadow-md"
              : "bg-white/70 text-muted-foreground ring-1 ring-border hover:bg-white hover:text-foreground"
          )}
          onClick={() => setActiveTab("locations")}
        >
          Locations
          {locations.length > 0 && (
            <span className="ml-1.5 text-xs opacity-80">
              {locations.length}
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
            "rounded-full px-5 py-2 text-sm font-semibold tracking-wide transition-all",
            activeTab === "itinerary"
              ? "bg-brand text-white shadow-md"
              : "bg-white/70 text-muted-foreground ring-1 ring-border hover:bg-white hover:text-foreground"
          )}
          onClick={() => setActiveTab("itinerary")}
        >
          Itinerary
        </button>
      </nav>

      {activeTab === "locations" && (
        <section
          id="tab-panel-locations"
          role="tabpanel"
          aria-labelledby="tab-locations"
          className="mt-6"
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
                <Popover
                  open={cityPopoverOpen}
                  onOpenChange={setCityPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                        groupByCity || cityFilter
                          ? "bg-brand-muted text-brand-strong"
                          : "text-foreground hover:bg-brand-muted"
                      )}
                    >
                      <Building2 size={14} />
                      {cityFilter
                        ? cityFilter
                        : groupByCity
                          ? "Grouped by city"
                          : "City"}
                      <ChevronDown size={12} className="opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-48 p-1.5"
                    align="start"
                    sideOffset={6}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        !cityFilter && !groupByCity
                          ? "bg-brand-muted font-medium text-brand-strong"
                          : "text-foreground hover:bg-muted"
                      )}
                      onClick={() => {
                        setCityFilter(null);
                        setCategoryFilter(null);
                        setGroupByCity(false);
                        setCityPopoverOpen(false);
                      }}
                    >
                      All cities
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        groupByCity && !cityFilter
                          ? "bg-brand-muted font-medium text-brand-strong"
                          : "text-foreground hover:bg-muted"
                      )}
                      onClick={() => {
                        setGroupByCity(true);
                        setCityFilter(null);
                        setCategoryFilter(null);
                        setGroupByPerson(false);
                        setCityPopoverOpen(false);
                      }}
                    >
                      Group by city
                    </button>
                    <div className="my-1 border-t border-border" />
                    {Array.from(cities)
                      .sort((a, b) => a.localeCompare(b))
                      .map((city) => (
                        <button
                          key={city}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            cityFilter === city
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            const next = cityFilter === city ? null : city;
                            setCityFilter(next);
                            setCategoryFilter(null);
                            setGroupByCity(false);
                            setCityPopoverOpen(false);
                          }}
                        >
                          <MapPin
                            size={12}
                            className="shrink-0 text-muted-foreground"
                          />
                          {city}
                        </button>
                      ))}
                  </PopoverContent>
                </Popover>
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
            <div className="space-y-8">
              {groupedLocations.map(([groupName, locs]) => (
                <div key={groupName}>
                  <div className="mb-4 flex items-center gap-3">
                    {groupByCity && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                        <MapPin size={14} className="text-brand" />
                      </div>
                    )}
                    {groupByPerson && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <User size={14} className="text-primary" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        {groupName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {locs.length}{" "}
                        {locs.length === 1 ? "location" : "locations"}
                      </p>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>
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
        <div className="mt-6">
          <ItineraryTab
            trip={trip}
            tripId={tripId}
            locations={locations}
            itineraryState={itineraryState}
            onPickModeChange={setIsPickMode}
          />
        </div>
      )}

      <ShareTripDialog
        tripId={tripId}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />

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
