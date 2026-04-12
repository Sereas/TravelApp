"use client";

/**
 * /trips/[id] — authenticated trip detail route.
 *
 * Thin wrapper around the shared `<TripView>` component. This file owns:
 *   - Data fetching (trip + locations)
 *   - All mutation handlers (wired to `api.*`)
 *   - Dialog state (DateChangeDialog, ShareTripDialog)
 *   - Route-level navigation (back link, redirect after delete)
 *   - Edit-mode local state (addingLocation, editingLocationId,
 *     focusedLocation, highlightedLocationId)
 *
 * All trip-body JSX lives in `features/trip-view/TripView.tsx` so it is
 * automatically shared with `/shared/[token]`.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Trip, type Location } from "@/lib/api";
import { type TripUpdatePayload } from "@/components/trips/EditTripForm";
import {
  DateChangeDialog,
  type DateChangeResult,
} from "@/components/trips/DateChangeDialog";
import { ShareTripDialog } from "@/components/trips/ShareTripDialog";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChevronLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useItineraryState } from "@/features/itinerary/useItineraryState";
import { TripView, type AddingLocationMode } from "@/features/trip-view";
import { usePinHighlight } from "@/features/trip-view/usePinHighlight";

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
  const [addingLocation, setAddingLocation] =
    useState<AddingLocationMode | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );
  const [focusedLocation, setFocusedLocation] = useState<{
    id: string;
    seq: number;
  } | null>(null);
  const focusSeqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // Transient highlight flash when a sidebar map pin is clicked.
  const { highlightedLocationId, handlePinClick } = usePinHighlight();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const itineraryState = useItineraryState({
    tripId,
    enabled: true,
    locations,
  });
  const {
    itinerary,
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
        (err as { status?: number }).status === 404
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

  // -------------------------------------------------------------------------
  // Mutation handlers
  // -------------------------------------------------------------------------

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
    // Background photo fetch: poll once after 4s to pick up the cached photo
    if (location.google_place_id && !location.image_url) {
      const locId = location.id;
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        api.locations.list(tripId).then((fresh) => {
          if (!mountedRef.current) return;
          const refreshed = fresh.find((l) => l.id === locId);
          if (refreshed?.image_url) {
            setLocations((prev) =>
              prev.map((l) => l.id === locId ? { ...l, image_url: refreshed.image_url } : l)
            );
            syncLocationSummary(locId, () => ({ image_url: refreshed.image_url }));
          }
        }).catch(() => {/* swallow — cosmetic refresh only */});
      }, 4000);
      return () => clearTimeout(timer);
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

  const handleCardClick = (locationId: string) => {
    focusSeqRef.current += 1;
    setFocusedLocation({ id: locationId, seq: focusSeqRef.current });
  };

  // Merge the page-level map-popup handlers into the itineraryMutations object
  // so that ItineraryTab's SidebarMap can thread them through to ItineraryDayMap.
  // `handleLocationNoteSave` / `handleLocationDelete` satisfy the two new fields
  // added to `ItineraryMutations` in itinerary-state-types.ts.
  const itineraryMutations = {
    ...itineraryState,
    handleLocationNoteSave: handleMapNoteSave,
    handleLocationDelete: handleMapDelete,
  };

  return (
    <>
      <TripView
        trip={trip}
        tripId={tripId}
        locations={locations}
        readOnly={false}
        canShare={true}
        onBack={() => router.push("/trips")}
        itineraryState={itineraryState}
        itineraryMutations={itineraryMutations}
        addingLocation={addingLocation}
        editingLocation={editingLocation}
        focusedLocation={focusedLocation}
        highlightedLocationId={highlightedLocationId}
        onInlineNameSave={handleInlineNameSave}
        onDateRangeSave={handleDateRangeSave}
        onShareClick={() => setShareDialogOpen(true)}
        onSmartInputSubmit={handleSmartInputSubmit}
        onStartAddingLocation={setAddingLocation}
        onCancelAddingLocation={() => setAddingLocation(null)}
        onLocationAdded={handleLocationAdded}
        onStartEditingLocation={setEditingLocationId}
        onCancelEditingLocation={() => setEditingLocationId(null)}
        onLocationUpdated={handleLocationUpdated}
        onRefreshData={fetchData}
        onPhotoUpload={handlePhotoUpload}
        onPhotoReset={handlePhotoReset}
        onMapPinClick={handlePinClick}
        onCardClick={handleCardClick}
        onMapNoteSave={handleMapNoteSave}
        onMapDelete={handleMapDelete}
        renderLocationDeleteTrigger={(loc) => (
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
        )}
      />

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
    </>
  );
}
