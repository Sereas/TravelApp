"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
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
import { TripDateRangePicker } from "@/components/trips/TripDateRangePicker";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { ShareTripDialog } from "@/components/trips/ShareTripDialog";
import { TripGradient } from "@/components/trips/TripGradient";
import { ImportGoogleListDialog } from "@/components/locations/ImportGoogleListDialog";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { format } from "date-fns";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  Compass,
  List,
  MapPin,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useItineraryState } from "@/features/itinerary/useItineraryState";

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
    oldStart: string;
    oldEnd: string;
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
  const [editingName, setEditingName] = useState(false);
  const nameCancelledRef = useRef(false);

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

  function handleTripUpdated(updated: Trip) {
    setTrip(updated);
    setEditingTrip(false);
    fetchItinerary();
  }

  async function handleInlineNameSave(name: string) {
    try {
      const updated = await api.trips.update(tripId, { name });
      setTrip(updated);
    } catch {
      // Silently revert — the UI already shows the old value
    }
  }

  async function handleDateRangeSave(newStart: string, newEnd: string) {
    if (!trip) return;
    const prev = { ...trip };
    setTrip({ ...trip, start_date: newStart, end_date: newEnd });

    const payload: TripUpdatePayload = {
      name: trip.name,
      start_date: newStart,
      end_date: newEnd,
    };

    try {
      const updated = await handleBeforeTripSave(
        payload,
        prev.start_date,
        prev.end_date,
      );
      setTrip(updated);
      fetchItinerary();
    } catch {
      setTrip(prev);
    }
  }

  /**
   * Called by EditTripForm before saving when dates change.
   * If reconciliation is needed, shows the dialog and returns a promise
   * that resolves when the user picks an action and the save completes.
   */
  async function handleBeforeTripSave(
    payload: TripUpdatePayload,
    originalStart?: string | null,
    originalEnd?: string | null,
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

    // If ALL orphaned days are empty (no locations), silently delete them
    const allEmpty = orphaned.every(
      (day) => !day.options.some((opt) => opt.locations.length > 0)
    );
    if (allEmpty) {
      await api.itinerary.reconcileDays(tripId, {
        action: "delete",
        day_ids: orphaned.map((d) => d.id),
      });
      return api.trips.update(tripId, payload);
    }

    // Some days have content — show reconciliation dialog
    const oldStart = originalStart ?? payload.start_date!;
    const oldEnd = originalEnd ?? payload.end_date!;
    return new Promise<Trip>((resolve, reject) => {
      setDateChangeDialog({ payload, oldStart, oldEnd, resolve, reject });
    });
  }

  async function handleDateChangeConfirm(result: DateChangeResult) {
    if (!dateChangeDialog) return;
    const { payload, resolve, reject } = dateChangeDialog;

    try {
      if (result.action === "per_day") {
        // Per-day decisions: delete some, keep (clear dates on) others
        if (result.deleteDayIds && result.deleteDayIds.length > 0) {
          await api.itinerary.reconcileDays(tripId, {
            action: "delete",
            day_ids: result.deleteDayIds,
          });
        }
        if (result.keepDayIds && result.keepDayIds.length > 0) {
          await api.itinerary.reconcileDays(tripId, {
            action: "clear_dates",
            day_ids: result.keepDayIds,
          });
        }
      } else {
        // Bulk action (shift, clear_dates, delete)
        await api.itinerary.reconcileDays(tripId, {
          action: result.action,
          offset_days: result.offsetDays,
          day_ids: result.dayIds,
        });
      }

      // Save the trip dates
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
      {/* Trip header */}
      <div className="relative -mx-4 -mt-4 px-4 pt-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        {/* Generative gradient banner */}
        <TripGradient
          name={trip.name}
          className="absolute inset-x-0 top-0 h-28 opacity-30"
        />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-background" />
        <div className="relative flex items-center justify-between">
          <button
            type="button"
            className="-ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => router.push("/trips")}
          >
            <ChevronLeft size={14} className="shrink-0" />
            Trips
          </button>
          <div className="flex items-center gap-0.5">
            {/* Travelers */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Travelers"
                >
                  <div className="flex -space-x-1.5">
                    {Array.from(addedByEmails)
                      .slice(0, 3)
                      .map((email) => (
                        <div
                          key={email}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold uppercase text-brand ring-2 ring-background"
                          title={email}
                        >
                          {email[0]}
                        </div>
                      ))}
                    {addedByEmails.size === 0 && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 ring-2 ring-background">
                        <User size={10} className="text-brand" />
                      </div>
                    )}
                    {addedByEmails.size > 3 && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-background">
                        +{addedByEmails.size - 3}
                      </div>
                    )}
                  </div>
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
            <button
              type="button"
              className="rounded-full border border-border/50 bg-card p-2 text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:text-primary hover:shadow"
              aria-label="Share trip"
              onClick={() => setShareDialogOpen(true)}
            >
              <Share2 size={15} />
            </button>
            <button
              type="button"
              className="rounded-full border border-border/50 bg-card p-2 text-muted-foreground shadow-sm transition-all hover:border-primary/30 hover:text-primary hover:shadow"
              onClick={() => {
                setEditingName(false);
                setEditingTrip(true);
              }}
              aria-label="Edit trip"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>

        {editingTrip && (
          <EditTripForm
            trip={trip}
            onUpdated={handleTripUpdated}
            onCancel={() => setEditingTrip(false)}
            onDelete={handleDeleteTrip}
            onBeforeSave={handleBeforeTripSave}
          />
        )}
        {!editingTrip && (
          <motion.div
            className="relative pb-4 pt-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {editingName ? (
              <input
                type="text"
                aria-label="Trip name"
                autoFocus
                defaultValue={trip.name}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    nameCancelledRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  if (nameCancelledRef.current) {
                    nameCancelledRef.current = false;
                    setEditingName(false);
                    return;
                  }
                  const val = e.target.value.trim();
                  setEditingName(false);
                  if (val && val !== trip.name) {
                    handleInlineNameSave(val);
                  }
                }}
                className="w-full bg-transparent text-3xl font-bold tracking-tight text-foreground outline-none ring-1 ring-primary/30 rounded-lg px-1 sm:text-4xl"
              />
            ) : (
              <button
                type="button"
                aria-label={trip.name}
                onClick={() => setEditingName(true)}
                className="cursor-text text-left text-3xl font-bold tracking-tight text-foreground rounded-lg px-1 -mx-1 transition-colors hover:bg-muted/50 sm:text-4xl"
              >
                {trip.name}
              </button>
            )}

            {/* Meta line */}
            <motion.p
              className="mt-2 text-sm tracking-wide text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              <TripDateRangePicker
                startDate={trip.start_date}
                endDate={trip.end_date}
                onDateRangeChange={handleDateRangeSave}
              />
              {(trip.start_date || trip.end_date) && <>&ensp;/&ensp;</>}
              {locations.length} places
              {itinerary && itinerary.days.length > 0 && (
                <> &ensp;/&ensp; {itinerary.days.length} days</>
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
                    <>
                      {" "}
                      &ensp;/&ensp; {cities.size}{" "}
                      {cities.size === 1 ? "city" : "cities"}
                    </>
                  ) : null;
                })()}
            </motion.p>

            {/* Progress */}
            {itinerary &&
              itinerary.days.length > 0 &&
              (() => {
                const totalDays = itinerary.days.length;
                const plannedDays = itinerary.days.filter((day) =>
                  day.options.some((opt) => opt.locations.length > 0)
                ).length;
                const pct = Math.round((plannedDays / totalDays) * 100);
                return pct < 100 ? (
                  <motion.div
                    className="mt-3 flex items-center gap-3"
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
                    style={{ transformOrigin: "left" }}
                  >
                    <Progress value={pct} className="h-1 flex-1" />
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </motion.div>
                ) : null;
              })()}
          </motion.div>
        )}
      </div>

      {/* Tabs — bold primary navigation */}
      <div className="sticky top-14 z-30 -mx-4 bg-background/95 px-4 pb-2 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <nav className="flex gap-2" role="tablist" aria-label="Trip sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "locations"}
            aria-controls="tab-panel-locations"
            id="tab-locations"
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "locations"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border/60 bg-card text-muted-foreground shadow-sm hover:border-primary/30 hover:text-foreground"
            )}
            onClick={() => setActiveTab("locations")}
          >
            <MapPin size={15} />
            Places
            {locations.length > 0 && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                  activeTab === "locations"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
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
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
              activeTab === "itinerary"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border/60 bg-card text-muted-foreground shadow-sm hover:border-primary/30 hover:text-foreground"
            )}
            onClick={() => setActiveTab("itinerary")}
          >
            <Compass size={15} />
            Itinerary
          </button>
        </nav>
      </div>

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
                      <ImportGoogleListDialog
                        tripId={tripId}
                        trigger={
                          <button
                            type="button"
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                          >
                            <List size={16} className="text-brand" />
                            Import Google List
                          </button>
                        }
                        onImported={fetchData}
                      />
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
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button onClick={() => setAddingLocation(true)}>
                  <MapPin size={16} className="mr-1.5" />
                  Add a location
                </Button>
                <ImportGoogleListDialog
                  tripId={tripId}
                  trigger={
                    <Button variant="outline">
                      <List size={16} className="mr-1.5" />
                      Import Google List
                    </Button>
                  }
                  onImported={fetchData}
                />
              </div>
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
          const { payload, oldStart, oldEnd } = dateChangeDialog;
          const newStart = payload.start_date!;
          const newEnd = payload.end_date!;
          const orphaned = getOrphanedDays(newStart, newEnd);

          // Compute offset and whether shift is viable
          const hasOldDates = !!(oldStart && oldEnd);
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
