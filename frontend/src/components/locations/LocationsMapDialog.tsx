"use client";

import { useMemo } from "react";
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
import { MapPin } from "lucide-react";

interface LocationsMapDialogProps {
  locations: Location[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the pin popup exposes an inline note editor. */
  onLocationNoteSave?: (
    locationId: string,
    nextNote: string
  ) => Promise<void> | void;
  /** When provided, the pin popup exposes a delete action. */
  onLocationDelete?: (locationId: string) => Promise<void> | void;
  /** When true, hides the popup's edit and delete affordances. */
  readOnly?: boolean;
}

export function LocationsMapDialog({
  locations,
  open,
  onOpenChange,
  onLocationNoteSave,
  onLocationDelete,
  readOnly,
}: LocationsMapDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-5xl flex-col gap-0 p-0 sm:h-[80vh]"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-5 pb-2 pt-5">
          <DialogTitle className="text-lg font-bold tracking-tight">
            All Locations
          </DialogTitle>
        </DialogHeader>
        {mapLocations.length > 0 ? (
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
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <MapPin size={32} className="text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              No locations have coordinates yet. Add locations with Google Maps
              links to see them on the map.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
