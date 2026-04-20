"use client";

/**
 * TripView — presentational component rendered by BOTH:
 *   - `/trips/[id]` (authenticated owner view, `readOnly={false}`)
 *   - `/shared/[token]` (public shared view, `readOnly={true}`)
 *
 * Zero-drift guarantee: any UI change to the trip detail surface lands here
 * once and automatically appears in both routes. The route files are thin
 * adapters — they fetch data and wire callbacks; they contain no trip-body
 * JSX.
 *
 * Read-only gating:
 *   - Affordances that a non-owner viewer must never touch are gated on
 *     `useReadOnly()` via nested components (LocationCard, ItineraryTab,
 *     SidebarLocationMap) and via explicit `{!readOnly && ...}` checks here
 *     for top-level chrome (smart input, add-location forms, group-by
 *     toggles, empty-state CTA cards, inline name edit, date picker).
 *   - `canShare` is a separate prop: not every future editor will have
 *     share rights, so read-only alone isn't the right gate.
 *   - Mutation callbacks are all optional. When undefined the affordance is
 *     hidden — never called via a no-op stub. This makes drift detectable.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Compass, DollarSign, FileText, MapPin } from "lucide-react";

import type { Location, Trip } from "@/lib/api";
import type {
  ItineraryMutations,
  ReadOnlyItineraryState,
} from "@/features/itinerary/itinerary-state-types";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { LocationCard } from "@/components/locations/LocationCard";
import {
  AddLocationForm,
  type LocationPreviewPayload,
} from "@/components/locations/AddLocationForm";
import { SmartLocationInput } from "@/components/locations/SmartLocationInput";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import { PlacesSidebarMapTrigger } from "@/features/trip-view/PlacesSidebarMapTrigger";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";

import { TripHeader } from "./TripHeader";
import {
  LocationsFilterToolbar,
  type ScheduleFilterKey,
  type SortKey,
} from "./LocationsFilterToolbar";
import { LocationsGrid } from "./LocationsGrid";
import { EmptyLocationsCTA } from "./EmptyLocationsCTA";

// ---------------------------------------------------------------------------
// Public prop types
// ---------------------------------------------------------------------------

/** Discriminated union describing how the Add Location form was opened. */
export type AddingLocationMode =
  | { mode: "manual" }
  | { mode: "link-entry" }
  | { mode: "prefilled"; googleLink?: string; name?: string }
  | {
      /**
       * The user picked a Google suggestion in the typeahead dropdown and
       * the backend already returned the resolved payload. The form opens
       * with every field pre-populated and skips its own /preview fetch —
       * that is the ONE mechanism that prevents a second Place Details Pro
       * call for the same place_id.
       */
      mode: "prefilled-from-typeahead";
      prefill: LocationPreviewPayload;
    };

export interface TripViewProps {
  // --- data -----------------------------------------------------------------
  trip: Trip;
  tripId: string;
  locations: Location[];

  // --- mode -----------------------------------------------------------------
  readOnly: boolean;
  canShare: boolean;
  onBack?: () => void;

  // --- itinerary ------------------------------------------------------------
  itineraryState: ReadOnlyItineraryState;
  itineraryMutations?: ItineraryMutations;

  // --- edit-mode controlled state (omitted in shared mode) ------------------
  addingLocation?: AddingLocationMode | null;
  editingLocation?: Location | null;
  focusedLocation?: { id: string; seq: number } | null;
  highlightedLocationId?: string | null;

  // --- edit-mode callbacks (undefined in shared mode) -----------------------
  onInlineNameSave?: (name: string) => void | Promise<void>;
  onDateRangeSave?: (newStart: string, newEnd: string) => void | Promise<void>;
  onShareClick?: () => void;
  onSmartInputSubmit?: (value: string, isUrl: boolean) => void;
  /**
   * Fired when the user picks a Google suggestion from the typeahead
   * dropdown and the backend resolves it via `/resolve`. The parent should
   * open the Add Location form in `prefilled-from-typeahead` mode.
   */
  onGoogleSuggestionResolved?: (prefill: LocationPreviewPayload) => void;
  /** Fired when the user clicks an "On list" typeahead suggestion. */
  onPickExistingLocation?: (locationId: string) => void;
  onStartAddingLocation?: (mode: AddingLocationMode) => void;
  onCancelAddingLocation?: () => void;
  onLocationAdded?: (location: Location, scheduleDayId?: string | null) => void;
  onStartEditingLocation?: (locationId: string) => void;
  onCancelEditingLocation?: () => void;
  onLocationUpdated?: (updated: Location) => void;
  onRefreshData?: () => void | Promise<void>;
  onPhotoUpload?: (locationId: string, file: File) => Promise<void>;
  onPhotoReset?: (locationId: string) => Promise<void>;
  onMapPinClick?: (locationId: string) => void;
  onCardClick?: (locationId: string) => void;
  onMapNoteSave?: (locationId: string, nextNote: string) => Promise<void>;
  onMapDelete?: (locationId: string) => Promise<void>;
  renderLocationDeleteTrigger?: (location: Location) => ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TripView({
  trip,
  tripId,
  locations,
  readOnly,
  canShare,
  onBack,
  itineraryState,
  itineraryMutations,
  addingLocation,
  editingLocation,
  focusedLocation,
  highlightedLocationId,
  onInlineNameSave,
  onDateRangeSave,
  onShareClick,
  onSmartInputSubmit,
  onGoogleSuggestionResolved,
  onPickExistingLocation,
  onStartAddingLocation,
  onCancelAddingLocation,
  onLocationAdded,
  onStartEditingLocation,
  onCancelEditingLocation,
  onLocationUpdated,
  onRefreshData,
  onPhotoUpload,
  onPhotoReset,
  onMapPinClick,
  onCardClick,
  onMapNoteSave,
  onMapDelete,
  renderLocationDeleteTrigger,
}: TripViewProps) {
  const contextReadOnly = useReadOnly();
  const isReadOnly = readOnly || contextReadOnly;

  // ---- local state (presentation only) -----------------------------------
  const [activeTab, setActiveTab] = useState<
    "locations" | "itinerary" | "budget" | "documents"
  >("locations");

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"city" | "category" | "person" | null>(
    null
  );
  const [scheduleFilter, setScheduleFilter] =
    useState<ScheduleFilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recently_added");
  const [placesMapSheetOpen, setPlacesMapSheetOpen] = useState(false);

  const { itinerary, availableDays, itineraryLocationMap } = itineraryState;

  // ---- derived filter state ----------------------------------------------
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

  // Locations filtered by everything EXCEPT schedule — used for schedule tab counts
  const filteredByNonSchedule = useMemo(() => {
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
    return list;
  }, [locations, categoryFilter, cityFilter, personFilter]);

  const scheduledCount = useMemo(
    () =>
      filteredByNonSchedule.filter((loc) => itineraryLocationMap.has(loc.id))
        .length,
    [filteredByNonSchedule, itineraryLocationMap]
  );

  const needsBookingCount = useMemo(
    () =>
      filteredByNonSchedule.filter((loc) => loc.requires_booking === "yes")
        .length,
    [filteredByNonSchedule]
  );

  const filteredLocations = useMemo(() => {
    let list: Location[];
    if (scheduleFilter === "all") {
      list = filteredByNonSchedule;
    } else if (scheduleFilter === "needs_booking") {
      list = filteredByNonSchedule.filter(
        (loc) => loc.requires_booking === "yes"
      );
    } else {
      list = filteredByNonSchedule.filter((loc) =>
        scheduleFilter === "scheduled"
          ? itineraryLocationMap.has(loc.id)
          : !itineraryLocationMap.has(loc.id)
      );
    }

    // Apply sort
    if (sortBy === "recently_added") {
      list = [...list].sort((a, b) => {
        if (!a.created_at && !b.created_at) return 0;
        if (!a.created_at) return 1;
        if (!b.created_at) return -1;
        return b.created_at.localeCompare(a.created_at);
      });
    } else if (sortBy === "name_asc") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [filteredByNonSchedule, scheduleFilter, itineraryLocationMap, sortBy]);

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

  // ---- per-card render ---------------------------------------------------
  const renderLocationCard = useCallback(
    (loc: Location) => {
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
          useful_link={loc.useful_link}
          added_by_email={loc.added_by_email}
          image_url={loc.image_url}
          user_image_url={loc.user_image_url}
          attribution_name={loc.attribution_name}
          attribution_uri={loc.attribution_uri}
          onPhotoUpload={
            isReadOnly || !onPhotoUpload
              ? undefined
              : (file) => onPhotoUpload(loc.id, file)
          }
          onPhotoReset={
            isReadOnly || !onPhotoReset ? undefined : () => onPhotoReset(loc.id)
          }
          inItinerary={dayLabels != null}
          itineraryDayLabel={dayLabels?.join(", ") ?? null}
          availableDays={
            !isReadOnly && dayLabels == null && itineraryMutations
              ? availableDays
              : undefined
          }
          onScheduleToDay={
            !isReadOnly && dayLabels == null && itineraryMutations
              ? (dayId) =>
                  itineraryMutations.handleScheduleLocationToDay(loc.id, dayId)
              : undefined
          }
          tripId={tripId}
          onLocationUpdated={onLocationUpdated}
          isHighlighted={highlightedLocationId === loc.id}
          onCardClick={onCardClick ? () => onCardClick(loc.id) : undefined}
          deleteTrigger={
            isReadOnly || !renderLocationDeleteTrigger
              ? undefined
              : renderLocationDeleteTrigger(loc)
          }
        />
      );
    },
    [
      itineraryLocationMap,
      isReadOnly,
      onPhotoUpload,
      onPhotoReset,
      availableDays,
      itineraryMutations,
      highlightedLocationId,
      onCardClick,
      renderLocationDeleteTrigger,
      tripId,
      onLocationUpdated,
    ]
  );

  // ---- render ------------------------------------------------------------
  return (
    <div>
      {/* Trip header */}
      <TripHeader
        trip={trip}
        itinerary={itinerary}
        isReadOnly={isReadOnly}
        canShare={canShare}
        onBack={onBack}
        onInlineNameSave={onInlineNameSave}
        onDateRangeSave={onDateRangeSave}
        onShareClick={onShareClick}
      />

      {/* Tabs — underline navigation */}
      <div className="sticky top-[calc(3.5rem+var(--safe-top))] z-30 -mx-4 bg-background/95 px-4 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
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
              locations.length > 0 ? "grid gap-6 lg:grid-cols-trip-places" : ""
            }
          >
            {/* Left column */}
            <div>
              {/* Smart location input — edit only */}
              {!isReadOnly && !addingLocation && locations.length > 0 && (
                <SmartLocationInput
                  tripId={tripId}
                  onSubmit={onSmartInputSubmit ?? (() => {})}
                  onImported={onRefreshData ?? (() => {})}
                  existingLocations={locations}
                  onGoogleResolved={onGoogleSuggestionResolved}
                  onPickExisting={onPickExistingLocation}
                />
              )}

              {/* Filter toolbar (includes schedule tabs as heading) */}
              {locations.length > 0 && (
                <LocationsFilterToolbar
                  locations={locations}
                  isReadOnly={isReadOnly}
                  categoryFilter={categoryFilter}
                  cityFilter={cityFilter}
                  personFilter={personFilter}
                  groupBy={groupBy}
                  scheduleFilter={scheduleFilter}
                  sortBy={sortBy}
                  onCategoryChange={setCategoryFilter}
                  onCityChange={setCityFilter}
                  onPersonChange={setPersonFilter}
                  onGroupByChange={setGroupBy}
                  onScheduleFilterChange={setScheduleFilter}
                  onSortChange={setSortBy}
                  onMapOpen={() => setPlacesMapSheetOpen(true)}
                  categoryOptions={categoryOptions}
                  totalFiltered={filteredByNonSchedule.length}
                  scheduledCount={scheduledCount}
                  needsBookingCount={needsBookingCount}
                />
              )}

              {!isReadOnly && addingLocation && onLocationAdded && (
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
                  initialPrefill={
                    addingLocation.mode === "prefilled-from-typeahead"
                      ? addingLocation.prefill
                      : undefined
                  }
                  linkEntryMode={addingLocation.mode === "link-entry"}
                  onAdded={onLocationAdded}
                  onCancel={onCancelAddingLocation ?? (() => {})}
                />
              )}

              {!isReadOnly && editingLocation && onLocationUpdated && (
                <EditLocationRow
                  tripId={tripId}
                  location={editingLocation}
                  onUpdated={onLocationUpdated}
                  onCancel={onCancelEditingLocation ?? (() => {})}
                />
              )}

              {locations.length === 0 && !addingLocation ? (
                isReadOnly ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    No locations added to this trip yet.
                  </p>
                ) : (
                  <EmptyLocationsCTA
                    tripId={tripId}
                    onStartAddingLocation={onStartAddingLocation}
                    onRefreshData={onRefreshData}
                  />
                )
              ) : (
                <LocationsGrid
                  filteredLocations={filteredLocations}
                  groupBy={groupBy}
                  groupedLocations={groupedLocations}
                  scheduleFilter={scheduleFilter}
                  categoryFilter={categoryFilter}
                  cityFilter={cityFilter}
                  personFilter={personFilter}
                  renderLocationCard={renderLocationCard}
                />
              )}
            </div>

            {/* Right column — Map sidebar */}
            {locations.length > 0 && (
              <div className="lg:sticky lg:top-[6.75rem] lg:max-h-[calc(100vh-8rem)] lg:flex lg:flex-col lg:overflow-hidden lg:pb-2">
                <div className="min-h-0 lg:flex-1">
                  <PlacesSidebarMapTrigger
                    locations={filteredLocations}
                    focusLocationId={focusedLocation?.id ?? null}
                    focusSeq={focusedLocation?.seq ?? 0}
                    onPinClick={onMapPinClick}
                    onLocationNoteSave={isReadOnly ? undefined : onMapNoteSave}
                    onLocationDelete={isReadOnly ? undefined : onMapDelete}
                    readOnly={isReadOnly}
                    open={placesMapSheetOpen}
                    onOpenChange={setPlacesMapSheetOpen}
                    renderMobileButton={false}
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "itinerary" && (
        <div className="mt-6">
          <ItineraryTab
            trip={trip}
            tripId={tripId}
            locations={locations}
            itineraryState={itineraryState}
            itineraryMutations={isReadOnly ? undefined : itineraryMutations}
          />
        </div>
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
    </div>
  );
}
