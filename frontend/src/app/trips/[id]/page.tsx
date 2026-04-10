"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { api, type Trip, type Location } from "@/lib/api";
import { LocationCard } from "@/components/locations/LocationCard";
import { AddLocationForm } from "@/components/locations/AddLocationForm";
import { SmartLocationInput } from "@/components/locations/SmartLocationInput";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import { ImportGoogleListDialog } from "@/components/locations/ImportGoogleListDialog";
import { LocationsMapDialog } from "@/components/locations/LocationsMapDialog";
// Trip Summary temporarily disabled — kept for planned re-enable of TripSummaryCard sidebar
// import { TripSummaryCard } from "@/components/trips/TripSummaryCard";
import { SidebarLocationMap } from "@/components/locations/SidebarLocationMap";
import { type TripUpdatePayload } from "@/components/trips/EditTripForm";
import {
  DateChangeDialog,
  type DateChangeResult,
} from "@/components/trips/DateChangeDialog";
import { TripDateRangePicker } from "@/components/trips/TripDateRangePicker";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { ShareTripDialog } from "@/components/trips/ShareTripDialog";
import { TripGradient } from "@/components/trips/TripGradient";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { format } from "date-fns";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  Compass,
  DollarSign,
  FileText,
  FileUp,
  Link2,
  Map,
  MapPin,
  PenLine,
  Search,
  Tag,
  X,
  Trash2,
  User,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useItineraryState } from "@/features/itinerary/useItineraryState";

// Sidebar pin click → scroll + highlight timing. The delay gives the
// smooth-scroll time to settle so the keyframe peak plays after the card
// is actually in view. Total on-screen time for the pulse is roughly
// HIGHLIGHT_START_DELAY_MS + HIGHLIGHT_ANIMATION_MS once the scroll ends.
const HIGHLIGHT_START_DELAY_MS = 350;
const HIGHLIGHT_ANIMATION_MS = 2000;

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params.id;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateChangeDialog, setDateChangeDialog] = useState<{
    payload: TripUpdatePayload;
    oldStart: string;
    oldEnd: string;
    resolve: (trip: Trip) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const [addingLocation, setAddingLocation] = useState<
    | null
    | { mode: "manual" }
    | { mode: "link-entry" }
    | { mode: "prefilled"; googleLink?: string; name?: string }
  >(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [focusedLocation, setFocusedLocation] = useState<{
    id: string;
    seq: number;
  } | null>(null);
  const focusSeqRef = useRef(0);
  // Transient highlight flash when a sidebar map pin is clicked. Only one
  // card can be highlighted at a time; clicking a new pin cancels the
  // previous highlight immediately. Tracked via a ref so we can clear the
  // scheduled cleanup on re-click or unmount.
  const [highlightedLocationId, setHighlightedLocationId] = useState<
    string | null
  >(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [personPopoverOpen, setPersonPopoverOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<"city" | "category" | "person" | null>(
    null
  );
  const [locationNameSearch, setLocationNameSearch] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const nameCancelledRef = useRef(false);

  const [activeTab, setActiveTab] = useState<
    "locations" | "itinerary" | "budget" | "documents"
  >("locations");
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
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
    let base = locations;
    if (cityFilter) {
      base = base.filter((loc) => (loc.city || "No city") === cityFilter);
    }
    if (personFilter) {
      base = base.filter(
        (loc) => (loc.added_by_email || "Unknown") === personFilter
      );
    }
    const counts: Record<string, number> = {};
    for (const loc of base) {
      const cat = loc.category ?? "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [locations, cityFilter, personFilter]);

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
    if (personFilter) {
      list = list.filter(
        (loc) => (loc.added_by_email || "Unknown") === personFilter
      );
    }
    if (locationNameSearch.trim()) {
      const q = locationNameSearch.trim().toLowerCase();
      list = list.filter((loc) => (loc.name ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [locations, categoryFilter, cityFilter, personFilter, locationNameSearch]);

  const groupedLocations = useMemo(() => {
    if (!groupBy) return null;
    const groups: Record<string, Location[]> = {};
    for (const loc of filteredLocations) {
      const key =
        groupBy === "city"
          ? loc.city || "No city"
          : groupBy === "category"
            ? (loc.category ?? "Uncategorized")
            : loc.added_by_email || "Unknown";
      (groups[key] ??= []).push(loc);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLocations, groupBy]);

  // When a sidebar map pin is clicked: (1) smoothly scroll the card into
  // the vertical center of the viewport, (2) AFTER the scroll has had time
  // to land, mark the card as highlighted so the CSS pulse plays out while
  // the card is actually in view, (3) clear the highlight once the
  // animation completes. Any in-flight highlight timeout is cancelled
  // first so rapid clicks don't leak timers.
  //
  // Note: we deliberately do NOT bump `focusedLocation` here — that would
  // trigger the map's focus effect (flyTo + zoom-in), which the user
  // doesn't want for pin clicks. The pin's own "selected" visual is
  // already handled locally by the marker's click listener inside
  // ItineraryDayMap before this callback fires.
  const handlePinClick = useCallback((locationId: string) => {
    // Cancel any in-flight highlight (pre-scroll wait or post-apply clear)
    // and drop any currently-visible highlight so a rapid re-click on a
    // second pin gives the user an instant visual reset.
    if (highlightTimeoutRef.current != null) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedLocationId(null);

    // Defer querySelector by a frame so any pending DOM commit lands first,
    // then kick off the smooth scroll.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-location-id="${CSS.escape(locationId)}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    // Delay applying the highlight class until the smooth scroll has had
    // time to mostly complete. Otherwise the keyframe peak plays out while
    // the card is still offscreen and the user never sees it. For an
    // already-visible card the only downside is a brief beat before the
    // flash — barely perceptible.
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedLocationId(locationId);
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedLocationId((prev) => (prev === locationId ? null : prev));
        highlightTimeoutRef.current = null;
      }, HIGHLIGHT_ANIMATION_MS);
    }, HIGHLIGHT_START_DELAY_MS);
  }, []);

  // Cancel any pending highlight timeout on unmount so React's strict-mode
  // double-invocation and route changes don't leave a dangling callback.
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current != null) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

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

  async function handleInlineNameSave(name: string) {
    if (!trip) return;
    const prev = { ...trip };
    setTrip({ ...trip, name });
    try {
      const updated = await api.trips.update(tripId, { name });
      setTrip(updated);
    } catch {
      setTrip(prev);
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
        prev.end_date
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
    originalEnd?: string | null
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

  function handleSmartInputSubmit(value: string, isUrl: boolean) {
    setAddingLocation(
      isUrl
        ? { mode: "prefilled", googleLink: value }
        : { mode: "prefilled", name: value }
    );
  }

  function handleLocationAdded(
    location: Location,
    scheduleDayId?: string | null
  ) {
    setLocations((prev) => [...prev, location]);
    setAddingLocation(null);
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

  // Note-only save path used by the map pin popup. Mirrors
  // `handleLocationUpdated`: persist to backend, update local state and the
  // itinerary summary. We let `handleMapNoteSave` throw on failure so the
  // popup can display an inline error and stay in edit mode.
  async function handleMapNoteSave(locationId: string, nextNote: string) {
    const updated = await api.locations.update(tripId, locationId, {
      note: nextNote,
    });
    setLocations((prev) =>
      prev.map((loc) => (loc.id === locationId ? updated : loc))
    );
    syncLocationSummary(locationId, () => ({ note: updated.note }));
  }

  // Delete path used by the map pin popup. Separate from `handleDeleteLocation`
  // because the popup surfaces errors inline in its own confirm row —
  // duplicating them to the page-level `ErrorBanner` via `setError(...)` would
  // show two simultaneous error UIs for a single failure. We re-throw so the
  // popup's inline `deleteError` state picks up the rejection.
  async function handleMapDelete(locationId: string) {
    await api.locations.delete(tripId, locationId);
    setLocations((prev) => prev.filter((loc) => loc.id !== locationId));
    // Fire-and-forget refresh: the delete already succeeded, so a failure
    // in the itinerary refetch shouldn't surface as an unhandled rejection.
    fetchItinerary().catch(() => {
      /* stale itinerary tree is acceptable until the next interaction */
    });
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
        isHighlighted={highlightedLocationId === loc.id}
        onEdit={() => setEditingLocationId(loc.id)}
        onCardClick={() => {
          focusSeqRef.current += 1;
          setFocusedLocation({ id: loc.id, seq: focusSeqRef.current });
        }}
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
          className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-30"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-background" />
        {/* Back link */}
        <button
          type="button"
          className="-ml-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary/70 transition-colors hover:text-primary"
          onClick={() => router.push("/trips")}
        >
          <ChevronLeft size={14} className="shrink-0" />
          Back to Trips
        </button>

        <motion.div
          className="relative pb-3 pt-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Status line: PLANNING badge + dates (left) ... progress + share (right) */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-brand-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-strong">
                Planning
              </span>
              <TripDateRangePicker
                startDate={trip.start_date}
                endDate={trip.end_date}
                onDateRangeChange={handleDateRangeSave}
              />
            </div>
            <div className="flex items-center gap-4">
              {itinerary &&
                itinerary.days.length > 0 &&
                (() => {
                  const totalDays = itinerary.days.length;
                  const plannedDays = itinerary.days.filter((day) =>
                    day.options.some((opt) => opt.locations.length > 0)
                  ).length;
                  return (
                    <div className="hidden items-center gap-2.5 sm:flex">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Progress
                      </span>
                      <Progress
                        value={Math.round((plannedDays / totalDays) * 100)}
                        className="h-1.5 w-24"
                      />
                      <span className="text-xs font-semibold tabular-nums text-primary">
                        {plannedDays}/{totalDays} days
                      </span>
                    </div>
                  );
                })()}
              <button
                type="button"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md"
                onClick={() => setShareDialogOpen(true)}
              >
                Share
              </button>
            </div>
          </div>

          {/* Trip name */}
          <div className="mt-1">
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
          </div>
        </motion.div>
      </div>

      {/* Tabs — underline navigation */}
      <div className="sticky top-14 z-30 -mx-4 bg-background/95 px-4 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <nav
          className="flex gap-6 border-b border-border"
          role="tablist"
          aria-label="Trip sections"
        >
          {(
            [
              { key: "locations", label: "Places", icon: MapPin },
              { key: "itinerary", label: "Itinerary", icon: Compass },
              {
                key: "budget",
                label: "Budget",
                icon: DollarSign,
                disabled: true,
              },
              {
                key: "documents",
                label: "Documents",
                icon: FileText,
                disabled: true,
              },
            ] as const
          ).map(({ key, label, icon: Icon, ...rest }) => {
            const disabled = "disabled" in rest && rest.disabled;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                aria-disabled={disabled || undefined}
                aria-controls={`tab-panel-${key}`}
                id={`tab-${key}`}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
                  disabled
                    ? "cursor-not-allowed border-transparent text-muted-foreground/40"
                    : activeTab === key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => !disabled && setActiveTab(key)}
              >
                <Icon size={15} />
                {label}
                {disabled && (
                  <span className="text-[10px] font-normal text-muted-foreground/40">
                    Soon
                  </span>
                )}
                {key === "locations" && locations.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                    {locations.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "locations" && (
        <section
          id="tab-panel-locations"
          role="tabpanel"
          aria-labelledby="tab-locations"
          className="mt-8"
        >
          <div
            className={
              locations.length > 0
                ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]"
                : ""
            }
          >
            {/* Left column */}
            <div>
              {/* Smart location input — visible only when locations exist */}
              {!addingLocation && locations.length > 0 && (
                <SmartLocationInput
                  tripId={tripId}
                  onSubmit={handleSmartInputSubmit}
                  onImported={fetchData}
                />
              )}

              {/* Heading row with View Map */}
              {locations.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-foreground">
                    {filteredLocations.length}{" "}
                    {filteredLocations.length === 1 ? "Place" : "Places"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setMapDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    View Map
                    <Map size={15} aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Toolbar row */}
              {locations.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {/* Search filter pill */}
                  {searchExpanded ? (
                    <div className="relative flex items-center">
                      <Search
                        size={14}
                        className="absolute left-2.5 text-muted-foreground"
                      />
                      <input
                        ref={searchInputRef}
                        type="search"
                        autoComplete="off"
                        autoFocus
                        placeholder="Search…"
                        value={locationNameSearch}
                        onChange={(e) => setLocationNameSearch(e.target.value)}
                        onBlur={() => {
                          if (!locationNameSearch.trim()) {
                            setSearchExpanded(false);
                          }
                        }}
                        className="h-8 w-44 rounded-full border border-border bg-card pl-8 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                        aria-label="Search by location name"
                      />
                      <button
                        type="button"
                        className="absolute right-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setLocationNameSearch("");
                          setSearchExpanded(false);
                        }}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                        locationNameSearch
                          ? "bg-brand-muted text-brand-strong"
                          : "text-foreground hover:bg-brand-muted"
                      )}
                      onClick={() => {
                        setSearchExpanded(true);
                      }}
                    >
                      <Search size={14} />
                      Search
                    </button>
                  )}

                  {/* City filter */}
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
                            groupBy === "city" || cityFilter
                              ? "bg-brand-muted text-brand-strong"
                              : "text-foreground hover:bg-brand-muted"
                          )}
                        >
                          <Building2 size={14} />
                          {cityFilter
                            ? cityFilter
                            : groupBy === "city"
                              ? "Grouped by city"
                              : "City"}
                          <ChevronDown size={12} className="opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="max-h-72 w-auto min-w-[12rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-1.5"
                        align="start"
                        sideOffset={6}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            !cityFilter && groupBy !== "city"
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setCityFilter(null);
                            setGroupBy(null);
                            setCityPopoverOpen(false);
                          }}
                        >
                          All cities
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            groupBy === "city" && !cityFilter
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setGroupBy("city");
                            setCityFilter(null);
                            setCategoryFilter(null);
                            setPersonFilter(null);
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
                                "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                cityFilter === city
                                  ? "bg-brand-muted font-medium text-brand-strong"
                                  : "text-foreground hover:bg-muted"
                              )}
                              onClick={() => {
                                const next = cityFilter === city ? null : city;
                                setCityFilter(next);
                                setCategoryFilter(null);
                                setGroupBy(null);
                                setCityPopoverOpen(false);
                              }}
                            >
                              <MapPin
                                size={12}
                                className="shrink-0 text-muted-foreground"
                              />
                              <span className="truncate">{city}</span>
                            </button>
                          ))}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Category filter */}
                  {categoryOptions.length >= 2 && (
                    <Popover
                      open={categoryPopoverOpen}
                      onOpenChange={setCategoryPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                            categoryFilter || groupBy === "category"
                              ? "bg-brand-muted text-brand-strong"
                              : "text-foreground hover:bg-brand-muted"
                          )}
                        >
                          <Tag size={14} />
                          {categoryFilter
                            ? categoryFilter
                            : groupBy === "category"
                              ? "Grouped by category"
                              : "Category"}
                          <ChevronDown size={12} className="opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="max-h-72 w-52 overflow-y-auto p-1.5"
                        align="start"
                        sideOffset={6}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            !categoryFilter && groupBy !== "category"
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setCategoryFilter(null);
                            setGroupBy(null);
                            setCategoryPopoverOpen(false);
                          }}
                        >
                          All categories
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            groupBy === "category" && !categoryFilter
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setGroupBy("category");
                            setCategoryFilter(null);
                            setPersonFilter(null);
                            setCategoryPopoverOpen(false);
                          }}
                        >
                          Group by category
                        </button>
                        <div className="my-1 border-t border-border" />
                        {categoryOptions.map(([cat, count]) => (
                          <button
                            key={cat}
                            type="button"
                            className={cn(
                              "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
                              categoryFilter === cat
                                ? "bg-brand-muted font-medium text-brand-strong"
                                : "text-foreground hover:bg-muted"
                            )}
                            onClick={() => {
                              setCategoryFilter(
                                categoryFilter === cat ? null : cat
                              );
                              setGroupBy(null);
                              setCategoryPopoverOpen(false);
                            }}
                          >
                            {cat}
                            <span className="text-xs text-muted-foreground">
                              {count}
                            </span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}

                  {/* Added by filter */}
                  {addedByEmails.size >= 2 && (
                    <Popover
                      open={personPopoverOpen}
                      onOpenChange={setPersonPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
                            personFilter || groupBy === "person"
                              ? "bg-brand-muted text-brand-strong"
                              : "text-foreground hover:bg-brand-muted"
                          )}
                        >
                          <User size={14} />
                          {personFilter
                            ? personFilter.split("@")[0]
                            : groupBy === "person"
                              ? "Grouped by person"
                              : "Added by"}
                          <ChevronDown size={12} className="opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="max-h-72 w-56 overflow-y-auto p-1.5"
                        align="start"
                        sideOffset={6}
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            !personFilter && groupBy !== "person"
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setPersonFilter(null);
                            setGroupBy(null);
                            setPersonPopoverOpen(false);
                          }}
                        >
                          Everyone
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            groupBy === "person" && !personFilter
                              ? "bg-brand-muted font-medium text-brand-strong"
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => {
                            setGroupBy("person");
                            setPersonFilter(null);
                            setCityFilter(null);
                            setCategoryFilter(null);
                            setPersonPopoverOpen(false);
                          }}
                        >
                          Group by person
                        </button>
                        <div className="my-1 border-t border-border" />
                        {Array.from(addedByEmails)
                          .sort((a, b) => a.localeCompare(b))
                          .map((email) => (
                            <button
                              key={email}
                              type="button"
                              title={email}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                personFilter === email
                                  ? "bg-brand-muted font-medium text-brand-strong"
                                  : "text-foreground hover:bg-muted"
                              )}
                              onClick={() => {
                                const next =
                                  personFilter === email ? null : email;
                                setPersonFilter(next);
                                setGroupBy(null);
                                setPersonPopoverOpen(false);
                              }}
                            >
                              <User
                                size={12}
                                className="shrink-0 text-muted-foreground"
                              />
                              {email.split("@")[0]}
                            </button>
                          ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}

              {addingLocation && (
                <AddLocationForm
                  tripId={tripId}
                  existingLocations={locations}
                  availableDays={availableDays}
                  initialGoogleLink={
                    addingLocation.mode === "prefilled"
                      ? addingLocation.googleLink
                      : undefined
                  }
                  initialName={
                    addingLocation.mode === "prefilled"
                      ? addingLocation.name
                      : undefined
                  }
                  linkEntryMode={addingLocation.mode === "link-entry"}
                  onAdded={handleLocationAdded}
                  onCancel={() => setAddingLocation(null)}
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
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center py-12 text-center"
                >
                  <h2 className="text-3xl font-bold tracking-tight text-foreground">
                    Ready to build your{" "}
                    <span className="italic text-primary">pool?</span>
                  </h2>
                  <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                    Choose how you want to add your first spots. Your pool is a
                    curated collection of inspirations for your next journey.
                  </p>

                  <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Paste a Link — recommended */}
                    <div className="relative flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
                      <span className="absolute -top-3 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Recommended
                      </span>
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Link2 size={22} className="text-primary" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">
                        Paste a Link
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Found a spot on Google Maps? Paste the link and
                        we&#39;ll fill in the details automatically.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setAddingLocation({ mode: "link-entry" })
                        }
                        className="mt-4 w-full rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md"
                      >
                        Paste Link
                      </button>
                    </div>

                    {/* Import a List */}
                    <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                        <FileUp size={22} className="text-brand" />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">
                        Import a List
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Have a saved Google Maps list? Import all your
                        bookmarked places at once.
                      </p>
                      <ImportGoogleListDialog
                        tripId={tripId}
                        trigger={
                          <button
                            type="button"
                            className="mt-4 w-full rounded-full border border-border bg-secondary/80 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                          >
                            Import List
                          </button>
                        }
                        onImported={fetchData}
                      />
                    </div>

                    {/* Add Manually */}
                    <div className="flex flex-col items-center rounded-2xl border border-border bg-card px-5 pb-5 pt-8 shadow-sm">
                      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                        <PenLine
                          size={22}
                          className="text-accent-foreground/60"
                        />
                      </div>
                      <h3 className="text-sm font-bold text-foreground">
                        Add Manually
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        Know a hidden gem? Type in the name and details yourself
                        — no link needed.
                      </p>
                      <button
                        type="button"
                        onClick={() => setAddingLocation({ mode: "manual" })}
                        className="mt-4 w-full rounded-full border border-border bg-secondary/80 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        Add Manually
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : filteredLocations.length === 0 &&
                (locationNameSearch.trim() ||
                  categoryFilter ||
                  cityFilter ||
                  personFilter) ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No locations match the current filters.
                </p>
              ) : groupedLocations ? (
                <div className="space-y-8">
                  {groupedLocations.map(([groupName, locs]) => (
                    <div key={groupName}>
                      <div className="mb-4 flex items-center gap-3">
                        {groupBy === "city" && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                            <MapPin size={14} className="text-brand" />
                          </div>
                        )}
                        {groupBy === "category" && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                            <Tag size={14} className="text-brand" />
                          </div>
                        )}
                        {groupBy === "person" && (
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
            </div>

            {/* Right column — Map sidebar (TripSummaryCard temporarily disabled; kept for future re-enable) */}
            {locations.length > 0 && (
              <div className="hidden xl:flex xl:sticky xl:top-[6.75rem] xl:max-h-[calc(100vh-8rem)] xl:flex-col xl:overflow-hidden xl:pb-2">
                {/* Keep for future re-enable — do not delete:
                <div className="mb-4 shrink-0">
                  <TripSummaryCard
                    locations={locations}
                    addedByEmails={addedByEmails}
                  />
                </div>
                */}
                <div className="min-h-0 flex-1">
                  <SidebarLocationMap
                    locations={filteredLocations}
                    focusLocationId={focusedLocation?.id ?? null}
                    focusSeq={focusedLocation?.seq ?? 0}
                    onPinClick={handlePinClick}
                    onLocationNoteSave={handleMapNoteSave}
                    onLocationDelete={handleMapDelete}
                  />
                </div>
              </div>
            )}
          </div>

          <LocationsMapDialog
            locations={locations}
            open={mapDialogOpen}
            onOpenChange={setMapDialogOpen}
            onLocationNoteSave={handleMapNoteSave}
            onLocationDelete={handleMapDelete}
          />
        </section>
      )}

      {activeTab === "itinerary" && (
        <section
          id="tab-panel-itinerary"
          role="tabpanel"
          aria-labelledby="tab-itinerary"
          className="mt-6"
        >
          <ItineraryTab
            trip={trip}
            tripId={tripId}
            locations={locations}
            itineraryState={itineraryState}
          />
        </section>
      )}

      {activeTab === "budget" && (
        <section
          id="tab-panel-budget"
          role="tabpanel"
          aria-labelledby="tab-budget"
          className="mt-6"
        >
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16">
            <DollarSign size={32} className="text-muted-foreground/30" />
            <h3 className="mt-3 text-lg font-semibold text-foreground">
              Budget tracking coming soon
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Track expenses and split costs with your travel companions.
            </p>
          </div>
        </section>
      )}

      {activeTab === "documents" && (
        <section
          id="tab-panel-documents"
          role="tabpanel"
          aria-labelledby="tab-documents"
          className="mt-6"
        >
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16">
            <FileText size={32} className="text-muted-foreground/30" />
            <h3 className="mt-3 text-lg font-semibold text-foreground">
              Documents coming soon
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Store boarding passes, hotel confirmations, and travel documents.
            </p>
          </div>
        </section>
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
