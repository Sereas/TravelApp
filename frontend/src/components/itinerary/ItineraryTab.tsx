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
import { useReadOnly } from "@/lib/read-only-context";
import { Crosshair } from "lucide-react";

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 ring-1 ring-brand/20">
                  <Crosshair size={20} className="text-brand" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Your adventure
                  </h2>
                  <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Plan day by day
                  </p>
                </div>
              </div>
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
