"use client";

import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryOptionLocation,
  type Location,
} from "@/lib/api";
import { AddLocationsToOptionDialog } from "@/components/itinerary/AddLocationsToOptionDialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Sunrise,
  Sun,
  Sunset,
  Moon,
  ExternalLink,
  Ticket,
  GripVertical,
  ChevronDown,
  MapPin,
  Route,
  Car,
  Footprints,
  TrainFront,
  Plus,
  X,
  ArrowRight,
} from "lucide-react";

const TIME_PERIOD_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number | string }>;
    bg: string;
    text: string;
  }
> = {
  morning: {
    label: "Morning",
    icon: Sunrise,
    bg: "bg-amber-50",
    text: "text-amber-800",
  },
  afternoon: {
    label: "Afternoon",
    icon: Sun,
    bg: "bg-sky-50",
    text: "text-sky-800",
  },
  evening: {
    label: "Evening",
    icon: Sunset,
    bg: "bg-purple-50",
    text: "text-purple-800",
  },
  night: {
    label: "Night",
    icon: Moon,
    bg: "bg-slate-800",
    text: "text-slate-50",
  },
};

const TRANSPORT_MODES = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "drive", label: "Drive", icon: Car },
  { key: "transit", label: "Transit", icon: TrainFront },
] as const;

const ROUTE_COLORS = [
  "border-blue-400",
  "border-emerald-400",
  "border-orange-400",
  "border-violet-400",
  "border-rose-400",
];

export interface LocalRoute {
  id: string;
  locationIds: string[];
  transportMode: "walk" | "drive" | "transit";
  colorIndex: number;
}

function AutosaveInput({
  id,
  placeholder,
  initialValue,
  onSave,
  className,
}: {
  id: string;
  placeholder: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const savedRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    savedRef.current = initialValue;
  }, [initialValue]);

  const commitValue = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    await onSave(trimmed);
  }, [value, onSave]);

  return (
    <input
      id={id}
      autoComplete="off"
      className={cn(
        "h-7 rounded border border-transparent bg-transparent px-1.5 text-sm transition-colors hover:border-input focus:border-input focus:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commitValue()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export interface ItineraryDayCardProps {
  day: ItineraryDay;
  currentOption: ItineraryOption | undefined;
  tripLocations: Location[];
  createOptionLoading: boolean;
  onSelectOption: (dayId: string, optionId: string) => void;
  onCreateAlternative: (dayId: string) => void;
  onDeleteOption: (dayId: string, optionId: string) => void;
  onSaveOptionDetails: (
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) => void;
  onAddLocations: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => Promise<void>;
  onRemoveLocation: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
  onUpdateTimePeriod: (
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) => void;
  onReorderLocations: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => void;
}

export function ItineraryDayCard({
  day,
  currentOption,
  tripLocations,
  createOptionLoading,
  onSelectOption,
  onCreateAlternative,
  onDeleteOption,
  onSaveOptionDetails,
  onAddLocations,
  onRemoveLocation,
  onUpdateTimePeriod,
  onReorderLocations,
}: ItineraryDayCardProps) {
  const dayLabel = day.date
    ? formatDate(day.date)
    : `Day ${day.sort_order + 1}`;
  const hasMultipleOptions = day.options.length > 1;
  const canDeleteOption = day.options.length > 1;
  const alreadyAddedIds = useMemo(
    () => new Set(currentOption?.locations.map((l) => l.location_id) ?? []),
    [currentOption]
  );

  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(
    null
  );
  const [showMap, setShowMap] = useState(false);
  const [routes, setRoutes] = useState<LocalRoute[]>([]);
  const [linkingRoute, setLinkingRoute] = useState(false);
  const [linkingLocationIds, setLinkingLocationIds] = useState<string[]>([]);
  const [linkingTransport, setLinkingTransport] = useState<
    "walk" | "drive" | "transit"
  >("walk");

  // Drag state
  const [dragLocationId, setDragLocationId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Time picker
  const [openTimePicker, setOpenTimePicker] = useState<string | null>(null);
  const [timePickerPos, setTimePickerPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!openTimePicker) {
      setTimePickerPos(null);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove =
      spaceBelow < 200 || rect.bottom > window.innerHeight * 0.55;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 168));
    setTimePickerPos(
      openAbove
        ? { bottom: window.innerHeight - rect.top + 4, left }
        : { top: rect.bottom + 4, left }
    );
  }, [openTimePicker]);

  useEffect(() => {
    if (!openTimePicker) return;
    const close = () => setOpenTimePicker(null);
    document.addEventListener("scroll", close, true);
    return () => document.removeEventListener("scroll", close, true);
  }, [openTimePicker]);

  useEffect(() => {
    if (!openTimePicker) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t))
        return;
      setOpenTimePicker(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [openTimePicker]);

  function getRouteForLocation(locId: string): LocalRoute | undefined {
    return routes.find((r) => r.locationIds.includes(locId));
  }

  function getRoutePosition(
    route: LocalRoute,
    locId: string
  ): "first" | "middle" | "last" | "only" {
    const idx = route.locationIds.indexOf(locId);
    if (route.locationIds.length === 1) return "only";
    if (idx === 0) return "first";
    if (idx === route.locationIds.length - 1) return "last";
    return "middle";
  }

  function handleToggleLinkLocation(locId: string) {
    setLinkingLocationIds((prev) =>
      prev.includes(locId)
        ? prev.filter((id) => id !== locId)
        : [...prev, locId]
    );
  }

  function handleSaveRoute() {
    if (linkingLocationIds.length < 2) return;
    const newRoute: LocalRoute = {
      id: `route-${Date.now()}`,
      locationIds: [...linkingLocationIds],
      transportMode: linkingTransport,
      colorIndex: routes.length % ROUTE_COLORS.length,
    };
    setRoutes((prev) => [...prev, newRoute]);
    setLinkingRoute(false);
    setLinkingLocationIds([]);
  }

  function handleDeleteRoute(routeId: string) {
    setRoutes((prev) => prev.filter((r) => r.id !== routeId));
  }

  function handleStartLinking() {
    setLinkingRoute(true);
    setLinkingLocationIds([]);
    setLinkingTransport("walk");
  }

  function handleCancelLinking() {
    setLinkingRoute(false);
    setLinkingLocationIds([]);
  }

  const sortedLocations = useMemo(
    () =>
      currentOption
        ? [...currentOption.locations].sort(
            (a, b) => a.sort_order - b.sort_order
          )
        : [],
    [currentOption]
  );

  function handleDragStart(locId: string, e: React.DragEvent) {
    setDragLocationId(locId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", locId);
  }

  function handleDragEnd() {
    setDragLocationId(null);
    setDropTargetId(null);
  }

  function handleDragOver(locId: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragLocationId) setDropTargetId(locId);
  }

  function handleDrop(targetLocId: string, e: React.DragEvent) {
    e.preventDefault();
    setDropTargetId(null);
    if (!dragLocationId || !currentOption || dragLocationId === targetLocId) {
      setDragLocationId(null);
      return;
    }
    const fromIdx = sortedLocations.findIndex(
      (l) => l.location_id === dragLocationId
    );
    const toIdx = sortedLocations.findIndex(
      (l) => l.location_id === targetLocId
    );
    if (fromIdx < 0 || toIdx < 0) {
      setDragLocationId(null);
      return;
    }
    const newOrder = [...sortedLocations];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, removed);
    setDragLocationId(null);
    onReorderLocations(
      day.id,
      currentOption.id,
      newOrder.map((l) => l.location_id)
    );
  }

  function renderLocationRow(ol: ItineraryOptionLocation, index: number) {
    const timeKey = ol.time_period || "morning";
    const timeMeta = TIME_PERIOD_META[timeKey] ?? TIME_PERIOD_META.morning;
    const TimeIcon = timeMeta.icon;
    const isExpanded = expandedLocationId === ol.location_id;
    const route = getRouteForLocation(ol.location_id);
    const routePos = route ? getRoutePosition(route, ol.location_id) : null;
    const routeColor = route ? ROUTE_COLORS[route.colorIndex] : "";
    const isDragging = dragLocationId === ol.location_id;
    const isDropTarget = dropTargetId === ol.location_id && !isDragging;
    const booking = ol.location.requires_booking ?? "no";
    const showBookingBadge = booking === "yes" || booking === "yes_done";
    const isLinkingSelected = linkingLocationIds.includes(ol.location_id);
    const linkingSeq = linkingLocationIds.indexOf(ol.location_id) + 1;

    const showRouteSpacer = route && routePos !== "last" && routePos !== "only";
    const nextInRoute =
      route && showRouteSpacer
        ? sortedLocations.find(
            (l) =>
              route.locationIds[
                route.locationIds.indexOf(ol.location_id) + 1
              ] === l.location_id
          )
        : null;

    const TransportIcon =
      route && TRANSPORT_MODES.find((m) => m.key === route.transportMode)?.icon;

    return (
      <div key={ol.location_id}>
        <div
          className={cn(
            "group relative flex items-center gap-2 rounded-lg px-2 py-2 transition-colors",
            isDragging && "opacity-40",
            isDropTarget && "ring-1 ring-primary ring-inset bg-accent/60",
            isExpanded ? "bg-accent/40" : "hover:bg-accent/30"
          )}
          onDragOver={(e) => handleDragOver(ol.location_id, e)}
          onDragLeave={() => setDropTargetId(null)}
          onDrop={(e) => handleDrop(ol.location_id, e)}
        >
          {/* Route indicator bar */}
          {route && (
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg border-l-[3px]",
                routeColor,
                routePos === "first" && "top-1/2",
                routePos === "last" && "bottom-1/2"
              )}
            />
          )}

          {/* Linking mode: sequence number */}
          {linkingRoute && (
            <button
              type="button"
              onClick={() => handleToggleLinkLocation(ol.location_id)}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                isLinkingSelected
                  ? "bg-primary text-primary-foreground"
                  : "border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary"
              )}
              aria-label={
                isLinkingSelected
                  ? `Remove from route (stop ${linkingSeq})`
                  : "Add to route"
              }
            >
              {isLinkingSelected ? linkingSeq : <Plus size={12} />}
            </button>
          )}

          {/* Drag handle */}
          {!linkingRoute && (
            <div
              className="flex shrink-0 cursor-grab items-center rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
              draggable
              onDragStart={(e) => handleDragStart(ol.location_id, e)}
              onDragEnd={handleDragEnd}
              aria-label={`Drag to reorder ${ol.location.name}`}
            >
              <GripVertical size={14} />
            </div>
          )}

          {/* Time badge */}
          <div
            ref={openTimePicker === ol.location_id ? triggerRef : undefined}
            className="shrink-0"
          >
            <button
              type="button"
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors",
                "border border-transparent hover:border-border",
                timeMeta.bg,
                timeMeta.text
              )}
              onClick={() =>
                setOpenTimePicker((prev) =>
                  prev === ol.location_id ? null : ol.location_id
                )
              }
              aria-label={`Time: ${timeMeta.label}`}
            >
              <TimeIcon className="h-3 w-3" size={12} />
              <span>{timeMeta.label}</span>
            </button>
          </div>

          {/* Name + city (clickable to expand) */}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() =>
              setExpandedLocationId((prev) =>
                prev === ol.location_id ? null : ol.location_id
              )
            }
            aria-expanded={isExpanded}
          >
            <span className="text-sm font-medium">{ol.location.name}</span>
            {ol.location.city && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {ol.location.city}
              </span>
            )}
          </button>

          {/* Booking indicator */}
          {showBookingBadge && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                booking === "yes_done"
                  ? "bg-green-50 text-green-700"
                  : "bg-amber-50 text-amber-700"
              )}
            >
              <Ticket size={10} />
              {booking === "yes_done" ? "Booked" : "Book"}
            </span>
          )}

          {/* Map link */}
          {ol.location.google_link && (
            <a
              href={ol.location.google_link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
              aria-label={`Open ${ol.location.name} in Maps`}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={13} />
            </a>
          )}

          {/* Expand chevron */}
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 text-muted-foreground/50 transition-transform",
              isExpanded && "rotate-180"
            )}
          />

          {/* Remove */}
          {!linkingRoute && currentOption && (
            <button
              type="button"
              className="shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
              aria-label={`Remove ${ol.location.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveLocation(day.id, currentOption.id, ol.location_id);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="ml-10 mr-8 mb-1 space-y-1.5 rounded-b-lg bg-accent/20 px-3 py-2.5 text-xs">
            {ol.location.address && (
              <div>
                <span className="text-muted-foreground">Address: </span>
                {ol.location.address}
              </div>
            )}
            {ol.location.working_hours && (
              <div>
                <span className="text-muted-foreground">Hours: </span>
                {ol.location.working_hours}
              </div>
            )}
            {ol.location.requires_booking &&
              ol.location.requires_booking !== "no" && (
                <div>
                  <span className="text-muted-foreground">Booking: </span>
                  {ol.location.requires_booking === "yes_done"
                    ? "Booked ✓"
                    : "Required"}
                </div>
              )}
            {ol.location.category && (
              <div>
                <span className="text-muted-foreground">Category: </span>
                {ol.location.category}
              </div>
            )}
            {ol.location.note && (
              <div>
                <span className="text-muted-foreground">Note: </span>
                <span className="whitespace-pre-wrap">{ol.location.note}</span>
              </div>
            )}
          </div>
        )}

        {/* Route connector between consecutive route stops */}
        {showRouteSpacer && nextInRoute && TransportIcon && (
          <div className="relative ml-4 flex items-center gap-2 py-0.5 pl-4">
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 border-l-[3px]",
                routeColor
              )}
            />
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
              <TransportIcon size={10} />
              <span>—</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const timePickerPortal =
    openTimePicker && timePickerPos && currentOption
      ? (() => {
          const ol = sortedLocations.find(
            (l) => l.location_id === openTimePicker
          );
          if (!ol) return null;
          const style: CSSProperties = {
            position: "fixed",
            left: timePickerPos.left,
            zIndex: 9999,
            width: 160,
            ...(timePickerPos.top !== undefined
              ? { top: timePickerPos.top }
              : { bottom: timePickerPos.bottom }),
          };
          return createPortal(
            <div
              ref={dropdownRef}
              className="rounded-md border border-border bg-popover p-1 text-xs shadow-md"
              style={style}
              role="listbox"
            >
              {(["morning", "afternoon", "evening", "night"] as const).map(
                (key) => {
                  const m = TIME_PERIOD_META[key];
                  const Ico = m.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={key === (ol.time_period || "morning")}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left",
                        key === (ol.time_period || "morning")
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
                      )}
                      onClick={() => {
                        setOpenTimePicker(null);
                        onUpdateTimePeriod(
                          day.id,
                          currentOption.id,
                          ol.location_id,
                          key
                        );
                      }}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                          m.bg,
                          m.text
                        )}
                      >
                        <Ico className="h-3 w-3" size={12} />
                      </span>
                      <span>{m.label}</span>
                    </button>
                  );
                }
              )}
            </div>,
            document.body
          );
        })()
      : null;

  return (
    <>
      {timePickerPortal}
      <Card>
        {/* ── Header ── */}
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">{dayLabel}</h3>

            {/* Route indicator: Paris → Nice */}
            {currentOption &&
              (currentOption.starting_city || currentOption.ending_city) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AutosaveInput
                    id={`sc-${currentOption.id}`}
                    placeholder="From"
                    initialValue={currentOption.starting_city ?? ""}
                    onSave={async (v) => {
                      const n = v === "" ? null : v;
                      if (n === (currentOption.starting_city ?? null)) return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        starting_city: n,
                      });
                    }}
                    className="w-24 text-xs"
                  />
                  <ArrowRight size={12} className="shrink-0" />
                  <AutosaveInput
                    id={`ec-${currentOption.id}`}
                    placeholder="To"
                    initialValue={currentOption.ending_city ?? ""}
                    onSave={async (v) => {
                      const n = v === "" ? null : v;
                      if (n === (currentOption.ending_city ?? null)) return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        ending_city: n,
                      });
                    }}
                    className="w-24 text-xs"
                  />
                </div>
              )}

            {currentOption &&
              !currentOption.starting_city &&
              !currentOption.ending_city && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AutosaveInput
                    id={`sc-${currentOption.id}`}
                    placeholder="Start city"
                    initialValue=""
                    onSave={async (v) => {
                      if (!v) return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        starting_city: v,
                      });
                    }}
                    className="w-24 text-xs"
                  />
                  <ArrowRight size={12} className="shrink-0 opacity-30" />
                  <AutosaveInput
                    id={`ec-${currentOption.id}`}
                    placeholder="End city"
                    initialValue=""
                    onSave={async (v) => {
                      if (!v) return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        ending_city: v,
                      });
                    }}
                    className="w-24 text-xs"
                  />
                </div>
              )}

            {/* Created by */}
            {currentOption && (
              <AutosaveInput
                id={`cb-${currentOption.id}`}
                placeholder="by…"
                initialValue={currentOption.created_by ?? ""}
                onSave={async (v) => {
                  const n = v === "" ? null : v;
                  if (n === (currentOption.created_by ?? null)) return;
                  onSaveOptionDetails(day.id, currentOption.id, {
                    created_by: n,
                  });
                }}
                className="w-20 text-xs italic text-muted-foreground"
              />
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Option switcher + actions */}
            <div className="flex items-center gap-1.5">
              {hasMultipleOptions && (
                <select
                  aria-label={`Select option for ${dayLabel}`}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                  value={currentOption?.id ?? ""}
                  onChange={(e) => onSelectOption(day.id, e.target.value)}
                >
                  {day.options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.option_index === 1
                        ? "Main plan"
                        : `Alt ${opt.option_index - 1}`}
                      {opt.created_by ? ` (${opt.created_by})` : ""}
                    </option>
                  ))}
                </select>
              )}
              {canDeleteOption && currentOption && (
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete this alternative"
                    >
                      <X size={14} />
                    </Button>
                  }
                  title="Delete this plan?"
                  description={`"${currentOption.option_index === 1 ? "Main plan" : `Alt ${currentOption.option_index - 1}`}" and its locations will be removed.`}
                  confirmLabel="Delete"
                  variant="destructive"
                  onConfirm={() => onDeleteOption(day.id, currentOption.id)}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => onCreateAlternative(day.id)}
                disabled={createOptionLoading}
              >
                <Plus size={12} />
                Alt
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {currentOption && (
            <>
              {/* ── Location list ── */}
              {sortedLocations.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No locations yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sortedLocations.map((ol, idx) => renderLocationRow(ol, idx))}
                </div>
              )}

              {/* ── Route linking mode bar ── */}
              {linkingRoute && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
                  <span className="text-xs font-medium text-primary">
                    Select locations in order
                  </span>
                  <div className="flex-1" />
                  <div className="flex gap-1">
                    {TRANSPORT_MODES.map((m) => {
                      const MIcon = m.icon;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          className={cn(
                            "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                            linkingTransport === m.key
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          )}
                          onClick={() => setLinkingTransport(m.key)}
                        >
                          <MIcon size={12} className="inline mr-1" />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={linkingLocationIds.length < 2}
                    onClick={handleSaveRoute}
                  >
                    Save route ({linkingLocationIds.length})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleCancelLinking}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* ── Saved routes summary ── */}
              {routes.length > 0 && !linkingRoute && (
                <div className="mt-2 space-y-1">
                  {routes.map((r) => {
                    const MIcon =
                      TRANSPORT_MODES.find((m) => m.key === r.transportMode)
                        ?.icon ?? Footprints;
                    const names = r.locationIds
                      .map((lid) => {
                        const ol = sortedLocations.find(
                          (l) => l.location_id === lid
                        );
                        return ol?.location.name ?? "?";
                      })
                      .join(" → ");
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex items-center gap-2 rounded border-l-[3px] bg-muted/30 px-2 py-1.5 text-xs",
                          ROUTE_COLORS[r.colorIndex]
                        )}
                      >
                        <MIcon
                          size={12}
                          className="shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">{names}</span>
                        <span className="shrink-0 text-muted-foreground">
                          — min
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRoute(r.id)}
                          aria-label="Delete route"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Action bar ── */}
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <AddLocationsToOptionDialog
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus size={12} />
                      Add locations
                    </Button>
                  }
                  allLocations={tripLocations}
                  alreadyAddedIds={alreadyAddedIds}
                  startingCity={currentOption.starting_city}
                  endingCity={currentOption.ending_city}
                  onConfirm={(ids) =>
                    onAddLocations(day.id, currentOption.id, ids)
                  }
                />
                {sortedLocations.length >= 2 && !linkingRoute && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={handleStartLinking}
                  >
                    <Route size={12} />
                    Link route
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 text-xs",
                    showMap ? "text-primary" : "text-muted-foreground"
                  )}
                  onClick={() => setShowMap((v) => !v)}
                >
                  <MapPin size={12} />
                  Map
                </Button>
              </div>

              {/* ── Map panel ── */}
              {showMap && (
                <div className="mt-2 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
                    <MapPin size={32} className="opacity-40" />
                    <p className="text-sm font-medium">Map view</p>
                    <p className="text-xs">
                      {sortedLocations.length} location
                      {sortedLocations.length !== 1 ? "s" : ""} will appear here
                      {routes.length > 0 &&
                        ` with ${routes.length} route${routes.length !== 1 ? "s" : ""} connected`}
                    </p>
                    <p className="text-[10px] italic">
                      Google Maps integration coming soon
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
          {!currentOption && (
            <p className="text-sm text-muted-foreground">No locations</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
