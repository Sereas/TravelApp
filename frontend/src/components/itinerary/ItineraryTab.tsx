"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ItineraryDayRail } from "@/components/itinerary/ItineraryDayRail";
import { ItineraryDayCard } from "@/components/itinerary/ItineraryDayCard";
import { ItineraryInspectorPanel } from "@/components/itinerary/ItineraryInspectorPanel";
import { UnscheduledLocationsPanel } from "@/components/itinerary/UnscheduledLocationsPanel";
import { Button } from "@/components/ui/button";
import type { Location, Trip } from "@/lib/api";
import type { useItineraryState } from "@/features/itinerary/useItineraryState";
import { cn } from "@/lib/utils";
import type { InspectorLocation } from "@/components/itinerary/ItineraryInspectorPanel";

type ItineraryState = ReturnType<typeof useItineraryState>;

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

  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

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

  const selectedLocation = useMemo<InspectorLocation | null>(() => {
    if (!selectedLocationId || !itinerary) {
      const unscheduled = locations.find((location) => location.id === selectedLocationId);
      return unscheduled
        ? {
            dayId: null,
            optionId: null,
            locationId: unscheduled.id,
            location: unscheduled,
            dayLabel: null,
            optionIndex: null,
            timePeriod: null,
            scheduled: false,
          }
        : null;
    }

    for (const day of itinerary.days) {
      for (const option of day.options) {
        for (const optionLocation of option.locations) {
          if (optionLocation.location_id !== selectedLocationId) continue;
          const fullLocation =
            locations.find((location) => location.id === selectedLocationId) ??
            optionLocation.location;
          const dayLabel = day.date
            ? format(new Date(day.date + "T00:00:00"), "EEE, MMM d")
            : `Day ${day.sort_order + 1}`;
          return {
            dayId: day.id,
            optionId: option.id,
            locationId: optionLocation.location_id,
            location: fullLocation,
            dayLabel,
            optionIndex: option.option_index,
            timePeriod: optionLocation.time_period,
            scheduled: true,
          };
        }
      }
    }

    const unscheduled = locations.find((location) => location.id === selectedLocationId);
    return unscheduled
      ? {
          dayId: null,
          optionId: null,
          locationId: unscheduled.id,
          location: unscheduled,
          dayLabel: null,
          optionIndex: null,
          timePeriod: null,
          scheduled: false,
        }
      : null;
  }, [itinerary, locations, selectedLocationId]);

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
            trip.start_date && trip.end_date
              ? "No days yet. Generate days from your trip dates."
              : "No days yet. Add a day to get started."
          }
        >
          <div className="mt-3 flex flex-wrap gap-2">
            {trip.start_date && trip.end_date ? (
              <Button
                onClick={handleGenerateDays}
                disabled={addDayLoading || generateDaysLoading}
              >
                {generateDaysLoading ? "Generating…" : "Generate days from dates"}
              </Button>
            ) : (
              <Button
                onClick={handleAddDay}
                disabled={addDayLoading || generateDaysLoading}
              >
                {addDayLoading ? "Adding…" : "Add day"}
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
              <div>
                <h2 className="text-lg font-semibold">Planner</h2>
                <p className="text-sm text-content-muted">
                  Work from unscheduled places into daily plans.
                </p>
              </div>
              {trip.start_date && trip.end_date ? (
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
                        ? "Generating…"
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
                  {addDayLoading ? "Adding…" : "Add day"}
                </Button>
              )}
            </div>
            <ItineraryDayRail
              days={itinerary.days}
              selectedOptionsByDay={selectedOptionsByDay}
              selectedDayId={selectedDayId}
              onSelectDay={(dayId) => {
                setSelectedDayId(dayId);
                setSelectedLocationId(null);
              }}
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
                        selectedDayId === day.id && "ring-2 ring-brand-green/20"
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
                        onInspectLocation={(dayId, locationId) => {
                          setSelectedDayId(dayId);
                          setSelectedLocationId(locationId);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
                <ItineraryInspectorPanel
                  day={selectedDay}
                  currentOption={selectedDay ? getSelectedOption(selectedDay) : undefined}
                  selectedLocation={selectedLocation}
                  unscheduledCount={
                    locations.filter((location) => !itineraryLocationMap.has(location.id))
                      .length
                  }
                  onUpdateTimePeriod={handleUpdateLocationTimePeriod}
                />
                <UnscheduledLocationsPanel
                  locations={locations}
                  itineraryLocationMap={itineraryLocationMap}
                  availableDays={availableDays}
                  onScheduleToDay={handleScheduleLocationToDay}
                  selectedLocationId={selectedLocationId}
                  onInspectLocation={(locationId) => setSelectedLocationId(locationId)}
                />
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
