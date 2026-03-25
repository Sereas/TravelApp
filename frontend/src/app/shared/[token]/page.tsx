"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  api,
  ApiError,
  type SharedTripData,
  type SharedLocationSummary,
  type Location,
  type Trip,
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryResponse,
} from "@/lib/api";
import { ReadOnlyProvider } from "@/lib/read-only-context";
import { LocationCard } from "@/components/locations/LocationCard";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Building2,
  Calendar,
  ChevronDown,
  Globe,
  MapPin,
  Route,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { useItineraryState } from "@/features/itinerary/useItineraryState";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
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

/** Convert SharedLocationSummary[] to Location[] for components that expect the full type. */
function toLocations(shared: SharedLocationSummary[]): Location[] {
  return shared.map((s) => ({
    ...s,
    google_place_id: null,
    added_by_user_id: null,
    added_by_email: null,
  }));
}

/** Convert SharedTripData.trip to Trip type. */
function toTrip(info: SharedTripData["trip"]): Trip {
  return {
    id: "shared",
    name: info.name,
    start_date: info.start_date ?? null,
    end_date: info.end_date ?? null,
  };
}

const noop = () => {};
const noopAsync = async () => {};
const noopPromiseNull = async () => null;

/** Build a read-only itinerary state that satisfies ItineraryTab's props. */
function useReadOnlyItineraryState(
  itinerary: ItineraryResponse,
  locations: Location[]
): ReturnType<typeof useItineraryState> {
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  const selectOption = useCallback((dayId: string, optionId: string) => {
    setSelectedOptions((prev) => ({ ...prev, [dayId]: optionId }));
  }, []);

  const getSelectedOption = useCallback(
    (day: ItineraryDay): ItineraryOption | undefined => {
      const selectedId = selectedOptions[day.id];
      return day.options.find((o) => o.id === selectedId) ?? day.options[0];
    },
    [selectedOptions]
  );

  const itineraryLocationMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const day of itinerary.days) {
      const dayLabel = day.date
        ? new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : `Day ${day.sort_order + 1}`;

      for (const option of day.options) {
        for (const loc of option.locations) {
          const existing = map.get(loc.location_id);
          if (existing) {
            if (!existing.includes(dayLabel)) existing.push(dayLabel);
          } else {
            map.set(loc.location_id, [dayLabel]);
          }
        }
      }
    }
    return map;
  }, [itinerary]);

  const availableDays = useMemo(
    () =>
      itinerary.days.map((d) => ({
        id: d.id,
        label: d.date ? formatDate(d.date) : `Day ${d.sort_order + 1}`,
      })),
    [itinerary]
  );

  return {
    itinerary,
    itineraryLoading: false,
    itineraryError: null,
    itineraryActionError: null,
    addDayLoading: false,
    generateDaysLoading: false,
    createOptionLoading: null,
    calculatingRouteId: null,
    routeMetricsError: {},
    itineraryLocationMap,
    availableDays,
    fetchItinerary: noopAsync,
    clearItineraryActionError: noop,
    selectOption,
    getSelectedOption,
    handleAddDay: noopAsync,
    handleGenerateDays: noopAsync,
    handleUpdateDayDate: noop,
    handleCreateAlternative: noopPromiseNull,
    handleDeleteOption: noop,
    handleSaveOptionDetails: noop,
    handleAddLocationsToOption: noopAsync,
    handleRemoveLocationFromOption: noop,
    handleUpdateLocationTimePeriod: noop,
    handleReorderOptionLocations: noop,
    handleRouteCreated: noopAsync,
    handleRetryRouteMetrics: noopAsync,
    handleScheduleLocationToDay: noopAsync,
    getOrphanedDays: () => [],
    syncLocationSummary: noop,
  } as unknown as ReturnType<typeof useItineraryState>;
}

export default function SharedTripPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [data, setData] = useState<SharedTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSharedTrip() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.sharing.getSharedTrip(token);
        setData(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setError("This shared link is no longer valid.");
        } else {
          setError("Failed to load shared trip.");
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSharedTrip();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Globe size={48} className="text-muted-foreground/40" />
        <h1 className="text-xl font-bold text-foreground">
          {error ?? "Trip not found"}
        </h1>
        <p className="text-sm text-muted-foreground">
          The link may have expired or been revoked by the trip owner.
        </p>
      </div>
    );
  }

  return (
    <ReadOnlyProvider value={true}>
      <SharedTripContent data={data} />
    </ReadOnlyProvider>
  );
}

function SharedTripContent({ data }: { data: SharedTripData }) {
  const trip = useMemo(() => toTrip(data.trip), [data.trip]);
  const locations = useMemo(
    () => toLocations(data.locations),
    [data.locations]
  );
  const itineraryState = useReadOnlyItineraryState(data.itinerary, locations);
  const { itineraryLocationMap } = itineraryState;
  const itinerary = data.itinerary;

  const dateDisplay = formatDateRange(trip.start_date, trip.end_date);

  const [activeTab, setActiveTab] = useState<"locations" | "itinerary">(
    "locations"
  );
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string | null>(null);
  const [cityPopoverOpen, setCityPopoverOpen] = useState(false);
  const [locationNameSearch, setLocationNameSearch] = useState("");

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

  return (
    <div>
      {/* Trip hero banner — matches trip detail page */}
      <div className="grain-overlay -mx-4 -mt-4 overflow-hidden rounded-b-3xl bg-gradient-to-br from-brand/10 via-background to-primary/8 px-4 pb-6 pt-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
          <Globe size={12} />
          Shared trip
        </div>

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
          </div>

          {/* Quick stats row */}
          <div className="flex items-center gap-3">
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
                const itinCities = new Set<string>();
                itinerary.days.forEach((day) =>
                  day.options.forEach((opt) => {
                    if (opt.starting_city) itinCities.add(opt.starting_city);
                    if (opt.ending_city) itinCities.add(opt.ending_city);
                  })
                );
                return itinCities.size > 0 ? (
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border/50">
                    <Route size={11} className="text-brand" />
                    <span className="font-semibold text-foreground">
                      {itinCities.size}
                    </span>{" "}
                    {itinCities.size === 1 ? "city" : "cities"}
                  </div>
                ) : null;
              })()}
          </div>

          {/* Planning progress bar */}
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
      </div>

      {/* Sticky tabs bar — pill style matching trip detail page */}
      <nav
        className="sticky top-14 z-30 -mx-4 flex gap-2 border-b border-border/40 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-8 md:px-8"
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
                  placeholder="Search locations\u2026"
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
                        cityFilter
                          ? "bg-brand-muted text-brand-strong"
                          : "text-foreground hover:bg-brand-muted"
                      )}
                    >
                      <Building2 size={14} />
                      {cityFilter ?? "City"}
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
                        !cityFilter
                          ? "bg-brand-muted font-medium text-brand-strong"
                          : "text-foreground hover:bg-muted"
                      )}
                      onClick={() => {
                        setCityFilter(null);
                        setCategoryFilter(null);
                        setCityPopoverOpen(false);
                      }}
                    >
                      All cities
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

          {locations.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No locations added to this trip yet.
            </p>
          ) : filteredLocations.length === 0 && locationNameSearch.trim() ? (
            <p className="py-4 text-sm text-muted-foreground">
              No locations match &quot;{locationNameSearch.trim()}&quot;. Try a
              different search or clear the search box.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredLocations.map((loc) => {
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
                    image_url={loc.image_url}
                    user_image_url={loc.user_image_url}
                    attribution_name={loc.attribution_name}
                    attribution_uri={loc.attribution_uri}
                    inItinerary={dayLabels != null}
                    itineraryDayLabel={dayLabels?.join(", ") ?? null}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Itinerary tab */}
      {activeTab === "itinerary" && (
        <div className="mt-6">
          <ItineraryTab
            trip={trip}
            tripId="shared"
            locations={locations}
            itineraryState={itineraryState}
          />
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
        Shared via shtabtravel
      </div>
    </div>
  );
}
