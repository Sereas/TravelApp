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

import { useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  Compass,
  DollarSign,
  FileText,
  FileUp,
  Link2,
  Map as MapIcon,
  MapPin,
  PenLine,
  Search,
  Tag,
  User,
  X,
} from "lucide-react";

import type { Location, Trip } from "@/lib/api";
import type {
  ItineraryMutations,
  ReadOnlyItineraryState,
} from "@/features/itinerary/itinerary-state-types";
import { ItineraryTab } from "@/components/itinerary/ItineraryTab";
import { LocationCard } from "@/components/locations/LocationCard";
import { AddLocationForm } from "@/components/locations/AddLocationForm";
import { SmartLocationInput } from "@/components/locations/SmartLocationInput";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import { ImportGoogleListDialog } from "@/components/locations/ImportGoogleListDialog";
import { PlacesSidebarMapTrigger } from "@/features/trip-view/PlacesSidebarMapTrigger";
import { TripGradient } from "@/components/trips/TripGradient";
import { TripDateRangePicker } from "@/components/trips/TripDateRangePicker";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";

/** Stable no-op async fallback for optional edit callbacks. */
const noopAsync = async () => {};

// ---------------------------------------------------------------------------
// Public prop types
// ---------------------------------------------------------------------------

/** Discriminated union describing how the Add Location form was opened. */
export type AddingLocationMode =
  | { mode: "manual" }
  | { mode: "link-entry" }
  | { mode: "prefilled"; googleLink?: string; name?: string };

export interface TripViewProps {
  // --- data -----------------------------------------------------------------
  trip: Trip;
  /**
   * `tripId` is passed through to edit-mode children (AddLocationForm,
   * EditLocationRow, ImportGoogleListDialog, SmartLocationInput). In shared
   * mode the edit forms are never mounted so the value is unused — pass any
   * sentinel string.
   */
  tripId: string;
  locations: Location[];

  // --- mode -----------------------------------------------------------------
  readOnly: boolean;
  /** Whether to render the Share button in the header. Owner-only in practice. */
  canShare: boolean;
  /** When provided, renders a "Back" link. When omitted, the link is hidden. */
  onBack?: () => void;

  // --- itinerary ------------------------------------------------------------
  itineraryState: ReadOnlyItineraryState;
  /** Mutation handlers — required in edit mode, omitted in shared mode. */
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
  onStartAddingLocation?: (mode: AddingLocationMode) => void;
  onCancelAddingLocation?: () => void;
  onLocationAdded?: (location: Location, scheduleDayId?: string | null) => void;
  onStartEditingLocation?: (locationId: string) => void;
  onCancelEditingLocation?: () => void;
  onLocationUpdated?: (updated: Location) => void;
  onRefreshData?: () => void | Promise<void>;
  onPhotoUpload?: (locationId: string, file: File) => Promise<void>;
  onPhotoReset?: (locationId: string) => Promise<void>;
  /** Fires when a sidebar-map pin is clicked. Usually scrolls the grid
   *  card into view and briefly highlights it (separate from card-click). */
  onMapPinClick?: (locationId: string) => void;
  /** Fires when a LocationCard itself is clicked. Usually focuses the
   *  sidebar map on that location's coordinates. */
  onCardClick?: (locationId: string) => void;
  onMapNoteSave?: (locationId: string, nextNote: string) => Promise<void>;
  onMapDelete?: (locationId: string) => Promise<void>;
  /** Render prop for per-card delete confirm (ConfirmDialog). Edit only. */
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
  // Defensive: honour either prop OR context — belt and suspenders so this
  // component is correct in any render context, not just under ReadOnlyProvider.
  const isReadOnly = readOnly || contextReadOnly;

  // ---- local state (presentation only) -----------------------------------
  const [activeTab, setActiveTab] = useState<
    "locations" | "itinerary" | "budget" | "documents"
  >("locations");

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
  const [editingName, setEditingName] = useState(false);
  const nameCancelledRef = useRef(false);
  // Controlled open state for the mobile Places-tab map sheet. The
  // trigger button lives in the filter toolbar at the top of the tab;
  // the sheet itself lives inside `PlacesSidebarMapTrigger` in the grid
  // right column. Both sides share this state.
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

  // ---- per-card render ---------------------------------------------------
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
        isHighlighted={highlightedLocationId === loc.id}
        onEdit={
          isReadOnly || !onStartEditingLocation
            ? undefined
            : () => onStartEditingLocation(loc.id)
        }
        onCardClick={onCardClick ? () => onCardClick(loc.id) : undefined}
        deleteTrigger={
          isReadOnly || !renderLocationDeleteTrigger
            ? undefined
            : renderLocationDeleteTrigger(loc)
        }
      />
    );
  }

  // ---- render ------------------------------------------------------------
  return (
    <div>
      {/* Trip header */}
      <div className="relative -mx-4 -mt-4 px-4 pt-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
        <TripGradient
          name={trip.name}
          className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-30"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-background" />

        {onBack && (
          <button
            type="button"
            className="-ml-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary/70 transition-colors hover:text-primary"
            onClick={onBack}
          >
            <ChevronLeft size={14} className="shrink-0" />
            Back to Trips
          </button>
        )}

        <motion.div
          className="relative pb-3 pt-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Status line: PLANNING badge + dates (left) ... progress + share (right) */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-brand-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-strong">
                Planning
              </span>
              {isReadOnly ? (
                <TripDateRangeReadOnly
                  startDate={trip.start_date}
                  endDate={trip.end_date}
                />
              ) : (
                <TripDateRangePicker
                  startDate={trip.start_date}
                  endDate={trip.end_date}
                  onDateRangeChange={onDateRangeSave ?? noopAsync}
                />
              )}
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
              {canShare && (
                <button
                  type="button"
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md"
                  onClick={onShareClick}
                >
                  Share
                </button>
              )}
            </div>
          </div>

          {/* Trip name */}
          <div className="mt-1">
            {isReadOnly ? (
              <h1 className="-mx-1 px-1 text-left text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                {trip.name}
              </h1>
            ) : editingName ? (
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
                    onInlineNameSave?.(val);
                  }
                }}
                className="w-full rounded-lg bg-transparent px-1 text-2xl font-bold tracking-tight text-foreground outline-none ring-1 ring-primary/30 sm:text-3xl md:text-4xl"
              />
            ) : (
              <button
                type="button"
                aria-label={trip.name}
                onClick={() => setEditingName(true)}
                className="-mx-1 cursor-text rounded-lg px-1 text-left text-2xl font-bold tracking-tight text-foreground transition-colors hover:bg-muted/50 sm:text-3xl md:text-4xl"
              >
                {trip.name}
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Tabs — underline navigation */}
      {/* Sticky tabs bar offset = header height (3.5rem) + iOS safe-area-top
       * inset. Must stay in sync with `SiteHeader`'s `pt-safe-t`: when the
       * header grows by the notch, the tabs bar has to push down by the
       * same amount or it hides behind the notch. `var(--safe-top)` is
       * declared in `globals.css` and defaults to 0px on non-notched
       * browsers. */}
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
                />
              )}

              {/* Heading row */}
              {locations.length > 0 && (
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {filteredLocations.length}{" "}
                  {filteredLocations.length === 1 ? "Place" : "Places"}
                </h2>
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
                        "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
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

                  {/* Mobile-only Map pill — opens the bottom sheet
                   * (PlacesSidebarMapTrigger lives in the grid right
                   * column and owns the sheet; this button shares state
                   * with it via `placesMapSheetOpen`). Hidden on `lg+`
                   * because the desktop sidebar is always visible. */}
                  <button
                    type="button"
                    onClick={() => setPlacesMapSheetOpen(true)}
                    className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted lg:hidden"
                    aria-label="Map"
                  >
                    <MapIcon size={14} />
                    Map
                  </button>

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
                            "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
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
                        {!isReadOnly && (
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
                        )}
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
                            "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
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
                        {!isReadOnly && (
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
                        )}
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

                  {/* Added by filter — edit only (PII) */}
                  {!isReadOnly && addedByEmails.size >= 2 && (
                    <Popover
                      open={personPopoverOpen}
                      onOpenChange={setPersonPopoverOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
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
                      Choose how you want to add your first spots. Your pool is
                      a curated collection of inspirations for your next
                      journey.
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
                            onStartAddingLocation?.({ mode: "link-entry" })
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
                          onImported={onRefreshData ?? (() => {})}
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
                          Know a hidden gem? Type in the name and details
                          yourself — no link needed.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            onStartAddingLocation?.({ mode: "manual" })
                          }
                          className="mt-4 w-full rounded-full border border-border bg-secondary/80 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                        >
                          Add Manually
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
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
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {locs.map(renderLocationCard)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredLocations.map(renderLocationCard)}
                </div>
              )}
            </div>

            {/* Right column — Map sidebar (desktop) / bottom sheet (mobile).
             *
             * `PlacesSidebarMapTrigger` renders both wrappers and flips
             * between them via `hidden lg:block` / `lg:hidden` classes.
             * The outer `lg:sticky lg:top-[6.75rem]` wrapper here only
             * matters at `lg+` (same breakpoint as the grid column), so
             * on mobile it collapses to a sibling of the content column. */}
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Static date-range chip used in read-only mode in place of the picker. */
function TripDateRangeReadOnly({
  startDate,
  endDate,
}: {
  startDate: string | null;
  endDate: string | null;
}) {
  if (!startDate && !endDate) {
    return <span className="text-xs text-muted-foreground">No dates set</span>;
  }
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  if (startDate && endDate) {
    return (
      <span className="text-xs font-medium text-foreground">
        {fmt(startDate)} — {fmt(endDate)}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-foreground">
      {fmt(startDate ?? endDate!)}
    </span>
  );
}
