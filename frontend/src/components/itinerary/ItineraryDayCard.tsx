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
  api,
  type ItineraryDay,
  type ItineraryOption,
  type ItineraryOptionLocation,
  type Location,
} from "@/lib/api";
import {
  ItineraryDayMap,
  type MapRoutePolyline,
} from "@/components/itinerary/ItineraryDayMap";
import { AddLocationsToOptionDialog } from "@/components/itinerary/AddLocationsToOptionDialog";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  Sunrise,
  Sun,
  Sunset,
  Moon,
  ExternalLink,
  Ticket,
  GripVertical,
  MapPin,
  Car,
  Footprints,
  TrainFront,
  Plus,
  X,
  ArrowRight,
  Trash2,
  AlertCircle,
  Pencil,
  ChevronDown,
  Check,
} from "lucide-react";

const TIME_META: Record<
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

const TRANSPORT = [
  { key: "walk", label: "Walk", icon: Footprints },
  { key: "drive", label: "Drive", icon: Car },
  { key: "transit", label: "Transit", icon: TrainFront },
] as const;

const ROUTE_COLORS = [
  {
    bar: "border-l-blue-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-400",
    hex: "#60a5fa",
  },
  {
    bar: "border-l-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
    hex: "#34d399",
  },
  {
    bar: "border-l-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
    hex: "#fb923c",
  },
  {
    bar: "border-l-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-400",
    hex: "#a78bfa",
  },
  {
    bar: "border-l-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-400",
    hex: "#fb7185",
  },
];

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
  const commit = useCallback(async () => {
    const t = value.trim();
    if (t === savedRef.current) return;
    savedRef.current = t;
    await onSave(t);
  }, [value, onSave]);
  return (
    <input
      id={id}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "h-7 rounded border border-transparent bg-transparent px-1.5 text-sm transition-colors hover:border-input focus:border-input focus:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    />
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function previewText(value: string | null | undefined, max: number): string {
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatHoursLines(value: string | null | undefined): string[] {
  if (!value) return [];
  // Normalize newlines
  const normalized = value.replace(/\r\n/g, "\n");
  // If there are explicit delimiters like | or ;, prefer those
  if (/[|;]/.test(normalized)) {
    return normalized
      .split(/[|;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  // Otherwise, if there are line breaks, keep them as separate rows
  if (/\n/.test(normalized)) {
    return normalized
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  // Fallback: single line as-is
  const trimmed = normalized.trim();
  return trimmed ? [trimmed] : [];
}

/** Format a duration in seconds to human-readable string. */
function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** Format duration for route totals only. Do not use for segment pills. */
function formatRouteTotalDuration(route: {
  duration_seconds?: number | null;
}): string {
  if (route.duration_seconds == null) return "— min";
  return formatDuration(route.duration_seconds);
}

/** Format distance for route totals only. Do not use for segment pills. */
function formatRouteTotalDistance(route: {
  distance_meters?: number | null;
}): string {
  if (route.distance_meters == null) return "— km";
  const km = route.distance_meters / 1000;
  const decimals = km >= 10 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
}

/** Format a single segment's metrics (one leg). Use only for segment pills, never for route totals. */
function formatSegmentMetrics(
  segment:
    | {
        duration_seconds?: number | null;
        distance_meters?: number | null;
      }
    | null
    | undefined
): string {
  if (
    !segment ||
    (segment.duration_seconds == null && segment.distance_meters == null)
  ) {
    return "— min · — km";
  }
  const dur =
    segment.duration_seconds != null
      ? formatDuration(segment.duration_seconds)
      : "— min";
  const dist =
    segment.distance_meters != null
      ? (() => {
          const km = segment.distance_meters / 1000;
          const decimals = km >= 10 ? 0 : 1;
          return `${km.toFixed(decimals)} km`;
        })()
      : "— km";
  return `${dur} · ${dist}`;
}

export interface ItineraryDayCardProps {
  day: ItineraryDay;
  tripId: string;
  currentOption: ItineraryOption | undefined;
  tripLocations: Location[];
  createOptionLoading: boolean;
  tripStartDate: string | null;
  tripEndDate: string | null;
  onUpdateDayDate: (
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) => void;
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
  onRoutesChanged: () => void;
  /** After route is created, parent triggers calculation and passes back updated route. */
  onRouteCreated: (
    dayId: string,
    optionId: string,
    routeResponse: import("@/lib/api").RouteResponse
  ) => Promise<void>;
  /** Retry calculating metrics for a route that previously failed. */
  onRetryRouteMetrics: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => Promise<void>;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
}

export function ItineraryDayCard({
  day,
  tripId,
  currentOption,
  tripLocations,
  createOptionLoading,
  tripStartDate,
  tripEndDate,
  onUpdateDayDate,
  onSelectOption,
  onCreateAlternative,
  onDeleteOption,
  onSaveOptionDetails,
  onAddLocations,
  onRemoveLocation,
  onUpdateTimePeriod,
  onReorderLocations,
  onRoutesChanged,
  onRouteCreated,
  onRetryRouteMetrics,
  calculatingRouteId,
  routeMetricsError,
}: ItineraryDayCardProps) {
  const dayLabel = day.date
    ? formatDate(day.date)
    : `Day ${day.sort_order + 1}`;
  const [editingDate, setEditingDate] = useState(false);
  const alreadyAdded = useMemo(
    () => new Set(currentOption?.locations.map((l) => l.location_id) ?? []),
    [currentOption]
  );

  // Routes from itinerary tree (loaded with tree, no separate fetch)
  const routes = useMemo(
    () => currentOption?.routes ?? [],
    [currentOption?.routes]
  );

  // Route creation / editing
  const [creating, setCreating] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [pickTransport, setPickTransport] = useState<
    "walk" | "drive" | "transit"
  >("walk");
  const [savingRoute, setSavingRoute] = useState(false);

  const isPickMode = creating || editingRouteId !== null;

  function handleEditRoute(route: (typeof routes)[0]) {
    setEditingRouteId(route.route_id);
    setPickIds([...route.location_ids]);
    setPickTransport(
      (route.transport_mode as "walk" | "drive" | "transit") || "walk"
    );
    setCreating(false);
  }

  function handleCancelPick() {
    setCreating(false);
    setEditingRouteId(null);
    setPickIds([]);
  }

  async function handleSaveRoute() {
    if (pickIds.length < 2 || !currentOption) return;
    setSavingRoute(true);
    try {
      if (editingRouteId) {
        const routeResponse = await api.itinerary.updateRoute(
          tripId,
          day.id,
          currentOption.id,
          editingRouteId,
          {
            transport_mode: pickTransport,
            location_ids: pickIds,
          }
        );
        setEditingRouteId(null);
        setPickIds([]);
        await onRouteCreated(day.id, currentOption.id, routeResponse);
      } else {
        const routeResponse = await api.itinerary.createRoute(
          tripId,
          day.id,
          currentOption.id,
          {
            transport_mode: pickTransport,
            label: null,
            location_ids: pickIds,
          }
        );
        setCreating(false);
        setPickIds([]);
        await onRouteCreated(day.id, currentOption.id, routeResponse);
      }
    } catch {
      /* error shown by parent */
    } finally {
      setSavingRoute(false);
    }
  }

  async function handleDeleteRoute(routeId: string) {
    if (!currentOption) return;
    try {
      await api.itinerary.deleteRoute(
        tripId,
        day.id,
        currentOption.id,
        routeId
      );
      onRoutesChanged();
    } catch {
      /* swallow */
    }
  }

  // Build lookup: locationId → all route memberships (a location can belong to multiple routes).
  const locRouteMap = useMemo(() => {
    const m = new Map<
      string,
      {
        route: (typeof routes)[0];
        idx: number;
        color: (typeof ROUTE_COLORS)[0];
      }[]
    >();
    routes.forEach((r, ri) => {
      const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
      r.location_ids.forEach((lid, idx) => {
        const arr = m.get(lid) ?? [];
        arr.push({ route: r, idx, color });
        m.set(lid, arr);
      });
    });
    return m;
  }, [routes]);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  // Time picker
  const [tpOpen, setTpOpen] = useState<string | null>(null);
  const [tpPos, setTpPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const tpTrigger = useRef<HTMLDivElement | null>(null);
  const tpDrop = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!tpOpen) {
      setTpPos(null);
      return;
    }
    const el = tpTrigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 168));
    setTpPos(
      below < 200
        ? { bottom: window.innerHeight - r.top + 4, left }
        : { top: r.bottom + 4, left }
    );
  }, [tpOpen]);

  useEffect(() => {
    if (!tpOpen) return;
    const c = () => setTpOpen(null);
    document.addEventListener("scroll", c, true);
    return () => document.removeEventListener("scroll", c, true);
  }, [tpOpen]);
  useEffect(() => {
    if (!tpOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tpTrigger.current?.contains(t) || tpDrop.current?.contains(t)) return;
      setTpOpen(null);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [tpOpen]);

  // Option dropdown state
  const [optOpen, setOptOpen] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [pendingAltName, setPendingAltName] = useState<string | null>(null);
  const optTriggerRef = useRef<HTMLButtonElement | null>(null);
  const optDropRef = useRef<HTMLDivElement | null>(null);
  const prevOptionsLengthRef = useRef(day.options.length);

  // Close option dropdown on outside click
  useEffect(() => {
    if (!optOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (optTriggerRef.current?.contains(t) || optDropRef.current?.contains(t))
        return;
      // Don't close while a modal dialog is open (e.g. ConfirmDialog) —
      // mousedown on dialog buttons would otherwise unmount ConfirmDialog
      // before its click handler fires, swallowing the confirmation.
      if ((t as Element).closest?.('[role="dialog"]')) return;
      setOptOpen(false);
      setAddingPlan(false);
      setRenamingOptionId(null);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [optOpen]);

  // Auto-save plan name and switch to new option once it appears
  useEffect(() => {
    if (pendingAltName === null) return;
    if (day.options.length <= prevOptionsLengthRef.current) return;
    prevOptionsLengthRef.current = day.options.length;
    const newest = [...day.options].sort(
      (a, b) => b.option_index - a.option_index
    )[0];
    if (newest) {
      onSaveOptionDetails(day.id, newest.id, { created_by: pendingAltName });
      onSelectOption(day.id, newest.id);
    }
    setPendingAltName(null);
  }, [day.options]); // eslint-disable-line react-hooks/exhaustive-deps

  function optionLabel(o: ItineraryOption): string {
    if (o.option_index === 1) return o.created_by || "Main plan";
    return o.created_by || `Plan ${o.option_index - 1}`;
  }

  function handleAddPlan() {
    const name = newPlanName.trim();
    if (!name) return;
    setPendingAltName(name);
    setNewPlanName("");
    setAddingPlan(false);
    setOptOpen(false);
    onCreateAlternative(day.id);
  }

  const [showMap, setShowMap] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      currentOption
        ? [...currentOption.locations].sort(
            (a, b) => a.sort_order - b.sort_order
          )
        : [],
    [currentOption]
  );

  const mapLocations = useMemo(
    () =>
      sorted
        .map((ol) => tripLocations.find((loc) => loc.id === ol.location_id))
        .filter(
          (loc): loc is Location =>
            !!loc &&
            typeof loc.latitude === "number" &&
            typeof loc.longitude === "number"
        )
        .map((loc) => ({
          id: loc.id,
          name: loc.name,
          address: loc.address,
          latitude: loc.latitude as number,
          longitude: loc.longitude as number,
          category: loc.category ?? null,
        })),
    [sorted, tripLocations]
  );

  const mapRoutes: MapRoutePolyline[] = useMemo(() => {
    if (!routes.length) return [];
    return routes
      .map((route, ri) => {
        const polylines = (route.segments ?? [])
          .filter((s) => s.encoded_polyline)
          .sort((a, b) => a.segment_order - b.segment_order)
          .map((s) => s.encoded_polyline!);
        if (polylines.length === 0) return null;
        const dur = formatRouteTotalDuration(route);
        const dist = formatRouteTotalDistance(route);
        return {
          routeId: route.route_id,
          color: ROUTE_COLORS[ri % ROUTE_COLORS.length].hex,
          encodedPolylines: polylines,
          label: `${dur} · ${dist}`,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [routes]);

  // Drag handlers
  function onDragStart(locId: string, e: React.DragEvent) {
    setDragId(locId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", locId);
  }
  function onDragEnd() {
    setDragId(null);
    setDropId(null);
  }
  function onDragOver(locId: string, e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragId) setDropId(locId);
  }
  function onDrop(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    setDropId(null);
    if (!dragId || !currentOption || dragId === targetId) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.location_id === dragId);
    const ti = sorted.findIndex((l) => l.location_id === targetId);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.splice(ti > fi ? ti - 1 : ti, 0, rm);
    setDragId(null);
    onReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.location_id)
    );
  }

  function onDropAtEnd(e: React.DragEvent) {
    e.preventDefault();
    setDropId(null);
    if (!dragId || !currentOption) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.location_id === dragId);
    if (fi < 0 || fi === sorted.length - 1) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.push(rm);
    setDragId(null);
    onReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.location_id)
    );
  }

  function renderRow(ol: ItineraryOptionLocation, index: number) {
    const tk = ol.time_period || "morning";
    const tm = TIME_META[tk] ?? TIME_META.morning;
    const TIcon = tm.icon;
    const expanded = expandedId === ol.location_id;
    const isDrag = dragId === ol.location_id;
    const isDrop = dropId === ol.location_id && !isDrag;
    const bk = ol.location.requires_booking ?? "no";
    const showBk = bk === "yes" || bk === "yes_done";
    const routeInfos = locRouteMap.get(ol.location_id) ?? [];
    const picking = isPickMode && pickIds.includes(ol.location_id);
    const pickSeq = pickIds.indexOf(ol.location_id) + 1;

    const prevOl = sorted[index - 1];
    const nextOl = sorted[index + 1];

    // Top connector: is prevOl the preceding stop in the same route?
    let topConnectorHex: string | null = null;
    if (prevOl) {
      for (const info of routeInfos) {
        if (
          info.idx > 0 &&
          info.route.location_ids[info.idx - 1] === prevOl.location_id
        ) {
          topConnectorHex = info.color.hex;
          break;
        }
      }
    }

    // Bottom connector: is nextOl the following stop in the same route?
    let bottomConnectorHex: string | null = null;
    if (nextOl) {
      for (const info of routeInfos) {
        const nextIdx = info.idx + 1;
        if (
          nextIdx < info.route.location_ids.length &&
          info.route.location_ids[nextIdx] === nextOl.location_id
        ) {
          bottomConnectorHex = info.color.hex;
          break;
        }
      }
    }

    const catMeta = ol.location.category
      ? CATEGORY_META[ol.location.category as CategoryKey]
      : null;

    return (
      <div key={ol.location_id} className="flex gap-2">
        {/* Col A: drag handle or pick button */}
        <div className="pt-2 w-5 shrink-0 flex justify-center">
          {isPickMode ? (
            <button
              type="button"
              onClick={() =>
                setPickIds((p) =>
                  p.includes(ol.location_id)
                    ? p.filter((x) => x !== ol.location_id)
                    : [...p, ol.location_id]
                )
              }
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                picking
                  ? "bg-primary text-primary-foreground"
                  : "border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary"
              )}
            >
              {picking ? pickSeq : <Plus size={10} />}
            </button>
          ) : (
            <div
              className="flex cursor-grab items-center justify-center text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
              draggable
              onDragStart={(e) => onDragStart(ol.location_id, e)}
              onDragEnd={onDragEnd}
              aria-label={`Drag ${ol.location.name}`}
            >
              <GripVertical size={14} />
            </div>
          )}
        </div>

        {/* Col B: timeline gutter (line + dot) */}
        <div className="flex flex-col items-center w-4 shrink-0">
          <div
            className="w-0.5 h-3"
            style={{ backgroundColor: topConnectorHex ?? "transparent" }}
          />
          <div
            className={cn(
              "w-3 h-3 rounded-full border-2 border-white shadow-sm shrink-0",
              catMeta?.bg ?? "bg-muted"
            )}
          />
          <div
            className="w-0.5 flex-1 min-h-3"
            style={{ backgroundColor: bottomConnectorHex ?? "transparent" }}
          />
        </div>

        {/* Col C: content area */}
        <div
          className={cn(
            "flex-1 min-w-0 pb-1",
            isDrop && "ring-1 ring-primary ring-inset rounded-md bg-accent/60"
          )}
          onDragOver={(e) => onDragOver(ol.location_id, e)}
          onDragLeave={() => setDropId(null)}
          onDrop={(e) => onDrop(ol.location_id, e)}
        >
          {/* Main row */}
          <div
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              isDrag && "opacity-40",
              expanded ? "bg-accent/30" : "hover:bg-accent/20"
            )}
          >
            {/* Left: category icon + route badges + name + city — flex-1 */}
            <button
              type="button"
              className="min-w-0 text-left flex items-center gap-1.5 flex-1"
              onClick={() =>
                setExpandedId((p) =>
                  p === ol.location_id ? null : ol.location_id
                )
              }
              aria-expanded={expanded}
            >
              {/* Category icon */}
              {ol.location.category && (
                <CategoryIcon
                  category={ol.location.category as CategoryKey}
                  size={13}
                  className="shrink-0 text-muted-foreground/50"
                />
              )}
              {/* Route badges */}
              {routeInfos.length > 0 && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  {routeInfos.map((info) => (
                    <span
                      key={info.route.route_id}
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[8px] font-bold"
                      style={{
                        borderColor: info.color.hex,
                        color: info.color.hex,
                      }}
                      title={`${info.route.transport_mode} route, stop ${info.idx + 1}`}
                    >
                      {info.idx + 1}
                    </span>
                  ))}
                </span>
              )}
              {/* Name */}
              <span className="font-medium truncate">{ol.location.name}</span>
              {/* City */}
              {ol.location.city && (
                <span className="text-muted-foreground/60 text-xs shrink-0">
                  {ol.location.city}
                </span>
              )}
            </button>

            {/* Booked badge — always visible when present */}
            {showBk && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  bk === "yes_done"
                    ? "border-green-200 text-green-700"
                    : "border-amber-200 text-amber-700"
                )}
              >
                <Ticket size={9} />
                {bk === "yes_done" ? "Booked" : "Book"}
              </span>
            )}

            {/* Map link — always visible, subtle */}
            {ol.location.google_link ? (
              <a
                href={ol.location.google_link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors"
                aria-label={`Map: ${ol.location.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
              </a>
            ) : null}

            {/* Time period badge — RIGHT, always visible, bg-muted + chevron = obviously clickable */}
            <div ref={tpOpen === ol.location_id ? tpTrigger : undefined}>
              <button
                type="button"
                className="shrink-0 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() =>
                  setTpOpen((p) =>
                    p === ol.location_id ? null : ol.location_id
                  )
                }
                aria-label={`Time: ${tm.label}`}
              >
                <TIcon size={10} className="shrink-0" />
                <span className="w-[52px]">{tm.label}</span>
                <ChevronDown size={9} className="opacity-40" />
              </button>
            </div>

            {/* Remove button — hover only */}
            {!isPickMode && currentOption && (
              <button
                type="button"
                className="shrink-0 text-muted-foreground/30 opacity-0 transition hover:text-destructive group-hover:opacity-100"
                aria-label={`Remove ${ol.location.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveLocation(day.id, currentOption.id, ol.location_id);
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="ml-1 mr-4 mb-1 rounded-b-lg bg-accent/15 px-3 py-2 text-xs space-y-1">
              {ol.location.address && (
                <div>
                  <span className="text-muted-foreground">Address:</span>{" "}
                  {ol.location.address}
                </div>
              )}
              {ol.location.category && (
                <div>
                  <span className="text-muted-foreground">Category:</span>{" "}
                  {ol.location.category}
                </div>
              )}
              {ol.location.note && (
                <div>
                  <span className="text-muted-foreground">Note:</span>{" "}
                  <span className="whitespace-pre-wrap">
                    {ol.location.note}
                  </span>
                </div>
              )}
              {ol.location.working_hours && (
                <div>
                  <span className="text-muted-foreground">Hours:</span>{" "}
                  <span className="whitespace-pre-wrap">
                    {formatHoursLines(ol.location.working_hours).map(
                      (line, idx) => (
                        <span key={idx} className="block">
                          {line}
                        </span>
                      )
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Segment connector — muted, left-aligned with route color bar */}
          {routeInfos.map((info) => {
            const isLastLeg = info.idx === info.route.location_ids.length - 1;
            const Icon =
              TRANSPORT.find((t) => t.key === info.route.transport_mode)
                ?.icon ?? null;
            if (isLastLeg || !Icon) return null;
            const isCalculatingLeg = calculatingRouteId === info.route.route_id;
            return (
              <div
                key={info.route.route_id}
                className="flex items-center gap-1.5 py-0.5 pl-2 text-xs text-muted-foreground/70"
              >
                <div
                  className="w-0.5 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: info.color.hex }}
                />
                <Icon
                  size={10}
                  className="shrink-0"
                  style={{ color: info.color.hex }}
                />
                <span>
                  {isCalculatingLeg ? (
                    <>
                      <LoadingSpinner
                        size="sm"
                        className="inline-block h-3 w-3 align-middle"
                      />{" "}
                      Calculating…
                    </>
                  ) : (
                    formatSegmentMetrics(info.route.segments?.[info.idx])
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Time picker portal
  const tpPortal =
    tpOpen && tpPos && currentOption
      ? (() => {
          const ol = sorted.find((l) => l.location_id === tpOpen);
          if (!ol) return null;
          const style: CSSProperties = {
            position: "fixed",
            left: tpPos.left,
            zIndex: 9999,
            width: 160,
            ...(tpPos.top !== undefined
              ? { top: tpPos.top }
              : { bottom: tpPos.bottom }),
          };
          return createPortal(
            <div
              ref={tpDrop}
              className="rounded-md border border-border bg-popover p-1 text-xs shadow-md"
              style={style}
              role="listbox"
            >
              {(["morning", "afternoon", "evening", "night"] as const).map(
                (k) => {
                  const m = TIME_META[k];
                  const I = m.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="option"
                      aria-selected={k === (ol.time_period || "morning")}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left",
                        k === (ol.time_period || "morning")
                          ? "bg-accent"
                          : "hover:bg-accent"
                      )}
                      onClick={() => {
                        setTpOpen(null);
                        onUpdateTimePeriod(
                          day.id,
                          currentOption.id,
                          ol.location_id,
                          k
                        );
                      }}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full",
                          m.bg,
                          m.text
                        )}
                      >
                        <I className="h-3 w-3" size={12} />
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
      {tpPortal}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-semibold">{dayLabel}</h3>
              {editingDate ? (
                <input
                  type="date"
                  ref={(el) => {
                    if (!el) return;
                    el.focus();
                    try {
                      (
                        el as HTMLInputElement & { showPicker?: () => void }
                      ).showPicker?.();
                    } catch {
                      /* showPicker not supported */
                    }
                  }}
                  defaultValue={day.date ?? ""}
                  min={tripStartDate ?? undefined}
                  max={tripEndDate ?? undefined}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    if (v && v !== (day.date ?? null)) {
                      setEditingDate(false);
                      onUpdateDayDate(day.id, v, currentOption?.id);
                    }
                  }}
                  onBlur={() => setEditingDate(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingDate(false);
                  }}
                  className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                />
              ) : (
                <button
                  onClick={() => setEditingDate(true)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Edit day date"
                  title={day.date ? "Change date" : "Assign a date"}
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
            {currentOption && (
              <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground shrink-0">
                <span className="opacity-50 text-[10px] shrink-0">from</span>
                <AutosaveInput
                  id={`sc-${currentOption.id}`}
                  placeholder="start city"
                  initialValue={currentOption.starting_city ?? ""}
                  onSave={async (v) => {
                    const n = v || null;
                    if (n === (currentOption.starting_city ?? null)) return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      starting_city: n,
                    });
                  }}
                  className="w-24 text-xs"
                />
                <ArrowRight size={10} className="shrink-0 opacity-30" />
                <AutosaveInput
                  id={`ec-${currentOption.id}`}
                  placeholder="end city"
                  initialValue={currentOption.ending_city ?? ""}
                  onSave={async (v) => {
                    const n = v || null;
                    if (n === (currentOption.ending_city ?? null)) return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      ending_city: n,
                    });
                  }}
                  className="w-24 text-xs"
                />
              </div>
            )}
            <div className="flex-1" />

            {/* Option dropdown */}
            <div className="relative shrink-0">
              <button
                ref={optTriggerRef}
                type="button"
                onClick={() => {
                  setOptOpen((v) => !v);
                  setAddingPlan(false);
                  setRenamingOptionId(null);
                }}
                className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
                aria-label="Switch day plan"
              >
                <span className="max-w-[120px] truncate">
                  {currentOption ? optionLabel(currentOption) : "No plan"}
                </span>
                <ChevronDown size={11} className="shrink-0 opacity-50" />
              </button>

              {optOpen && (
                <div
                  ref={optDropRef}
                  className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border border-border bg-popover shadow-md p-1"
                >
                  {day.options.map((o) => {
                    const label = optionLabel(o);
                    const isActive = o.id === currentOption?.id;
                    const canDel =
                      day.options.length > 1 && o.option_index !== 1;
                    return (
                      <div
                        key={o.id}
                        className="group flex items-center gap-1 rounded-sm px-2 py-1.5 hover:bg-accent"
                      >
                        {renamingOptionId === o.id ? (
                          <input
                            autoFocus
                            defaultValue={o.created_by ?? ""}
                            placeholder="Plan name…"
                            className="flex-1 text-xs bg-transparent border-b border-primary outline-none py-0.5"
                            onBlur={(e) => {
                              const val = e.target.value.trim() || null;
                              onSaveOptionDetails(day.id, o.id, {
                                created_by: val,
                              });
                              setRenamingOptionId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                              if (e.key === "Escape") setRenamingOptionId(null);
                            }}
                          />
                        ) : (
                          <>
                            {isActive ? (
                              <Check
                                size={12}
                                className="shrink-0 text-primary"
                              />
                            ) : (
                              <div className="w-3 shrink-0" />
                            )}
                            <button
                              type="button"
                              className={cn(
                                "flex-1 text-left text-xs truncate",
                                isActive
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground"
                              )}
                              onClick={() => {
                                if (!isActive) onSelectOption(day.id, o.id);
                                setOptOpen(false);
                              }}
                            >
                              {label}
                            </button>
                            <button
                              type="button"
                              title="Rename"
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingOptionId(o.id);
                              }}
                            >
                              <Pencil size={10} />
                            </button>
                            {canDel && (
                              <ConfirmDialog
                                trigger={
                                  <button
                                    type="button"
                                    title="Delete plan"
                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-opacity"
                                  >
                                    <X size={10} />
                                  </button>
                                }
                                title="Delete this plan?"
                                description={`"${label}" and all its locations will be removed.`}
                                confirmLabel="Delete"
                                variant="destructive"
                                onConfirm={() => {
                                  onDeleteOption(day.id, o.id);
                                  setOptOpen(false);
                                }}
                              />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  <div className="border-t border-border mt-1 pt-1">
                    {addingPlan ? (
                      <div className="flex items-center gap-1.5 px-2 py-1">
                        <input
                          autoFocus
                          value={newPlanName}
                          onChange={(e) => setNewPlanName(e.target.value)}
                          placeholder="Plan name…"
                          className="flex-1 text-xs bg-transparent border-b border-primary outline-none py-0.5"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddPlan();
                            if (e.key === "Escape") setAddingPlan(false);
                          }}
                        />
                        <button
                          type="button"
                          className="text-xs text-primary font-medium hover:text-primary/80 disabled:opacity-40"
                          onClick={handleAddPlan}
                          disabled={createOptionLoading || !newPlanName.trim()}
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        onClick={() => {
                          setAddingPlan(true);
                          setNewPlanName("");
                        }}
                      >
                        <Plus size={11} />
                        Add plan
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {currentOption && (
            <>
              {/* Location rows */}
              {sorted.length === 0 ? (
                <div className="py-6 flex flex-col items-center gap-3 text-muted-foreground/50">
                  <div className="flex gap-2 items-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                      <div className="w-0.5 h-4 bg-muted-foreground/10" />
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                      <div className="w-0.5 h-4 bg-muted-foreground/10" />
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                    </div>
                    <p className="text-sm text-muted-foreground/60 ml-2">
                      No locations planned yet
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  {sorted.map((ol, idx) => renderRow(ol, idx))}
                  {/* End drop zone — allows dragging to last position */}
                  {dragId && (
                    <div
                      className={cn(
                        "mx-9 mt-0.5 h-7 rounded-md border-2 border-dashed transition-colors",
                        dropId === "__end__"
                          ? "border-primary bg-accent/30"
                          : "border-muted-foreground/20"
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDropId("__end__");
                      }}
                      onDragLeave={() => setDropId(null)}
                      onDrop={onDropAtEnd}
                    />
                  )}
                </div>
              )}

              {/* Route creation / edit bar */}
              {isPickMode && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="text-xs font-medium text-primary">
                    {editingRouteId
                      ? "Edit route — click to add/remove stops"
                      : "Click locations in order"}
                  </span>
                  <div className="flex-1" />
                  {TRANSPORT.map((m) => {
                    const MI = m.icon;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-medium",
                          pickTransport === m.key
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        )}
                        onClick={() => setPickTransport(m.key)}
                      >
                        <MI size={11} className="inline mr-0.5" />
                        {m.label}
                      </button>
                    );
                  })}
                  <Button
                    size="sm"
                    className="h-6 text-[11px]"
                    disabled={pickIds.length < 2 || savingRoute}
                    onClick={handleSaveRoute}
                  >
                    {savingRoute ? "Saving…" : `Save (${pickIds.length})`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={handleCancelPick}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Saved routes */}
              {routes.length > 0 && !isPickMode && (
                <div className="mt-2 space-y-1">
                  {routes.map((r, ri) => {
                    const color = ROUTE_COLORS[ri % ROUTE_COLORS.length];
                    const MI =
                      TRANSPORT.find((t) => t.key === r.transport_mode)?.icon ??
                      Footprints;
                    const names = r.location_ids
                      .map(
                        (lid) =>
                          sorted.find((l) => l.location_id === lid)?.location
                            .name ?? "?"
                      )
                      .join(" → ");
                    const isCalculating = calculatingRouteId === r.route_id;
                    const metricsError = routeMetricsError[r.route_id];
                    return (
                      <div
                        key={r.route_id}
                        className={cn(
                          "flex items-center gap-2 rounded border-l-[3px] px-2 py-1.5 text-xs",
                          color.bar,
                          color.bg
                        )}
                      >
                        <MI size={12} className={cn("shrink-0", color.text)} />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-medium",
                            color.text
                          )}
                          title={names}
                        >
                          {names}
                        </span>
                        {isCalculating && (
                          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                            <LoadingSpinner size="sm" className="shrink-0" />
                            <span>Calculating…</span>
                          </span>
                        )}
                        {!isCalculating && metricsError && (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                              <AlertCircle size={11} />
                              <span
                                className="max-w-[140px] truncate"
                                title={metricsError}
                              >
                                Metrics unavailable
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px]"
                              onClick={() =>
                                onRetryRouteMetrics(
                                  day.id,
                                  currentOption!.id,
                                  r.route_id
                                )
                              }
                            >
                              Retry
                            </Button>
                          </span>
                        )}
                        {!isCalculating && !metricsError && (
                          <span className="text-muted-foreground">
                            {formatRouteTotalDuration(r)} ·{" "}
                            {formatRouteTotalDistance(r)}
                            {r.route_status === "error" && (
                              <span
                                className="ml-1 text-amber-600"
                                title="Some segments could not be calculated"
                              >
                                (partial)
                              </span>
                            )}
                          </span>
                        )}
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-primary disabled:opacity-50"
                          onClick={() => handleEditRoute(r)}
                          aria-label="Edit route"
                          disabled={isCalculating}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                          onClick={() => handleDeleteRoute(r.route_id)}
                          aria-label="Delete route"
                          disabled={isCalculating}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actions row — two groups */}
              <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
                {/* Left: locations */}
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
                  alreadyAddedIds={alreadyAdded}
                  startingCity={currentOption.starting_city}
                  endingCity={currentOption.ending_city}
                  onConfirm={(ids) =>
                    onAddLocations(day.id, currentOption.id, ids)
                  }
                />

                {/* Separator */}
                {sorted.length >= 2 && <div className="h-4 w-px bg-border" />}

                {/* Middle: routes */}
                {sorted.length >= 2 && !isPickMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={() => {
                      setCreating(true);
                      setEditingRouteId(null);
                      setPickIds([]);
                      setPickTransport("walk");
                    }}
                  >
                    <Plus size={12} />
                    Create route
                  </Button>
                )}

                <div className="flex-1" />

                {/* Right: map */}
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

              {/* Map panel */}
              {showMap && (
                <div className="mt-2 rounded-lg border border-border bg-muted/20 p-4">
                  {mapLocations.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
                      <MapPin size={28} className="opacity-30" />
                      <p className="text-sm">
                        Map will appear when locations with coordinates are
                        added.
                      </p>
                    </div>
                  ) : (
                    <ItineraryDayMap
                      locations={mapLocations}
                      routes={mapRoutes}
                    />
                  )}
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
