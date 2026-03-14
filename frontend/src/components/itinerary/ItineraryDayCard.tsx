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
import { ItineraryDayMap } from "@/components/itinerary/ItineraryDayMap";
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
  MapPin,
  Car,
  Footprints,
  TrainFront,
  Plus,
  X,
  ArrowRight,
  Trash2,
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
  },
  {
    bar: "border-l-emerald-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-400",
  },
  {
    bar: "border-l-orange-400",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-400",
  },
  {
    bar: "border-l-violet-400",
    bg: "bg-violet-50",
    text: "text-violet-700",
    dot: "bg-violet-400",
  },
  {
    bar: "border-l-rose-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-400",
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

function formatRouteTime(route?: {
  duration_seconds?: number | null;
}): string {
  if (!route || route.duration_seconds == null) return "— min";
  return `${Math.round(route.duration_seconds / 60)} min`;
}

function formatRouteDistance(route?: {
  distance_meters?: number | null;
}): string {
  if (!route || route.distance_meters == null) return "— km";
  const km = route.distance_meters / 1000;
  const decimals = km >= 10 ? 0 : 1;
  return `${km.toFixed(decimals)} km`;
}

// Grid column template shared by header + rows.
// Layout priorities:
// - Time + location get most space.
// - Remaining columns are compact action/info columns.
const GRID_COLS =
  "grid-cols-[1.5rem_5.5rem_minmax(7rem,1.5fr)_auto_1.5rem_auto_1.5rem]";

export interface ItineraryDayCardProps {
  day: ItineraryDay;
  tripId: string;
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
  onRoutesChanged: () => void;
}

export function ItineraryDayCard({
  day,
  tripId,
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
  onRoutesChanged,
}: ItineraryDayCardProps) {
  const dayLabel = day.date
    ? formatDate(day.date)
    : `Day ${day.sort_order + 1}`;
  const hasMultiOpts = day.options.length > 1;
  const canDelete = day.options.length > 1;
  const alreadyAdded = useMemo(
    () => new Set(currentOption?.locations.map((l) => l.location_id) ?? []),
    [currentOption]
  );

  // Routes from itinerary tree (loaded with tree, no separate fetch)
  const routes = useMemo(
    () => currentOption?.routes ?? [],
    [currentOption?.routes]
  );

  // Route creation
  const [creating, setCreating] = useState(false);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [pickTransport, setPickTransport] = useState<
    "walk" | "drive" | "transit"
  >("walk");
  const [savingRoute, setSavingRoute] = useState(false);

  async function handleSaveRoute() {
    if (pickIds.length < 2 || !currentOption) return;
    setSavingRoute(true);
    try {
      await api.itinerary.createRoute(tripId, day.id, currentOption.id, {
        transport_mode: pickTransport,
        label: null,
        location_ids: pickIds,
      });
      onRoutesChanged();
      setCreating(false);
      setPickIds([]);
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
        .map((ol) =>
          tripLocations.find((loc) => loc.id === ol.location_id)
        )
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
        })),
    [sorted, tripLocations]
  );

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

  function renderRow(ol: ItineraryOptionLocation) {
    const tk = ol.time_period || "morning";
    const tm = TIME_META[tk] ?? TIME_META.morning;
    const TIcon = tm.icon;
    const expanded = expandedId === ol.location_id;
    const isDrag = dragId === ol.location_id;
    const isDrop = dropId === ol.location_id && !isDrag;
    const bk = ol.location.requires_booking ?? "no";
    const showBk = bk === "yes" || bk === "yes_done";
    const routeInfos = locRouteMap.get(ol.location_id) ?? [];
    const picking = creating && pickIds.includes(ol.location_id);
    const pickSeq = pickIds.indexOf(ol.location_id) + 1;

    return (
      <div key={ol.location_id}>
        {/* Between rows: only forward segment connector (current → next). No incoming/reverse chip. */}
        <div
          className={cn(
            "group grid gap-x-3 items-center rounded-md px-1 py-1.5 text-sm transition-colors",
            GRID_COLS,
            isDrag && "opacity-40",
            isDrop && "ring-1 ring-primary ring-inset bg-accent/60",
            expanded ? "bg-accent/30" : "hover:bg-accent/20"
          )}
          onDragOver={(e) => onDragOver(ol.location_id, e)}
          onDragLeave={() => setDropId(null)}
          onDrop={(e) => onDrop(ol.location_id, e)}
        >
          {/* Col 1: drag or pick */}
          {creating ? (
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
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold mx-auto",
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

          {/* Col 2: time */}
          <div ref={tpOpen === ol.location_id ? tpTrigger : undefined}>
            <button
              type="button"
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium border border-transparent hover:border-border",
                tm.bg,
                tm.text
              )}
              onClick={() =>
                setTpOpen((p) => (p === ol.location_id ? null : ol.location_id))
              }
              aria-label={`Time: ${tm.label}`}
            >
              <TIcon className="h-3 w-3" size={12} />
              <span>{tm.label}</span>
            </button>
          </div>

          {/* Col 3: name + city */}
          <button
            type="button"
            className="min-w-0 text-left truncate flex items-center"
            onClick={() =>
              setExpandedId((p) =>
                p === ol.location_id ? null : ol.location_id
              )
            }
            aria-expanded={expanded}
          >
            {routeInfos.length > 0 && (
              <span className="inline-flex items-center gap-1 mr-1.5 shrink-0">
                {routeInfos.map((info) => (
                  <span
                    key={info.route.route_id}
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white",
                      info.color.dot
                    )}
                    title={`${info.route.transport_mode} route, stop ${info.idx + 1}`}
                  >
                    {info.idx + 1}
                  </span>
                ))}
              </span>
            )}
            <span className="font-medium truncate">{ol.location.name}</span>
            {ol.location.city && (
              <span className="ml-1.5 text-muted-foreground text-xs shrink-0">
                {ol.location.city}
              </span>
            )}
          </button>

          {/* Col 4: booking */}
          <div className="flex justify-start">
            {showBk && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  bk === "yes_done"
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-700"
                )}
              >
                <Ticket size={10} />
                {bk === "yes_done" ? "Booked" : "Book"}
              </span>
            )}
          </div>

          {/* Col 5: spacer */}
          <div />

          {/* Col 6: map */}
          <div className="flex justify-center">
            {ol.location.google_link ? (
              <a
                href={ol.location.google_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary"
                aria-label={`Map: ${ol.location.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} />
              </a>
            ) : (
              <span className="text-muted-foreground/30">—</span>
            )}
          </div>

          {/* Col 7: remove */}
          {!creating && currentOption && (
            <button
              type="button"
              className="text-muted-foreground/30 opacity-0 transition hover:text-destructive group-hover:opacity-100"
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
        {expanded && (
          <div className="ml-8 mr-6 mb-1 rounded-b-lg bg-accent/15 px-3 py-2 text-xs space-y-1">
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
                <span className="whitespace-pre-wrap">{ol.location.note}</span>
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

        {/* Route connector between consecutive stops */}
        {routeInfos.map((info) => {
          const isLastLeg =
            info.idx === info.route.location_ids.length - 1;
          const Icon =
            TRANSPORT.find((t) => t.key === info.route.transport_mode)
              ?.icon ?? null;
          if (isLastLeg || !Icon) return null;
          return (
            <div
              key={info.route.route_id}
              className="flex items-center gap-2 py-0.5 pl-[1.5rem] ml-[6rem]"
            >
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                  info.color.bg,
                  info.color.text
                )}
              >
                <span className="text-muted-foreground/60">↓</span>
                <Icon size={10} />
                <span>
                  {formatRouteTime(info.route)} ·{" "}
                  {formatRouteDistance(info.route)}
                </span>
              </div>
            </div>
          );
        })}
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
            <h3 className="text-base font-semibold">{dayLabel}</h3>
            {currentOption && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <AutosaveInput
                  id={`sc-${currentOption.id}`}
                  placeholder="From"
                  initialValue={currentOption.starting_city ?? ""}
                  onSave={async (v) => {
                    const n = v || null;
                    if (n === (currentOption.starting_city ?? null)) return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      starting_city: n,
                    });
                  }}
                  className="w-20 text-xs"
                />
                <ArrowRight size={11} className="shrink-0 opacity-40" />
                <AutosaveInput
                  id={`ec-${currentOption.id}`}
                  placeholder="To"
                  initialValue={currentOption.ending_city ?? ""}
                  onSave={async (v) => {
                    const n = v || null;
                    if (n === (currentOption.ending_city ?? null)) return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      ending_city: n,
                    });
                  }}
                  className="w-20 text-xs"
                />
                <AutosaveInput
                  id={`cb-${currentOption.id}`}
                  placeholder="by…"
                  initialValue={currentOption.created_by ?? ""}
                  onSave={async (v) => {
                    const n = v || null;
                    if (n === (currentOption.created_by ?? null)) return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      created_by: n,
                    });
                  }}
                  className="w-16 text-xs italic"
                />
              </div>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {hasMultiOpts && (
                <select
                  aria-label={`Select option for ${dayLabel}`}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                  value={currentOption?.id ?? ""}
                  onChange={(e) => onSelectOption(day.id, e.target.value)}
                >
                  {day.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.option_index === 1
                        ? "Main plan"
                        : `Alt ${o.option_index - 1}`}
                      {o.created_by ? ` (${o.created_by})` : ""}
                    </option>
                  ))}
                </select>
              )}
              {canDelete && currentOption && (
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
                  description={`"${currentOption.option_index === 1 ? "Main plan" : `Alt ${currentOption.option_index - 1}`}" will be removed.`}
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
              {/* Column headers */}
              {sorted.length > 0 && (
                <div
                  className={cn(
                    "grid gap-x-3 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 border-b border-border/50 mb-1",
                    GRID_COLS
                  )}
                >
                  <div />
                  <div>Time</div>
                  <div>Location</div>
                  <div className="text-left">Booking</div>
                  <div />
                  <div className="text-center">Map</div>
                  <div />
                </div>
              )}

              {/* Location rows */}
              {sorted.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No locations yet
                </p>
              ) : (
                <div className="space-y-0">{sorted.map(renderRow)}</div>
              )}

              {/* Route creation bar */}
              {creating && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                  <span className="text-xs font-medium text-primary">
                    Click locations in order
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
                    onClick={() => {
                      setCreating(false);
                      setPickIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Saved routes */}
              {routes.length > 0 && !creating && (
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
                    return (
                      <div
                        key={r.route_id}
                        className={cn(
                          "flex items-center gap-2 rounded border-l-[3px] px-2 py-1 text-xs",
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
                        >
                          {names}
                        </span>
                        <span className="text-muted-foreground">
                          {formatRouteTime(r)} · {formatRouteDistance(r)}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRoute(r.route_id)}
                          aria-label="Delete route"
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
                {sorted.length >= 2 && !creating && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground"
                    onClick={() => {
                      setCreating(true);
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
                    <ItineraryDayMap locations={mapLocations} />
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
