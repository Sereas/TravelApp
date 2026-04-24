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
import { ItineraryDayHeader } from "@/components/itinerary/ItineraryDayHeader";
import { ItineraryDayTimeline } from "@/components/itinerary/ItineraryDayTimeline";
import {
  ItineraryRouteManager,
  RouteBuilderToolbar,
} from "@/components/itinerary/ItineraryRouteManager";
import type { TransportMode } from "@/components/itinerary/itinerary-route-constants";
import { AddLocationsToOptionDialog } from "@/components/itinerary/AddLocationsToOptionDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import { Sunrise, Sun, Sunset, Moon, Plus } from "lucide-react";

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
    bg: "bg-time-morning-bg",
    text: "text-time-morning-text",
  },
  afternoon: {
    label: "Afternoon",
    icon: Sun,
    bg: "bg-time-afternoon-bg",
    text: "text-time-afternoon-text",
  },
  evening: {
    label: "Evening",
    icon: Sunset,
    bg: "bg-time-evening-bg",
    text: "text-time-evening-text",
  },
  night: {
    label: "Night",
    icon: Moon,
    bg: "bg-time-night-bg",
    text: "text-time-night-text",
  },
};

import { ROUTE_COLORS } from "@/components/itinerary/itinerary-route-constants";
export { ROUTE_COLORS };

export interface ItineraryDayCardProps {
  day: ItineraryDay;
  tripId: string;
  currentOption: ItineraryOption | undefined;
  tripLocations: Location[];
  createOptionLoading: boolean;
  tripStartDate: string | null;
  tripEndDate: string | null;
  onSelectOption: (dayId: string, optionId: string) => void;
  /**
   * Mutation callbacks — all optional. When undefined (shared trip view),
   * the corresponding affordance is either hidden by `useReadOnly()` in the
   * descendant component or no-ops safely. Never called in read-only mode.
   */
  onUpdateDayDate?: (
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) => void;
  onCreateAlternative?: (
    dayId: string,
    name?: string
  ) => Promise<string | null> | void;
  onDeleteOption?: (dayId: string, optionId: string) => void;
  onSaveOptionDetails?: (
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) => void;
  onAddLocations?: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => Promise<void>;
  onRemoveLocation?: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
  onUpdateTimePeriod?: (
    dayId: string,
    optionId: string,
    locationId: string,
    timePeriod: string
  ) => void;
  onReorderLocations?: (
    dayId: string,
    optionId: string,
    locationIds: string[]
  ) => void;
  onDeleteRoute?: (dayId: string, optionId: string, routeId: string) => void;
  onRouteCreated?: (
    dayId: string,
    optionId: string,
    routeResponse: import("@/lib/api").RouteResponse
  ) => Promise<void>;
  onRetryRouteMetrics?: (
    dayId: string,
    optionId: string,
    routeId: string
  ) => void;
  calculatingRouteId: string | null;
  routeMetricsError: Record<string, string>;
  onInspectLocation: (dayId: string, locationId: string) => void;
  onLocationHover?: (locationId: string | null) => void;
  onLocationCreated?: (location: Location) => void;
}

// Shared no-op fallbacks used when mutation callbacks are omitted (shared
// trip view). Affordances that would actually call these are already gated
// by `useReadOnly()` in the descendant components, so these are safety nets,
// never executed at runtime. Hoisted so identities are stable across renders.
const noopAsync = async () => {};
const noopVoid = () => {};

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
  onDeleteRoute,
  onRouteCreated,
  onRetryRouteMetrics,
  calculatingRouteId,
  routeMetricsError,
  onInspectLocation,
  onLocationHover,
  onLocationCreated,
}: ItineraryDayCardProps) {
  const readOnly = useReadOnly();

  // Stable no-op fallbacks for missing mutation handlers. Descendant
  // components (`ItineraryDayHeader`, `ItineraryDayTimeline`,
  // `ItineraryRouteManager`) still declare required handler props, but the
  // code paths that trigger them are all wrapped in `{!readOnly && ...}`.
  // `onCreateAlternative` is NOT wrapped — it's passed raw to the header,
  // which gates the whole plan switcher on it.
  const safeUpdateDayDate = onUpdateDayDate ?? noopVoid;
  const safeDeleteOption = onDeleteOption ?? noopVoid;
  const safeSaveOptionDetails = onSaveOptionDetails ?? noopVoid;
  const safeRemoveLocation = onRemoveLocation ?? noopVoid;
  const safeUpdateTimePeriod = onUpdateTimePeriod ?? noopVoid;
  const safeReorderLocations = onReorderLocations ?? noopVoid;
  const safeRouteCreated = onRouteCreated ?? noopAsync;
  const safeRetryRouteMetrics = onRetryRouteMetrics ?? noopVoid;
  const alreadyAdded = useMemo(
    () => new Set(currentOption?.locations.map((l) => l.location_id) ?? []),
    [currentOption]
  );

  const routes = useMemo(
    () => currentOption?.routes ?? [],
    [currentOption?.routes]
  );

  // ── Route builder state (lifted from ItineraryRouteManager) ──────────
  const [builderMode, setBuilderMode] = useState<"create" | "edit" | null>(
    null
  );
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [transport, setTransport] = useState<TransportMode>("drive");
  const [saving, setSaving] = useState(false);

  // Clear builder state when the user switches day options
  useEffect(() => {
    setBuilderMode(null);
    setEditingRouteId(null);
    setPickIds([]);
    setTransport("drive");
  }, [currentOption?.id]);

  const handleBeginCreate = useCallback(() => {
    setBuilderMode("create");
    setEditingRouteId(null);
    setPickIds([]);
    setTransport("drive");
  }, []);

  const handleBeginEdit = useCallback((route: (typeof routes)[0]) => {
    setBuilderMode("edit");
    setEditingRouteId(route.route_id);
    setPickIds(route.option_location_ids ?? []);
    setTransport((route.transport_mode as TransportMode) ?? "drive");
  }, []);

  const handleCancelBuilder = useCallback(() => {
    setBuilderMode(null);
    setEditingRouteId(null);
    setPickIds([]);
    setTransport("drive");
  }, []);

  const handleTogglePick = useCallback((olId: string) => {
    setPickIds((prev) =>
      prev.includes(olId) ? prev.filter((id) => id !== olId) : [...prev, olId]
    );
  }, []);

  // ─────────────────────────────────────────────────────────────────────

  // Build lookup: locationId → all route memberships
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
      r.option_location_ids.forEach((olId, idx) => {
        const arr = m.get(olId) ?? [];
        arr.push({ route: r, idx, color });
        m.set(olId, arr);
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
    // Defense in depth: read-only viewers shouldn't have draggable items in
    // the first place (`ItineraryDayTimeline` gates `draggable` on context),
    // but guard here too so a future regression can't silently fire a
    // reorder request.
    if (readOnly || !dragId || !currentOption || dragId === targetId) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.id === dragId);
    const ti = sorted.findIndex((l) => l.id === targetId);
    if (fi < 0 || ti < 0) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.splice(ti > fi ? ti - 1 : ti, 0, rm);
    setDragId(null);
    safeReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.id)
    );
  }

  function onDropAtEnd(e: React.DragEvent) {
    e.preventDefault();
    setDropId(null);
    if (readOnly || !dragId || !currentOption) {
      setDragId(null);
      return;
    }
    const fi = sorted.findIndex((l) => l.id === dragId);
    if (fi < 0 || fi === sorted.length - 1) {
      setDragId(null);
      return;
    }
    const arr = [...sorted];
    const [rm] = arr.splice(fi, 1);
    arr.push(rm);
    setDragId(null);
    safeReorderLocations(
      day.id,
      currentOption.id,
      arr.map((l) => l.id)
    );
  }

  async function handleSaveRoute(
    transportMode: TransportMode,
    locationIds: string[],
    routeEditId: string | null
  ) {
    if (!currentOption) return;
    setSaving(true);
    try {
      if (routeEditId) {
        const routeResponse = await api.itinerary.updateRoute(
          tripId,
          day.id,
          currentOption.id,
          routeEditId,
          {
            transport_mode: transportMode,
            option_location_ids: locationIds,
          }
        );
        await safeRouteCreated(day.id, currentOption.id, routeResponse);
      } else {
        const routeResponse = await api.itinerary.createRoute(
          tripId,
          day.id,
          currentOption.id,
          {
            transport_mode: transportMode,
            label: null,
            option_location_ids: locationIds,
          }
        );
        await safeRouteCreated(day.id, currentOption.id, routeResponse);
      }
      // Clear builder state on success
      setBuilderMode(null);
      setEditingRouteId(null);
      setPickIds([]);
    } catch {
      /* error shown by parent */
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteRoute(routeId: string) {
    if (!currentOption) return;
    onDeleteRoute?.(day.id, currentOption.id, routeId);
  }

  // Time picker portal
  const tpPortal =
    tpOpen && tpPos && currentOption
      ? (() => {
          const ol = sorted.find((l) => l.id === tpOpen);
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
              aria-label="Select time of day"
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
                        safeUpdateTimePeriod(
                          day.id,
                          currentOption.id,
                          ol.id,
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
          <ItineraryDayHeader
            day={day}
            currentOption={currentOption}
            createOptionLoading={createOptionLoading}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
            onUpdateDayDate={safeUpdateDayDate}
            onSelectOption={onSelectOption}
            onCreateAlternative={onCreateAlternative}
            onDeleteOption={safeDeleteOption}
            onSaveOptionDetails={safeSaveOptionDetails}
          />
        </CardHeader>

        <CardContent className="pt-0">
          {currentOption && (
            <div key={currentOption.id} className="animate-page-flip">
              {!readOnly && onAddLocations && (
                <div className="mb-5 mt-3">
                  <AddLocationsToOptionDialog
                    trigger={
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow active:scale-[0.97]"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                        Add locations
                      </button>
                    }
                    allLocations={tripLocations}
                    alreadyAddedIds={alreadyAdded}
                    startingCity={currentOption.starting_city}
                    endingCity={currentOption.ending_city}
                    onConfirm={(ids) =>
                      onAddLocations(day.id, currentOption.id, ids)
                    }
                    tripId={tripId}
                    onLocationCreated={onLocationCreated}
                  />
                </div>
              )}

              <ItineraryDayTimeline
                sorted={sorted}
                locRouteMap={locRouteMap}
                expandedId={expandedId}
                dragId={dragId}
                dropId={dropId}
                isPickMode={builderMode !== null}
                pickIds={pickIds}
                tpOpen={tpOpen}
                tpTrigger={tpTrigger}
                currentOptionId={currentOption.id}
                dayId={day.id}
                calculatingRouteId={calculatingRouteId}
                onTogglePick={handleTogglePick}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDropLeave={() => setDropId(null)}
                onToggleExpanded={(locationId) =>
                  setExpandedId((current) =>
                    current === locationId ? null : locationId
                  )
                }
                onInspectLocation={(locationId) =>
                  onInspectLocation(day.id, locationId)
                }
                onToggleTimePicker={(locationId) =>
                  setTpOpen((current) =>
                    current === locationId ? null : locationId
                  )
                }
                onRemoveLocation={safeRemoveLocation}
                onLocationHover={onLocationHover}
                onDropAtEnd={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropId("__end__");
                  onDropAtEnd(e);
                }}
              />

              <ItineraryRouteManager
                day={day}
                currentOption={currentOption}
                sortedLocations={sorted}
                routes={routes}
                calculatingRouteId={calculatingRouteId}
                routeMetricsError={routeMetricsError}
                builderMode={builderMode}
                onRetryRouteMetrics={safeRetryRouteMetrics}
                onDeleteRoute={handleDeleteRoute}
                onBeginCreate={handleBeginCreate}
                onBeginEdit={handleBeginEdit}
              />

              {/* Sticky toolbar — stays visible at bottom of viewport
                  while the user scrolls through the timeline to pick
                  route stops. Positioned here (outside RouteManager,
                  inside CardContent) so the sticky range spans the full
                  card height including the timeline above. */}
              <RouteBuilderToolbar
                builderMode={builderMode}
                pickIds={pickIds}
                transport={transport}
                saving={saving}
                onSetTransport={setTransport}
                onCancelBuilder={handleCancelBuilder}
                onSave={() => {
                  if (pickIds.length < 2) return;
                  void handleSaveRoute(transport, pickIds, editingRouteId);
                }}
              />
            </div>
          )}
          {!currentOption && (
            <p className="text-sm text-muted-foreground">No locations</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
