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
  onRemoveLocation: (dayId: string, optionId: string, locationId: string) => void;
  onDropAtEnd: (e: React.DragEvent) => void;
}

const TIME_SECTIONS = [
  {
    key: "morning",
    label: "Morning",
    displayLabel: "Sunrise",
    icon: Sunrise,
    accent: "text-amber-700 bg-amber-50 border-amber-100",
  },
  {
    key: "afternoon",
    label: "Afternoon",
    displayLabel: "Midday",
    icon: Sun,
    accent: "text-sky-700 bg-sky-50 border-sky-100",
  },
  {
    key: "evening",
    label: "Evening",
    displayLabel: "Sundown",
    icon: Sunset,
    accent: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-100",
  },
  {
    key: "night",
    label: "Night",
    displayLabel: "Late",
    icon: Moon,
    accent: "text-slate-700 bg-slate-100 border-slate-200",
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
      <div className="py-6 flex flex-col items-center gap-3 text-muted-foreground/50">
        <div className="flex gap-2 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
            <div className="w-0.5 h-4 bg-muted-foreground/10" />
            <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
            <div className="w-0.5 h-4 bg-muted-foreground/10" />
            <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
          </div>
          <p className="ml-2 text-sm text-muted-foreground/60">
            No locations planned yet
          </p>
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
            className="rounded-2xl border border-warm-border/70 bg-white/60 px-3 py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  section.accent
                )}
              >
                <SectionIcon size={13} />
                {section.displayLabel}
              </div>
              <span className="text-xs text-content-muted">
                {section.items.length} {section.items.length === 1 ? "stop" : "stops"}
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
                const routeInfos = locRouteMap.get(optionLocation.location_id) ?? [];
                const picking = isPickMode && pickIds.includes(optionLocation.location_id);
                const pickSeq = pickIds.indexOf(optionLocation.location_id) + 1;

                const prevOl = sorted[index - 1];
                const nextOl = sorted[index + 1];

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
