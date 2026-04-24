"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ItineraryDayRail } from "@/components/itinerary/ItineraryDayRail";
import { ItineraryDayCard } from "@/components/itinerary/ItineraryDayCard";
import {
  ItineraryDayMap,
  type ItineraryDayMapLocation,
  type MapRoutePolyline,
} from "@/components/itinerary/ItineraryDayMap";
import { ItineraryInspectorPanel } from "@/components/itinerary/ItineraryInspectorPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ItineraryDay, ItineraryOption, Location, Trip } from "@/lib/api";
import { ROUTE_COLORS } from "@/components/itinerary/ItineraryDayCard";
import type {
  ItineraryMutations,
  ReadOnlyItineraryState,
} from "@/features/itinerary/itinerary-state-types";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  Car,
  Expand,
  Footprints,
  Map as MapIcon,
  MapPin,
  TrainFront,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers (hoisted to module scope to avoid recreation per render)
// ---------------------------------------------------------------------------

function fmtDur(s: number) {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h > 0 && m % 60 > 0 ? `${h}h ${m % 60}m` : `${h}h`;
}

function fmtDist(meters: number) {
  const km = meters / 1000;
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

const TRANSPORT_ICONS: Record<
  string,
  React.ComponentType<{
    size?: number | string;
    className?: string;
    style?: React.CSSProperties;
  }>
> = { walk: Footprints, drive: Car, transit: TrainFront };

/**
 * Build the ordered, deduplicated list of day-map pin locations for a
 * given itinerary option. Pure function hoisted to module scope so both
 * `SidebarMap` (desktop compact preview) and the Phase 4 mobile sheet
 * share the same logic — without this, the mobile sheet was missing
 * the dedup-by-location-id behavior (a hotel that depart-and-returns
 * to the same place would show two pins stacked).
 */
function buildDayMapLocations(
  selectedOption: ItineraryOption | undefined,
  _locations?: Location[]
): ItineraryDayMapLocation[] {
  if (!selectedOption) return [];
  const sorted = [...selectedOption.locations].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const seen = new Set<string>();
  return sorted
    .filter(
      (ol) =>
        typeof ol.location.latitude === "number" &&
        typeof ol.location.longitude === "number"
    )
    .filter((ol) => {
      if (seen.has(ol.location_id)) return false;
      seen.add(ol.location_id);
      return true;
    })
    .map((ol) => ({
      id: ol.location_id,
      name: ol.location.name,
      latitude: ol.location.latitude as number,
      longitude: ol.location.longitude as number,
      category: ol.location.category ?? null,
      image_url: ol.location.image_url ?? null,
      user_image_url: ol.location.user_image_url ?? null,
      requires_booking: ol.location.requires_booking ?? null,
      city: ol.location.city ?? null,
      working_hours: ol.location.working_hours ?? null,
      useful_link: ol.location.useful_link ?? null,
      note: ol.location.note ?? null,
    }));
}

/**
 * Build the route-polyline overlay list for a given option. Both the
 * desktop `SidebarMap` compact preview and the Phase 4 mobile sheet
 * call this so they show identical routes.
 */
function buildDayMapRoutes(
  selectedOption: ItineraryOption | undefined
): MapRoutePolyline[] {
  if (!selectedOption?.routes?.length) return [];
  return selectedOption.routes
    .map((route, ri) => {
      const polylines = (route.segments ?? [])
        .filter((s) => s.encoded_polyline)
        .sort((a, b) => a.segment_order - b.segment_order)
        .map((s) => s.encoded_polyline!);
      if (polylines.length === 0) return null;
      const dur =
        route.duration_seconds != null ? fmtDur(route.duration_seconds) : "";
      const dist =
        route.distance_meters != null ? fmtDist(route.distance_meters) : "";
      return {
        routeId: route.route_id,
        color: ROUTE_COLORS[ri % ROUTE_COLORS.length].hex,
        encodedPolylines: polylines,
        label: [dur, dist].filter(Boolean).join(" · "),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

// ---------------------------------------------------------------------------
// Sidebar map — compact preview + expand to Dialog
// ---------------------------------------------------------------------------

interface SidebarMapProps {
  selectedDay: ItineraryDay | null | undefined;
  getSelectedOption: (day: ItineraryDay) => ItineraryOption | undefined;
  locations: Location[];
  onLocationNoteSave?: (
    locationId: string,
    nextNote: string
  ) => Promise<void> | void;
  onLocationDelete?: (locationId: string) => Promise<void> | void;
  readOnly?: boolean;
  highlightedLocationId?: string | null;
}

const SidebarMap = React.memo(function SidebarMap({
  selectedDay,
  getSelectedOption,
  locations,
  onLocationNoteSave,
  onLocationDelete,
  readOnly,
  highlightedLocationId,
}: SidebarMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const selectedOption = selectedDay
    ? getSelectedOption(selectedDay)
    : undefined;

  const mapLocations = useMemo(
    () => buildDayMapLocations(selectedOption, locations),
    [selectedOption, locations]
  );

  const mapRoutes = useMemo(
    () => buildDayMapRoutes(selectedOption),
    [selectedOption]
  );

  const routes = selectedOption?.routes ?? [];

  const stopNameLookup = useMemo(() => {
    if (!selectedOption) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const ol of selectedOption.locations) {
      map.set(ol.id, ol.location.name);
    }
    return map;
  }, [selectedOption]);

  const getStopNames = useCallback(
    (olIds: string[]) => olIds.map((id) => stopNameLookup.get(id) ?? "?"),
    [stopNameLookup]
  );

  if (mapLocations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <MapPin size={20} className="text-muted-foreground/30" />
          <span className="text-xs text-muted-foreground/50">
            No locations to map
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Compact preview — map fills available sidebar space */}
      <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card">
        <ItineraryDayMap
          locations={mapLocations}
          routes={mapRoutes}
          compact
          disablePopups
          highlightedLocationId={highlightedLocationId}
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="touch-target absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
          aria-label="Expand map"
        >
          <Expand size={13} />
        </button>
      </div>

      {/* Expanded dialog — map + route details */}
      <Dialog
        open={expanded}
        onOpenChange={(open) => {
          setExpanded(open);
          if (!open) setSelectedRouteId(null);
        }}
      >
        <DialogContent
          className={cn(
            "flex max-w-[90vw] flex-col gap-0 overflow-hidden p-0",
            routes.length > 0 ? "h-[90vh]" : "h-[85vh]"
          )}
        >
          <DialogTitle className="sr-only">Day map</DialogTitle>

          {/* Map — takes most of the dialog; routes scroll below */}
          <div
            className="relative min-h-0"
            style={{ height: routes.length > 0 ? "75%" : "100%" }}
          >
            <ItineraryDayMap
              locations={mapLocations}
              routes={mapRoutes}
              selectedRouteId={selectedRouteId}
              onLocationNoteSave={readOnly ? undefined : onLocationNoteSave}
              onLocationDelete={readOnly ? undefined : onLocationDelete}
              readOnly={readOnly}
            />
          </div>

          {/* Route details — fixed bottom panel, scrollable */}
          {routes.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border/60 bg-muted/40">
              <div className="flex items-center gap-2 px-5 pb-1 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Routes
                </span>
                <span className="text-[11px] text-muted-foreground/50">
                  {routes.length}
                </span>
              </div>
              <div className="relative min-h-0 flex-1">
                {/* Fade gradient — signals more content below */}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-200"
                  id="route-scroll-fade"
                />
                <div
                  className="h-full space-y-1.5 overflow-y-auto px-5 pb-3 pt-1"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const fade = el.parentElement?.querySelector(
                      "#route-scroll-fade"
                    ) as HTMLElement | null;
                    if (fade) {
                      const atBottom =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 8;
                      fade.style.opacity = atBottom ? "0" : "1";
                    }
                  }}
                >
                  {routes.map((route, ri) => {
                    const Icon = TRANSPORT_ICONS[route.transport_mode];
                    const color = ROUTE_COLORS[ri % ROUTE_COLORS.length].hex;
                    const names = getStopNames(route.option_location_ids);
                    const hasDur = route.duration_seconds != null;
                    const hasDist = route.distance_meters != null;
                    const isSelected = selectedRouteId === route.route_id;
                    return (
                      <button
                        type="button"
                        key={route.route_id}
                        aria-label={`Select route: ${names.join(" → ")}`}
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedRouteId((prev) =>
                            prev === route.route_id ? null : route.route_id
                          )
                        }
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border bg-background py-2.5 pl-3 pr-4 text-left transition-all duration-150",
                          isSelected
                            ? "border-current ring-1 ring-current/20"
                            : "border-border/40 hover:border-border hover:shadow-sm"
                        )}
                        style={
                          isSelected ? { borderColor: color, color } : undefined
                        }
                      >
                        <div
                          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: color + "18" }}
                        >
                          {Icon && <Icon size={13} style={{ color }} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-foreground">
                            {names.map((n, i) => (
                              <span
                                key={`${route.route_id}-${i}`}
                                className="flex items-center gap-1.5"
                              >
                                {i > 0 && (
                                  <span
                                    className="text-xs"
                                    style={{ color: color + "80" }}
                                  >
                                    →
                                  </span>
                                )}
                                <span className="font-medium">{n}</span>
                              </span>
                            ))}
                          </div>
                          {(hasDur || hasDist) && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {hasDur && fmtDur(route.duration_seconds!)}
                              {hasDur && hasDist && " · "}
                              {hasDist && fmtDist(route.distance_meters!)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});

// ---------------------------------------------------------------------------

interface ItineraryTabProps {
  trip: Trip;
  tripId: string;
  locations: Location[];
  itineraryState: ReadOnlyItineraryState;
  /**
   * Mutation handlers. Omit in read-only mode (shared trip view). When
   * undefined, all mutation affordances are suppressed. `useReadOnly()`
   * must also return `true` for full read-only correctness — this is
   * wired by the `<ReadOnlyProvider>` in the shared route.
   */
  itineraryMutations?: ItineraryMutations;
  /** Called when a new location is created via the "Find new" tab so the
   *  parent page can update its locations state. */
  onLocationCreated?: (location: Location) => void;
}

export function ItineraryTab({
  trip,
  tripId,
  locations,
  itineraryState,
  itineraryMutations,
  onLocationCreated,
}: ItineraryTabProps) {
  const {
    itinerary,
    itineraryLoading,
    itineraryError,
    itineraryActionError,
    addDayLoading,
    generateDaysLoading,
    createOptionLoading,
    calculatingRouteId,
    routeMetricsError,
    availableDays,
    fetchItinerary,
    clearItineraryActionError,
    selectOption,
    getSelectedOption,
  } = itineraryState;

  const readOnly = useReadOnly();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [hoveredLocationId, setHoveredLocationId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!itinerary?.days.length) {
      setSelectedDayId(null);
      return;
    }
    if (
      !selectedDayId ||
      !itinerary.days.some((day) => day.id === selectedDayId)
    ) {
      setSelectedDayId(itinerary.days[0].id);
    }
  }, [itinerary, selectedDayId]);

  const selectedDay = useMemo(
    () => itinerary?.days.find((day) => day.id === selectedDayId) ?? null,
    [itinerary, selectedDayId]
  );

  const selectedOptionsByDay = useMemo(() => {
    if (!itinerary) return {};
    return Object.fromEntries(
      itinerary.days.map((day) => [day.id, getSelectedOption(day)])
    );
  }, [getSelectedOption, itinerary]);

  const visibleDays = useMemo(() => {
    if (!itinerary?.days.length) return [];
    if (selectedDay) return [selectedDay];
    return [itinerary.days[0]];
  }, [itinerary, selectedDay]);

  // Mobile map sheet — same locations + routes as the desktop SidebarMap
  // compact preview. Computed here at render scope so both the sheet
  // body and the sheet trigger can share the same memoized data.
  const selectedOptionForMobileMap = useMemo(
    () => (selectedDay ? getSelectedOption(selectedDay) : undefined),
    [selectedDay, getSelectedOption]
  );
  const mobileMapLocations = useMemo(
    () => buildDayMapLocations(selectedOptionForMobileMap, locations),
    [selectedOptionForMobileMap, locations]
  );
  const mobileMapRoutes = useMemo(
    () => buildDayMapRoutes(selectedOptionForMobileMap),
    [selectedOptionForMobileMap]
  );

  return (
    <section
      id="tab-panel-itinerary"
      role="tabpanel"
      aria-labelledby="tab-itinerary"
      aria-label="Itinerary"
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
          onRetry={clearItineraryActionError}
        />
      )}
      {!itineraryLoading && !itineraryError && itinerary?.days.length === 0 && (
        <EmptyState
          message={
            readOnly
              ? "No itinerary days planned yet."
              : trip.start_date && trip.end_date
                ? "No days yet. Generate days from your trip dates."
                : "No days yet. Add a day to get started."
          }
        >
          {!readOnly && itineraryMutations && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trip.start_date && trip.end_date ? (
                <Button
                  onClick={itineraryMutations.handleGenerateDays}
                  disabled={addDayLoading || generateDaysLoading}
                >
                  {generateDaysLoading
                    ? "Generating..."
                    : "Generate days from dates"}
                </Button>
              ) : (
                <Button
                  onClick={itineraryMutations.handleAddDay}
                  disabled={addDayLoading || generateDaysLoading}
                >
                  {addDayLoading ? "Adding..." : "Add day"}
                </Button>
              )}
            </div>
          )}
        </EmptyState>
      )}
      {!itineraryLoading &&
        !itineraryError &&
        itinerary &&
        itinerary.days.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              {!readOnly &&
                itineraryMutations &&
                (trip.start_date && trip.end_date ? (
                  (() => {
                    const coveredDates = new Set(
                      itinerary.days.map((day) => day.date).filter(Boolean)
                    );
                    const start = new Date(trip.start_date + "T00:00:00");
                    const end = new Date(trip.end_date + "T00:00:00");
                    let hasMissing = false;

                    for (
                      let date = new Date(start);
                      date <= end;
                      date.setDate(date.getDate() + 1)
                    ) {
                      if (!coveredDates.has(format(date, "yyyy-MM-dd"))) {
                        hasMissing = true;
                        break;
                      }
                    }

                    return hasMissing ? (
                      <Button
                        size="sm"
                        onClick={itineraryMutations.handleGenerateDays}
                        disabled={addDayLoading || generateDaysLoading}
                      >
                        {generateDaysLoading
                          ? "Generating..."
                          : "Generate missing days"}
                      </Button>
                    ) : null;
                  })()
                ) : (
                  <Button
                    size="sm"
                    onClick={itineraryMutations.handleAddDay}
                    disabled={addDayLoading || generateDaysLoading}
                  >
                    {addDayLoading ? "Adding..." : "Add day"}
                  </Button>
                ))}
            </div>

            <ItineraryDayRail
              days={itinerary.days}
              selectedOptionsByDay={selectedOptionsByDay}
              selectedDayId={selectedDayId}
              onSelectDay={setSelectedDayId}
            />

            {/* Mobile-only Map button. Opens a bottom sheet containing
             * the current day's map. On desktop (`lg+`) this is hidden
             * because the sticky sidebar below already shows the map.
             *
             * NOTE: we deliberately render `ItineraryDayMap` directly
             * inside the sheet instead of going through the inline
             * `SidebarMap` component — the sheet IS the fullscreen view,
             * so the compact-preview → nested-Dialog pattern would be
             * redundant and create a Dialog inside a Dialog. */}
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                  >
                    <MapIcon size={14} aria-hidden="true" />
                    Map
                  </button>
                </SheetTrigger>
                <SheetContent
                  scrollLocked
                  className="h-[85dvh]"
                  aria-describedby={undefined}
                >
                  <SheetTitle className="sr-only">Day map</SheetTitle>
                  <div className="min-h-0 flex-1 px-2 pb-2 pt-2">
                    <div className="h-full overflow-hidden rounded-xl">
                      <ItineraryDayMap
                        locations={mobileMapLocations}
                        routes={mobileMapRoutes}
                        onLocationNoteSave={
                          readOnly
                            ? undefined
                            : itineraryMutations?.handleLocationNoteSave
                        }
                        onLocationDelete={
                          readOnly
                            ? undefined
                            : itineraryMutations?.handleLocationDelete
                        }
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="grid gap-4 lg:grid-cols-trip-itinerary">
              <div className="space-y-4">
                {visibleDays.map((day) => {
                  const currentOption = getSelectedOption(day);
                  return (
                    <div
                      key={day.id}
                      id={`itinerary-day-${day.id}`}
                      className={cn(
                        "rounded-3xl transition-shadow",
                        selectedDayId === day.id && "ring-2 ring-brand/20"
                      )}
                      onClickCapture={() => setSelectedDayId(day.id)}
                    >
                      <ItineraryDayCard
                        day={day}
                        tripId={tripId}
                        currentOption={currentOption}
                        tripLocations={locations}
                        createOptionLoading={createOptionLoading === day.id}
                        tripStartDate={trip.start_date}
                        tripEndDate={trip.end_date}
                        calculatingRouteId={calculatingRouteId}
                        routeMetricsError={routeMetricsError}
                        onSelectOption={selectOption}
                        onUpdateDayDate={
                          itineraryMutations?.handleUpdateDayDate
                        }
                        onCreateAlternative={
                          itineraryMutations?.handleCreateAlternative
                        }
                        onDeleteOption={itineraryMutations?.handleDeleteOption}
                        onSaveOptionDetails={
                          itineraryMutations?.handleSaveOptionDetails
                        }
                        onAddLocations={
                          itineraryMutations?.handleAddLocationsToOption
                        }
                        onRemoveLocation={
                          itineraryMutations?.handleRemoveLocationFromOption
                        }
                        onUpdateTimePeriod={
                          itineraryMutations?.handleUpdateLocationTimePeriod
                        }
                        onReorderLocations={
                          itineraryMutations?.handleReorderOptionLocations
                        }
                        onDeleteRoute={itineraryMutations?.handleDeleteRoute}
                        onRouteCreated={itineraryMutations?.handleRouteCreated}
                        onRetryRouteMetrics={
                          itineraryMutations?.handleRetryRouteMetrics
                        }
                        onInspectLocation={(dayId) => {
                          setSelectedDayId(dayId);
                        }}
                        onLocationHover={setHoveredLocationId}
                        onLocationCreated={onLocationCreated}
                      />
                    </div>
                  );
                })}

                {/* Mobile-inline Inspector panel. On desktop this
                 * overlays the sidebar map instead. */}
                <div className="lg:hidden">
                  <ItineraryInspectorPanel
                    day={selectedDay}
                    currentOption={
                      selectedDay ? getSelectedOption(selectedDay) : undefined
                    }
                  />
                </div>
              </div>

              {/* Desktop-only sticky sidebar. Hidden on mobile — the
               * day map is reachable via the Map button + Sheet above,
               * and Inspector renders inline below the day cards.
               * Uses the same flex-fill pattern as the locations tab:
               * max-h viewport cap → flex-col → inspector shrink-0 →
               * map flex-1 fills the rest. */}
              <div className="hidden lg:sticky lg:top-[6.75rem] lg:flex lg:max-h-[calc(100vh-8rem)] lg:flex-col lg:gap-4 lg:overflow-hidden lg:pb-2">
                <ItineraryInspectorPanel
                  day={selectedDay}
                  currentOption={
                    selectedDay ? getSelectedOption(selectedDay) : undefined
                  }
                />
                <div className="min-h-0 lg:flex-1">
                  <SidebarMap
                    selectedDay={selectedDay}
                    getSelectedOption={getSelectedOption}
                    locations={locations}
                    onLocationNoteSave={
                      itineraryMutations?.handleLocationNoteSave
                    }
                    onLocationDelete={itineraryMutations?.handleLocationDelete}
                    readOnly={readOnly}
                    highlightedLocationId={hoveredLocationId}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
