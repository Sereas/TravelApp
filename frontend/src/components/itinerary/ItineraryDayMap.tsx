"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import { CATEGORY_OPTIONS, type CategoryKey } from "@/lib/location-constants";
import { cn } from "@/lib/utils";

export interface ItineraryDayMapLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category?: string | null;
}

interface ItineraryDayMapProps {
  locations: ItineraryDayMapLocation[];
}

function MapMarkerContent({
  category,
  name,
  isOpen,
  isSelected,
}: {
  category: string | null | undefined;
  name: string;
  isOpen?: boolean;
  isSelected?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const showLabel = isOpen || hovered;

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center transition-all duration-200",
        showLabel
          ? "gap-1.5 rounded-full border border-border bg-white px-2 py-1 shadow-md hover:border-primary/40 hover:shadow"
          : "justify-center rounded-full border border-border bg-white shadow-md hover:border-primary/40",
        isOpen && "ring-2 ring-primary ring-offset-1",
        isSelected && "border-2 border-primary shadow-lg"
      )}
      style={{
        ...(showLabel ? {} : { width: 28, height: 28 }),
        ...(isSelected ? { transform: "scale(1.25)" } : {}),
      }}
      title={name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CategoryIcon
        category={categoryKey}
        size={14}
        className="shrink-0 text-foreground"
      />
      {showLabel && (
        <span className="max-w-[140px] truncate text-xs font-medium text-foreground">
          {name}
        </span>
      )}
    </div>
  );
}

function PopupCard({
  name,
  address,
  category,
}: {
  name: string;
  address: string | null;
  category?: string | null;
}) {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-card p-3 shadow-md">
      <div className="flex items-start gap-2">
        <CategoryIcon
          category={categoryKey}
          size={18}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{name}</p>
          {address && (
            <p className="mt-0.5 text-xs text-muted-foreground">{address}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ItineraryDayMap({ locations }: ItineraryDayMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const markerStateRef = useRef<{
    roots: ReturnType<typeof createRoot>[];
    markers: maplibregl.Marker[];
    popups: maplibregl.Popup[];
    popupRoots: ReturnType<typeof createRoot>[];
    locations: ItineraryDayMapLocation[];
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!locations.length) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setSelectedLocationId(null);
    markerStateRef.current = null;

    const first = locations[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [first.longitude, first.latitude],
      zoom: locations.length === 1 ? 14.5 : 11,
    });

    mapRef.current = map;
    map.addControl(
      new NavigationControl({ visualizePitch: true }),
      "top-right"
    );

    const bounds = new maplibregl.LngLatBounds();
    const roots: ReturnType<typeof createRoot>[] = [];
    const markers: maplibregl.Marker[] = [];
    const popups: maplibregl.Popup[] = [];
    const popupRoots: ReturnType<typeof createRoot>[] = [];

    locations.forEach((loc) => {
      const lngLat: [number, number] = [loc.longitude, loc.latitude];
      bounds.extend(lngLat);

      const popupContentEl = document.createElement("div");
      const popupRoot = createRoot(popupContentEl);
      popupRoot.render(
        <PopupCard
          name={loc.name}
          address={loc.address}
          category={loc.category}
        />
      );
      popupRoots.push(popupRoot);

      const popup = new maplibregl.Popup({
        anchor: "bottom",
        offset: [0, -12],
        closeButton: true,
        closeOnClick: false,
      }).setDOMContent(popupContentEl);

      const el = document.createElement("div");
      const root = createRoot(el);
      roots.push(root);
      popups.push(popup);

      function renderMarker(isOpen = false, isSelected = false) {
        root.render(
          <MapMarkerContent
            category={loc.category}
            name={loc.name}
            isOpen={isOpen}
            isSelected={isSelected}
          />
        );
      }
      renderMarker(false, false);

      popup.on("open", () => {
        setSelectedLocationId(loc.id);
        markers.forEach((m, i) => {
          if (locations[i].id !== loc.id) {
            popups[i].remove();
          }
        });
        renderMarker(true, true);
        const zoom = map.getZoom();
        map.flyTo({
          center: lngLat,
          zoom: zoom < 12 ? 12 : zoom,
          duration: 600,
        });
      });
      popup.on("close", () => {
        setSelectedLocationId((prev) => (prev === loc.id ? null : prev));
        renderMarker(false, false);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map);
      markers.push(marker);
    });

    markerStateRef.current = {
      roots,
      markers,
      popups,
      popupRoots,
      locations,
    };

    map.once("load", () => {
      if (locations.length === 1) {
        map.setCenter([first.longitude, first.latitude]);
        map.setZoom(14.5);
      } else if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 40,
          maxZoom: 15,
          duration: 0,
        });
      }
      map.resize();
    });

    requestAnimationFrame(() => map.resize());

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      roots.forEach((r) => r.unmount());
      popupRoots.forEach((r) => r.unmount());
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerStateRef.current = null;
    };
  }, [locations]);

  useEffect(() => {
    const state = markerStateRef.current;
    if (!state || selectedLocationId === null) return;
    state.roots.forEach((root, i) => {
      const loc = state.locations[i];
      root.render(
        <MapMarkerContent
          category={loc.category}
          name={loc.name}
          isOpen={state.popups[i].isOpen()}
          isSelected={loc.id === selectedLocationId}
        />
      );
    });
  }, [selectedLocationId]);

  return <div ref={containerRef} className="h-[480px] w-full rounded-md" />;
}
