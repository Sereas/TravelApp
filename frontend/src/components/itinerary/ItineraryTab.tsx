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
  type MapRoutePolyline,
} from "@/components/itinerary/ItineraryDayMap";
import { ItineraryInspectorPanel } from "@/components/itinerary/ItineraryInspectorPanel";
import { UnscheduledLocationsPanel } from "@/components/itinerary/UnscheduledLocationsPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ItineraryDay, ItineraryOption, Location, Trip } from "@/lib/api";
import { ROUTE_COLORS } from "@/components/itinerary/ItineraryDayCard";
import type { useItineraryState } from "@/features/itinerary/useItineraryState";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import { Car, Expand, Footprints, MapPin, TrainFront } from "lucide-react";

type ItineraryState = ReturnType<typeof useItineraryState>;

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

// ---------------------------------------------------------------------------
// Sidebar map — compact preview + expand to Dialog
// ---------------------------------------------------------------------------

interface SidebarMapProps {
  selectedDay: ItineraryDay | null | undefined;
  getSelectedOption: (day: ItineraryDay) => ItineraryOption | undefined;
  locations: Location[];
}

const SidebarMap = React.memo(function SidebarMap({
  selectedDay,
  getSelectedOption,
  locations,
}: SidebarMapProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const selectedOption = selectedDay
    ? getSelectedOption(selectedDay)
    : undefined;

  const mapLocations = useMemo(() => {
    if (!selectedOption) return [];
    const sorted = [...selectedOption.locations].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    // Deduplicate by location_id — a location can appear multiple times
    // in an option (e.g. depart and return to same spot). Show only the
    // first occurrence on the map.
    const seen = new Set<string>();
    return sorted
      .map((ol) => {
        const loc = locations.find((l) => l.id === ol.location_id);
        return loc ? { ol, loc } : null;
      })
      .filter(
        (item): item is NonNullable<typeof item> =>
          !!item &&
          typeof item.loc.latitude === "number" &&
          typeof item.loc.longitude === "number"
      )
      .filter(({ loc }) => {
        if (seen.has(loc.id)) return false;
        seen.add(loc.id);
        return true;
      })
      .map(({ loc }) => ({
        id: loc.id,
        name: loc.name,
        latitude: loc.latitude as number,
        longitude: loc.longitude as number,
        category: loc.category ?? null,
        image_url: loc.image_url ?? null,
        user_image_url: loc.user_image_url ?? null,
        requires_booking: loc.requires_booking ?? null,
        city: loc.city ?? null,
        note: loc.note ?? null,
      }));
  }, [selectedOption, locations]);

  const mapRoutes: MapRoutePolyline[] = useMemo(() => {
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
  }, [selectedOption]);

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
      <div className="flex items-center justify-center rounded-2xl border border-border bg-card p-6">
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
      {/* Compact preview — map is fully interactive */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-[180px]">
          <ItineraryDayMap
            locations={mapLocations}
            routes={mapRoutes}
            compact
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
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
  itineraryState: ItineraryState;
}

export function ItineraryTab({
  trip,
  tripId,
  locations,
  itineraryState,
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
    itineraryLocationMap,
    availableDays,
    fetchItinerary,
    clearItineraryActionError,
    selectOption,
    getSelectedOption,
    handleAddDay,
    handleGenerateDays,
    handleUpdateDayDate,
    handleCreateAlternative,
    handleDeleteOption,
    handleSaveOptionDetails,
    handleAddLocationsToOption,
    handleRemoveLocationFromOption,
    handleUpdateLocationTimePeriod,
    handleReorderOptionLocations,
    handleRouteCreated,
    handleRetryRouteMetrics,
    handleScheduleLocationToDay,
  } = itineraryState;

  const readOnly = useReadOnly();
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

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

  const currentDayCities = useMemo(() => {
    const opt = selectedDay ? getSelectedOption(selectedDay) : undefined;
    if (!opt) return new Set<string>();
    const cities = new Set<string>();
    if (opt.starting_city) cities.add(opt.starting_city.toLowerCase());
    if (opt.ending_city) cities.add(opt.ending_city.toLowerCase());
    for (const ol of opt.locations) {
      if (ol.location.city) cities.add(ol.location.city.toLowerCase());
    }
    return cities;
  }, [selectedDay, getSelectedOption]);

  return (
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
          {!readOnly && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trip.start_date && trip.end_date ? (
                <Button
                  onClick={handleGenerateDays}
                  disabled={addDayLoading || generateDaysLoading}
                >
                  {generateDaysLoading
                    ? "Generating..."
                    : "Generate days from dates"}
                </Button>
              ) : (
                <Button
                  onClick={handleAddDay}
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
                        onClick={handleGenerateDays}
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
                    onClick={handleAddDay}
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

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                        onUpdateDayDate={handleUpdateDayDate}
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
                        onInspectLocation={(dayId) => {
                          setSelectedDayId(dayId);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4 xl:sticky xl:top-[6.75rem] xl:self-start">
                <SidebarMap
                  selectedDay={selectedDay}
                  getSelectedOption={getSelectedOption}
                  locations={locations}
                />
                <ItineraryInspectorPanel
                  day={selectedDay}
                  currentOption={
                    selectedDay ? getSelectedOption(selectedDay) : undefined
                  }
                />
                {!readOnly && (
                  <UnscheduledLocationsPanel
                    locations={locations}
                    itineraryLocationMap={itineraryLocationMap}
                    currentDayId={
                      selectedDayId ?? itinerary.days[0]?.id ?? null
                    }
                    currentDayCities={currentDayCities}
                    onScheduleToDay={handleScheduleLocationToDay}
                  />
                )}
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
