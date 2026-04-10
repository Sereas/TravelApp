"use client";

import { useMemo, useState } from "react";
import { Expand, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ItineraryDayMap,
  type ItineraryDayMapLocation,
} from "@/components/itinerary/ItineraryDayMap";
import type { Location } from "@/lib/api";

interface SidebarLocationMapProps {
  locations: Location[];
  focusLocationId: string | null;
  /** Incrementing counter to re-trigger focus even on the same location. */
  focusSeq?: number;
  /** Called when a pin on the compact (inline) map is clicked. Not wired
   *  to the fullscreen dialog variant — that still uses popup cards. */
  onPinClick?: (locationId: string) => void;
  /** Forwarded to the fullscreen dialog's `ItineraryDayMap` so the pin
   *  popup can expose an inline note editor. The inline compact map uses
   *  `disablePopups` so this prop has no effect there. */
  onLocationNoteSave?: (
    locationId: string,
    nextNote: string
  ) => Promise<void> | void;
  /** Forwarded to the fullscreen dialog's `ItineraryDayMap` so the pin
   *  popup can expose a delete action. */
  onLocationDelete?: (locationId: string) => Promise<void> | void;
  /** Hides the popup's edit and delete affordances (shared trip viewer). */
  readOnly?: boolean;
}

export function SidebarLocationMap({
  locations,
  focusLocationId,
  focusSeq,
  onPinClick,
  onLocationNoteSave,
  onLocationDelete,
  readOnly,
}: SidebarLocationMapProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const mapLocations = useMemo<ItineraryDayMapLocation[]>(
    () =>
      locations
        .filter(
          (l): l is Location & { latitude: number; longitude: number } =>
            l.latitude != null && l.longitude != null
        )
        .map((l) => ({
          id: l.id,
          name: l.name,
          latitude: l.latitude,
          longitude: l.longitude,
          category: l.category,
          image_url: l.image_url,
          user_image_url: l.user_image_url,
          requires_booking: l.requires_booking,
          city: l.city,
          note: l.note,
        })),
    [locations]
  );

  if (mapLocations.length === 0) return null;

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Map</span>
            <span className="text-xs text-muted-foreground">
              {mapLocations.length} pins
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Expand map"
          >
            <Expand size={14} />
          </button>
        </div>

        {/* Map — fills remaining height */}
        <div className="min-h-0 flex-1">
          <ItineraryDayMap
            locations={mapLocations}
            compact
            disablePopups
            focusLocationId={focusLocationId}
            focusSeq={focusSeq}
            onPinClick={onPinClick}
          />
        </div>
      </div>

      {/* Fullscreen dialog */}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="flex max-w-[92vw] flex-col gap-0 p-0 sm:h-[90vh]"
          aria-describedby={undefined}
        >
          <DialogHeader className="px-5 pb-2 pt-5">
            <DialogTitle className="text-lg font-bold tracking-tight">
              All Locations
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 px-2 pb-2">
            <div className="h-full overflow-hidden rounded-xl">
              <ItineraryDayMap
                locations={mapLocations}
                onLocationNoteSave={onLocationNoteSave}
                onLocationDelete={onLocationDelete}
                readOnly={readOnly}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
