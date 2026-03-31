"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import { CATEGORY_OPTIONS, type CategoryKey } from "@/lib/location-constants";
import { cn } from "@/lib/utils";

interface ItineraryDayMapLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category?: string | null;
}

export interface MapRoutePolyline {
  routeId: string;
  color: string;
  encodedPolylines: string[];
  /** Pre-formatted label, e.g. "26 min · 1.9 km" */
  label?: string;
}

interface ItineraryDayMapProps {
  locations: ItineraryDayMapLocation[];
  routes?: MapRoutePolyline[];
}

/** Decode a Google-encoded polyline string into [lng, lat] pairs for GeoJSON. */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng * 1e-5, lat * 1e-5]);
  }
  return coords;
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

export function ItineraryDayMap({ locations, routes }: ItineraryDayMapProps) {
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

    const labelMarkers: maplibregl.Marker[] = [];
    const pendingLabels: {
      color: string;
      label: string;
      coords: [number, number][];
    }[] = [];

    map.once("load", () => {
      // Add route polylines
      if (routes && routes.length > 0) {
        routes.forEach((route, routeIdx) => {
          const allCoords: [number, number][] = [];
          for (const encoded of route.encodedPolylines) {
            const decoded = decodePolyline(encoded);
            allCoords.push(...decoded);
          }
          if (allCoords.length === 0) return;

          // Extend bounds to include route path
          for (const coord of allCoords) {
            bounds.extend(coord as [number, number]);
          }

          const sourceId = `route-${route.routeId}-${routeIdx}`;
          const color = route.color;

          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: allCoords,
              },
            },
          });

          // Outer stroke for contrast against the map
          map.addLayer({
            id: `${sourceId}-outline`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": "#ffffff",
              "line-width": 7,
              "line-opacity": 0.9,
            },
          });

          // Main colored line
          map.addLayer({
            id: `${sourceId}-line`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": color,
              "line-width": 4,
              "line-opacity": 0.9,
            },
          });

          // Store coords for deferred label placement (after fitBounds)
          if (route.label && allCoords.length >= 2) {
            pendingLabels.push({
              color,
              label: route.label,
              coords: allCoords,
            });
          }
        });
      }

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

      // Place route labels avoiding marker overlap.
      // We check whether the label's bounding box (estimated from text)
      // would overlap any marker's bounding box on screen.
      if (pendingLabels.length > 0) {
        const MARKER_HALF_W = 18;
        const MARKER_HALF_H = 18;
        const LABEL_PAD = 6; // extra breathing room around label
        const SAMPLE_STEP = 2;

        const markerScreenPts = locations.map((loc) =>
          map.project([loc.longitude, loc.latitude])
        );

        // Check if a label rect overlaps any marker rect
        const overlapsAnyMarker = (
          cx: number,
          cy: number,
          halfW: number,
          halfH: number
        ): boolean => {
          for (const mp of markerScreenPts) {
            if (
              cx - halfW < mp.x + MARKER_HALF_W &&
              cx + halfW > mp.x - MARKER_HALF_W &&
              cy - halfH < mp.y + MARKER_HALF_H &&
              cy + halfH > mp.y - MARKER_HALF_H
            ) {
              return true;
            }
          }
          return false;
        };

        for (const { color, label, coords } of pendingLabels) {
          // Estimate label size from text length
          const labelHalfW = label.length * 3.5 + 10 + LABEL_PAD;
          const labelHalfH = 12 + LABEL_PAD;

          let bestPt: [number, number] | null = null;
          let bestMinDist = -1;

          for (let i = 0; i < coords.length; i += SAMPLE_STEP) {
            const sp = map.project(coords[i]);

            // Skip if label rect would overlap any marker
            if (overlapsAnyMarker(sp.x, sp.y, labelHalfW, labelHalfH)) continue;

            // Among non-overlapping candidates, pick the one farthest from any marker
            let minDist = Infinity;
            for (const mp of markerScreenPts) {
              const dx = sp.x - mp.x;
              const dy = sp.y - mp.y;
              const d = dx * dx + dy * dy;
              if (d < minDist) minDist = d;
            }
            if (minDist > bestMinDist) {
              bestMinDist = minDist;
              bestPt = coords[i];
            }
          }

          // Only place the label if we found a non-overlapping position
          if (bestPt) {
            const el = document.createElement("div");
            const isDark = document.documentElement.classList.contains("dark");
            el.style.cssText =
              `background:${isDark ? "hsl(20,20%,10%)" : "white"};color:${isDark ? "hsl(30,20%,85%)" : "#374151"};font-size:11px;font-weight:500;` +
              `padding:2px 6px;border-radius:10px;border:1.5px solid ${color};` +
              `white-space:nowrap;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.12);`;
            el.textContent = label;
            const labelMarker = new maplibregl.Marker({
              element: el,
              anchor: "center",
            })
              .setLngLat(bestPt)
              .addTo(map);
            labelMarkers.push(labelMarker);
          }
        }
      }
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
      labelMarkers.forEach((m) => m.remove());
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerStateRef.current = null;
    };
  }, [locations, routes]);

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

  return (
    <div ref={containerRef} className="h-[min(480px,60vh)] w-full rounded-md" />
  );
}
