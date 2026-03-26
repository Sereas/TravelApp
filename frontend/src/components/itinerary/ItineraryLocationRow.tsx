"use client";

import type { MutableRefObject } from "react";
import type { ItineraryOptionLocation } from "@/lib/api";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import {
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Ticket,
  ExternalLink,
  GripVertical,
  Plus,
  X,
  ChevronDown,
  Car,
  Footprints,
  TrainFront,
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

const TRANSPORT_ICONS = {
  walk: Footprints,
  drive: Car,
  transit: TrainFront,
} as const;

function formatHoursLines(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = value.replace(/\r\n/g, "\n");
  if (/[|;]/.test(normalized)) {
    return normalized
      .split(/[|;]+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (/\n/.test(normalized)) {
    return normalized
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  const trimmed = normalized.trim();
  return trimmed ? [trimmed] : [];
}

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

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
    return "-- --";
  }
  const dur =
    segment.duration_seconds != null
      ? formatDuration(segment.duration_seconds)
      : "--";
  const dist =
    segment.distance_meters != null
      ? (() => {
          const km = segment.distance_meters / 1000;
          const decimals = km >= 10 ? 0 : 1;
          return `${km.toFixed(decimals)} km`;
        })()
      : "--";
  return `${dur} / ${dist}`;
}

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

interface ItineraryLocationRowProps {
  optionLocation: ItineraryOptionLocation;
  expanded: boolean;
  isDrag: boolean;
  isDrop: boolean;
  isPickMode: boolean;
  picking: boolean;
  pickSeq: number;
  routeInfos: RouteInfo[];
  topConnectorHex: string | null;
  bottomConnectorHex: string | null;
  timePickerOpenId: string | null;
  tpTriggerRef: MutableRefObject<HTMLDivElement | null>;
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
  onToggleTimePicker: (locationId: string) => void;
  onInspectLocation?: (locationId: string) => void;
  onRemoveLocation: (
    dayId: string,
    optionId: string,
    locationId: string
  ) => void;
}

export function ItineraryLocationRow({
  optionLocation,
  expanded,
  isDrag,
  isDrop,
  isPickMode,
  picking,
  pickSeq,
  routeInfos,
  topConnectorHex,
  bottomConnectorHex,
  timePickerOpenId,
  tpTriggerRef,
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
  onToggleTimePicker,
  onInspectLocation,
  onRemoveLocation,
}: ItineraryLocationRowProps) {
  const readOnly = useReadOnly();
  const tk = optionLocation.time_period || "morning";
  const tm = TIME_META[tk] ?? TIME_META.morning;
  const TIcon = tm.icon;
  const booking = optionLocation.location.requires_booking ?? "no";
  const showBooking = booking === "yes" || booking === "yes_done";
  const imageUrl =
    optionLocation.location.user_image_url || optionLocation.location.image_url;
  const catMeta = optionLocation.location.category
    ? CATEGORY_META[optionLocation.location.category as CategoryKey]
    : null;

  return (
    <div
      className={cn(
        "flex gap-2 transition-opacity duration-300",
        isPickMode && !picking && "opacity-70"
      )}
    >
      <div className="flex w-5 shrink-0 justify-center pt-2">
        {readOnly ? (
          <div className="w-5" />
        ) : isPickMode ? (
          <button
            type="button"
            onClick={() => onTogglePick(optionLocation.location_id)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-200",
              picking
                ? "bg-brand text-white shadow-md shadow-brand/30 scale-110"
                : "border-2 border-dashed border-brand/30 text-brand/50 hover:border-brand hover:text-brand hover:scale-110"
            )}
          >
            {picking ? pickSeq : <Plus size={12} />}
          </button>
        ) : (
          <div
            className="flex cursor-grab items-center justify-center text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
            draggable
            onDragStart={(event) =>
              onDragStart(optionLocation.location_id, event)
            }
            onDragEnd={onDragEnd}
            aria-label={`Drag ${optionLocation.location.name}`}
          >
            <GripVertical size={14} />
          </div>
        )}
      </div>

      <div className="flex w-5 shrink-0 flex-col items-center">
        <div
          className={cn(
            "flex-1 rounded-full transition-all duration-300",
            topConnectorHex ? "w-[3px]" : "w-0"
          )}
          style={{ backgroundColor: topConnectorHex ?? "transparent" }}
        />
        <div
          className={cn(
            "shrink-0 rounded-full transition-all duration-300",
            topConnectorHex || bottomConnectorHex
              ? "h-3 w-3 ring-2 ring-white shadow-sm"
              : "h-2 w-2 border border-border/40"
          )}
          style={
            topConnectorHex || bottomConnectorHex
              ? {
                  backgroundColor:
                    topConnectorHex ?? bottomConnectorHex ?? undefined,
                }
              : undefined
          }
        />
        <div
          className={cn(
            "flex-1 rounded-full transition-all duration-300",
            bottomConnectorHex ? "w-[3px]" : "w-0"
          )}
          style={{ backgroundColor: bottomConnectorHex ?? "transparent" }}
        />
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 pb-1",
          isDrop && "rounded-md bg-accent/60 ring-1 ring-inset ring-primary"
        )}
        onDragOver={(event) => onDragOver(optionLocation.location_id, event)}
        onDragLeave={onDropLeave}
        onDrop={(event) => onDrop(optionLocation.location_id, event)}
      >
        <div
          className={cn(
            "group flex items-center gap-3 rounded-xl border px-2 py-2 text-sm transition-all duration-200",
            isDrag && "opacity-40",
            isPickMode && picking
              ? "border-brand/30 bg-brand/5 shadow-md shadow-brand/10 ring-1 ring-brand/20"
              : expanded
                ? "border-primary/20 bg-primary/5 shadow-sm"
                : "border-white/80 bg-white hover:-translate-y-px hover:border-primary/10 hover:shadow-md motion-reduce:hover:translate-y-0 dark:border-card dark:bg-card"
          )}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => {
              onInspectLocation?.(optionLocation.location_id);
              onToggleExpanded(optionLocation.location_id);
            }}
            aria-expanded={expanded}
          >
            <div className="relative shrink-0">
              <div className="polaroid-img vintage-img relative h-16 w-16 overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={optionLocation.location.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary/5">
                    {optionLocation.location.category ? (
                      <CategoryIcon
                        category={
                          optionLocation.location.category as CategoryKey
                        }
                        size={20}
                        className="text-primary/40"
                      />
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40">
                        Spot
                      </span>
                    )}
                  </div>
                )}
              </div>
              {routeInfos.length > 0 && (
                <span className="absolute -bottom-1 -right-1 inline-flex items-center gap-px rounded-full bg-white p-0.5 shadow-sm">
                  {routeInfos.map((info) => (
                    <span
                      key={info.route.route_id}
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 text-[7px] font-bold"
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
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-foreground">
                {optionLocation.location.name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {optionLocation.location.city ? (
                  <span className="truncate">
                    {optionLocation.location.city}
                  </span>
                ) : null}
                {optionLocation.location.category ? (
                  <span className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary/70">
                    {optionLocation.location.category}
                  </span>
                ) : null}
              </div>
              {optionLocation.location.note ? (
                <div className="journal-note mt-1 text-xs leading-5 text-muted-foreground/70">
                  {optionLocation.location.note}
                </div>
              ) : null}
            </div>
          </button>

          {showBooking && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold",
                booking === "yes_done"
                  ? "border-booking-done-border bg-booking-done-bg text-booking-done-text"
                  : "border-booking-pending-border bg-booking-pending-bg text-booking-pending-text"
              )}
            >
              <Ticket size={9} />
              {booking === "yes_done" ? "Booked" : "Book"}
            </span>
          )}

          {optionLocation.location.google_link ? (
            <a
              href={optionLocation.location.google_link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground/30 transition-colors hover:text-primary"
              aria-label={`Map: ${optionLocation.location.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink size={12} />
            </a>
          ) : null}

          {readOnly ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              <TIcon size={10} className="shrink-0" />
              <span className="w-[48px]">{tm.label}</span>
            </span>
          ) : (
            <div
              ref={
                timePickerOpenId === optionLocation.location_id
                  ? (node) => {
                      tpTriggerRef.current = node;
                    }
                  : undefined
              }
            >
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-transparent bg-muted/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-foreground"
                onClick={() => onToggleTimePicker(optionLocation.location_id)}
                aria-label={`Time: ${tm.label}`}
              >
                <TIcon size={10} className="shrink-0" />
                <span className="w-[48px]">{tm.label}</span>
                <ChevronDown size={9} className="opacity-40" />
              </button>
            </div>
          )}

          {!readOnly && !isPickMode && currentOptionId && (
            <button
              type="button"
              className="shrink-0 text-muted-foreground/30 opacity-0 transition hover:text-destructive group-hover:opacity-100"
              aria-label={`Remove ${optionLocation.location.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveLocation(
                  dayId,
                  currentOptionId,
                  optionLocation.location_id
                );
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {expanded &&
          (optionLocation.location.address ||
            optionLocation.location.working_hours) && (
            <div className="mb-1 ml-1 mr-4 space-y-1 rounded-b-lg bg-primary/5 px-3 py-2 text-xs">
              {optionLocation.location.address && (
                <div>
                  <span className="font-bold text-muted-foreground">
                    Address:
                  </span>{" "}
                  {optionLocation.location.address}
                </div>
              )}
              {optionLocation.location.working_hours && (
                <div>
                  <span className="font-bold text-muted-foreground">
                    Hours:
                  </span>{" "}
                  <span className="whitespace-pre-wrap">
                    {formatHoursLines(
                      optionLocation.location.working_hours
                    ).map((line, index) => (
                      <span key={index} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}

        {routeInfos.map((info) => {
          const isLastLeg = info.idx === info.route.location_ids.length - 1;
          const Icon =
            TRANSPORT_ICONS[
              info.route.transport_mode as keyof typeof TRANSPORT_ICONS
            ] ?? null;
          if (isLastLeg || !Icon) return null;
          const isCalculatingLeg = calculatingRouteId === info.route.route_id;
          return (
            <div
              key={info.route.route_id}
              className="flex items-center gap-1.5 py-0.5 pl-2 text-xs text-muted-foreground/70"
            >
              <div
                className="h-3 w-0.5 shrink-0 rounded-full"
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
                    Calculating...
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
