"use client";

import type { MutableRefObject } from "react";
import type { ItineraryOptionLocation } from "@/lib/api";
import { ItineraryLocationRow } from "@/components/itinerary/ItineraryLocationRow";
import { cn } from "@/lib/utils";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";

interface RouteInfo {
  route: {
    route_id: string;
    transport_mode: string;
    option_location_ids: string[];
    segments?: Array<{
      segment_order: number;
      duration_seconds?: number | null;
      distance_meters?: number | null;
      encoded_polyline?: string | null;
    }>;
  };
  idx: number;
  color: {
    hex: string;
  };
}

interface ItineraryDayTimelineProps {
  sorted: ItineraryOptionLocation[];
  locRouteMap: Map<string, RouteInfo[]>;
  expandedId: string | null;
  dragId: string | null;
  dropId: string | null;
  isPickMode: boolean;
  pickIds: string[];
  tpOpen: string | null;
  tpTrigger: MutableRefObject<HTMLDivElement | null>;
  currentOptionId: string | null;
  dayId: string;
  calculatingRouteId: string | null;
  onTogglePick: (locationId: string) => void;
  onDragStart: (locationId: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (locationId: string, e: React.DragEvent) => void;
  onDrop: (locationId: string, e: React.DragEvent) => void;
  onDropLeave: () => void;
  onToggleExpanded: (locationId: string) => void;
  onInspectLocation: (locationId: string) => void;
  onToggleTimePicker: (locationId: string) => void;
  onRemoveLocation: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
  onDropAtEnd: (e: React.DragEvent) => void;
}

const TIME_SECTIONS = [
  {
    key: "morning",
    label: "Morning",
    displayLabel: "Morning",
    icon: Sunrise,
    accent:
      "text-time-morning-text bg-time-morning-bg border-time-morning-border",
    wash: "bg-gradient-to-b from-time-morning-bg/40 to-transparent",
  },
  {
    key: "afternoon",
    label: "Afternoon",
    displayLabel: "Afternoon",
    icon: Sun,
    accent:
      "text-time-afternoon-text bg-time-afternoon-bg border-time-afternoon-border",
    wash: "bg-gradient-to-b from-time-afternoon-bg/40 to-transparent",
  },
  {
    key: "evening",
    label: "Evening",
    displayLabel: "Evening",
    icon: Sunset,
    accent:
      "text-time-evening-text bg-time-evening-bg border-time-evening-border",
    wash: "bg-gradient-to-b from-time-evening-bg/40 to-transparent",
  },
  {
    key: "night",
    label: "Night",
    displayLabel: "Night",
    icon: Moon,
    accent: "text-time-night-text bg-time-night-bg border-time-night-border",
    wash: "bg-gradient-to-b from-time-night-bg/40 to-transparent",
  },
] as const;

export function ItineraryDayTimeline({
  sorted,
  locRouteMap,
  expandedId,
  dragId,
  dropId,
  isPickMode,
  pickIds,
  tpOpen,
  tpTrigger,
  currentOptionId,
  dayId,
  calculatingRouteId,
  onTogglePick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDropLeave,
  onToggleExpanded,
  onInspectLocation,
  onToggleTimePicker,
  onRemoveLocation,
  onDropAtEnd,
}: ItineraryDayTimelineProps) {
  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground/50">
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-2 w-2 rounded-full border-2 border-dashed border-primary/20" />
            <div className="h-4 w-0.5 border-l border-dashed border-primary/15" />
            <div className="h-2 w-2 rounded-full border-2 border-dashed border-primary/20" />
            <div className="h-4 w-0.5 border-l border-dashed border-primary/15" />
            <div className="h-2 w-2 rounded-full border-2 border-dashed border-primary/20" />
          </div>
          <div className="ml-2">
            <p className="text-sm font-medium text-muted-foreground/50">
              No stops planned yet
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/30">
              Add places from the unscheduled panel
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Build connector map: route stop N gets a top line if N > 0,
  // and a bottom line if N < last stop.
  const connectorMap = new Map<
    string,
    { top: string | null; bottom: string | null }
  >();

  for (const ol of sorted) {
    const routeInfos = locRouteMap.get(ol.id) ?? [];
    let top: string | null = null;
    let bottom: string | null = null;

    for (const info of routeInfos) {
      if (!top && info.idx > 0) {
        top = info.color.hex;
      }
      if (!bottom && info.idx < info.route.option_location_ids.length - 1) {
        bottom = info.color.hex;
      }
    }

    connectorMap.set(ol.id, { top, bottom });
  }

  const groupedSections = TIME_SECTIONS.map((section) => ({
    ...section,
    items: sorted.filter(
      (optionLocation) =>
        (optionLocation.time_period || "morning") === section.key
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-4">
      {groupedSections.map((section) => {
        const SectionIcon = section.icon;

        return (
          <section
            key={section.key}
            aria-label={`${section.label} stops`}
            className={cn(
              "rounded-2xl border border-border/70 px-3 py-3",
              section.wash,
              "bg-white/60 dark:bg-card/60"
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
                  section.accent
                )}
              >
                <SectionIcon size={13} />
                {section.displayLabel}
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {section.items.length}{" "}
                {section.items.length === 1 ? "stop" : "stops"}
              </span>
            </div>

            <div className="space-y-0">
              {section.items.map((optionLocation) => {
                const expanded = expandedId === optionLocation.id;
                const isDrag = dragId === optionLocation.id;
                const isDrop = dropId === optionLocation.id && !isDrag;
                const routeInfos =
                  locRouteMap.get(optionLocation.id) ?? [];
                const picking =
                  isPickMode && pickIds.includes(optionLocation.id);
                const pickSeq = pickIds.indexOf(optionLocation.id) + 1;

                const connectors = connectorMap.get(optionLocation.id);
                const topConnectorHex = connectors?.top ?? null;
                const bottomConnectorHex = connectors?.bottom ?? null;

                return (
                  <ItineraryLocationRow
                    key={optionLocation.id}
                    optionLocation={optionLocation}
                    expanded={expanded}
                    isDrag={isDrag}
                    isDrop={isDrop}
                    isPickMode={isPickMode}
                    picking={picking}
                    pickSeq={pickSeq}
                    routeInfos={routeInfos}
                    topConnectorHex={topConnectorHex}
                    bottomConnectorHex={bottomConnectorHex}
                    timePickerOpenId={tpOpen}
                    tpTriggerRef={tpTrigger}
                    currentOptionId={currentOptionId}
                    dayId={dayId}
                    calculatingRouteId={calculatingRouteId}
                    onTogglePick={onTogglePick}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDropLeave={onDropLeave}
                    onToggleExpanded={onToggleExpanded}
                    onInspectLocation={onInspectLocation}
                    onToggleTimePicker={onToggleTimePicker}
                    onRemoveLocation={onRemoveLocation}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {dragId && (
        <div
          data-testid="timeline-end-drop-zone"
          role="listitem"
          aria-label="Drop here to move to end of list"
          className={cn(
            "mx-9 mt-0.5 h-7 rounded-md border-2 border-dashed transition-colors",
            dropId === "__end__"
              ? "border-primary bg-primary/10"
              : "border-muted-foreground/20"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={onDropLeave}
          onDrop={onDropAtEnd}
        />
      )}
    </div>
  );
}
