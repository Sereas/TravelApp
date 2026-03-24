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
    location_ids: string[];
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
    displayLabel: "Sunrise",
    icon: Sunrise,
    accent:
      "text-time-morning-text bg-time-morning-bg border-time-morning-border",
    wash: "bg-gradient-to-b from-time-morning-bg/40 to-transparent",
  },
  {
    key: "afternoon",
    label: "Afternoon",
    displayLabel: "Midday",
    icon: Sun,
    accent:
      "text-time-afternoon-text bg-time-afternoon-bg border-time-afternoon-border",
    wash: "bg-gradient-to-b from-time-afternoon-bg/40 to-transparent",
  },
  {
    key: "evening",
    label: "Evening",
    displayLabel: "Sundown",
    icon: Sunset,
    accent:
      "text-time-evening-text bg-time-evening-bg border-time-evening-border",
    wash: "bg-gradient-to-b from-time-evening-bg/40 to-transparent",
  },
  {
    key: "night",
    label: "Night",
    displayLabel: "Late",
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
      <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground/50">
        <div className="flex gap-2 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-2 h-2 rounded-full border-2 border-dashed border-muted-foreground/20" />
            <div className="w-0.5 h-4 border-l border-dashed border-muted-foreground/15" />
            <div className="w-2 h-2 rounded-full border-2 border-dashed border-muted-foreground/20" />
            <div className="w-0.5 h-4 border-l border-dashed border-muted-foreground/15" />
            <div className="w-2 h-2 rounded-full border-2 border-dashed border-muted-foreground/20" />
          </div>
          <div className="ml-2">
            <p className="font-serif text-sm text-muted-foreground/60">
              No locations planned yet
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground/40">
              Add places from the unscheduled panel
            </p>
          </div>
        </div>
      </div>
    );
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
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-serif text-xs font-semibold",
                  section.accent
                )}
              >
                <SectionIcon size={13} />
                {section.displayLabel}
              </div>
              <span className="text-xs text-muted-foreground">
                {section.items.length}{" "}
                {section.items.length === 1 ? "stop" : "stops"}
              </span>
            </div>

            <div className="space-y-0">
              {section.items.map((optionLocation) => {
                const index = sorted.findIndex(
                  (item) => item.location_id === optionLocation.location_id
                );
                const expanded = expandedId === optionLocation.location_id;
                const isDrag = dragId === optionLocation.location_id;
                const isDrop = dropId === optionLocation.location_id && !isDrag;
                const routeInfos =
                  locRouteMap.get(optionLocation.location_id) ?? [];
                const picking =
                  isPickMode && pickIds.includes(optionLocation.location_id);
                const pickSeq = pickIds.indexOf(optionLocation.location_id) + 1;

                const prevOl = sorted[index - 1];
                const nextOl = sorted[index + 1];

                let topConnectorHex: string | null = null;
                if (prevOl) {
                  for (const info of routeInfos) {
                    if (
                      info.idx > 0 &&
                      info.route.location_ids[info.idx - 1] ===
                        prevOl.location_id
                    ) {
                      topConnectorHex = info.color.hex;
                      break;
                    }
                  }
                }

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

                return (
                  <ItineraryLocationRow
                    key={optionLocation.location_id}
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
          className={cn(
            "mx-9 mt-0.5 h-7 rounded-md border-2 border-dashed transition-colors",
            dropId === "__end__"
              ? "border-primary bg-accent/30"
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
