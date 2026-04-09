"use client";

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import maplibregl, { NavigationControl, type Offset } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CategoryIcon } from "@/components/locations/CategoryIcon";
import {
  CATEGORY_OPTIONS,
  CATEGORY_META,
  type CategoryKey,
} from "@/lib/location-constants";
import { cn } from "@/lib/utils";

function getCategoryColors(category: string | null | undefined): {
  bg: string;
  text: string;
} {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const meta = CATEGORY_META[categoryKey];
  return { bg: meta.hexBg, text: meta.hexText };
}

export interface ItineraryDayMapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  note?: string | null;
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
  selectedRouteId?: string | null;
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
  const colors = getCategoryColors(category);
  const showLabel = isOpen || hovered;
  const active = isOpen || isSelected;

  return (
    <div
      className="flex cursor-pointer flex-col items-center"
      style={{
        filter: active
          ? "drop-shadow(0 2px 8px rgba(0,0,0,.3))"
          : "drop-shadow(0 1px 4px rgba(0,0,0,.18))",
      }}
      title={name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Label pill — appears on hover or when popup is open */}
      {showLabel && (
        <div
          className="mb-1 flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: "white",
            border: `1.5px solid ${colors.text}`,
          }}
        >
          <CategoryIcon
            category={categoryKey}
            size={12}
            className="shrink-0"
            style={{ color: colors.text }}
          />
          <span
            className="max-w-[120px] truncate text-[11px] font-semibold leading-none"
            style={{ color: colors.text }}
          >
            {name}
          </span>
        </div>
      )}
      {/* Pin body — teardrop with category icon */}
      <div
        className="relative flex items-center justify-center transition-transform duration-150"
        style={{
          width: 34,
          height: 40,
          transform: active
            ? "scale(1.2)"
            : hovered
              ? "scale(1.08)"
              : "scale(1)",
        }}
      >
        <svg
          viewBox="0 0 34 40"
          width="34"
          height="40"
          className="absolute inset-0"
        >
          <path
            d="M17 39C17 39 32 23.5 32 14.5C32 6.492 25.284 0.5 17 0.5C8.716 0.5 2 6.492 2 14.5C2 23.5 17 39 17 39Z"
            fill={active ? colors.text : "white"}
            stroke={colors.text}
            strokeWidth={active ? "0" : "1.5"}
          />
        </svg>
        <div
          className="relative z-10 flex items-center justify-center"
          style={{ marginBottom: 8 }}
        >
          <CategoryIcon
            category={categoryKey}
            size={16}
            className="shrink-0"
            style={{ color: active ? "white" : colors.text }}
          />
        </div>
      </div>
    </div>
  );
}

export function PopupCard({
  name,
  category,
  image_url,
  user_image_url,
  requires_booking,
  city,
  note,
}: {
  name: string;
  category?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  requires_booking?: string | null;
  city?: string | null;
  note?: string | null;
}) {
  const [noteExpanded, setNoteExpanded] = useState(false);
  const imageUrl = user_image_url || image_url;
  const booking = requires_booking ?? "no";
  const showBooking = booking === "yes" || booking === "yes_done";

  return (
    <div className="w-[220px] overflow-hidden rounded-xl bg-card shadow-lg">
      {imageUrl ? (
        <div className="relative h-28 w-full bg-muted">
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover object-center"
          />
          {/* Gradient overlay for badge readability */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                  booking === "yes_done"
                    ? "bg-booking-done-bg/95 text-booking-done-text"
                    : "bg-booking-pending-bg/95 text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        </div>
      ) : (
        (category || showBooking) && (
          <div className="flex flex-wrap gap-1 px-3 pt-3">
            {category && (
              <span
                data-testid="popup-category-badge"
                className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground"
              >
                {category}
              </span>
            )}
            {showBooking && (
              <span
                data-testid="popup-booking-badge"
                aria-label={booking === "yes_done" ? "Booked" : "Book"}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  booking === "yes_done"
                    ? "border-booking-done-border bg-booking-done-bg text-booking-done-text"
                    : "border-booking-pending-border bg-booking-pending-bg text-booking-pending-text"
                )}
              >
                {booking === "yes_done" ? "Booked ✓" : "Book"}
              </span>
            )}
          </div>
        )
      )}
      <div className="px-3 pb-3 pt-2.5">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {name}
        </p>
        {city && (
          <p
            data-testid="popup-city"
            className="mt-0.5 text-xs text-muted-foreground"
          >
            {city}
          </p>
        )}
        {note && (
          <button
            type="button"
            data-testid="popup-note"
            onClick={() => setNoteExpanded((prev) => !prev)}
            className="mt-2 block w-full cursor-pointer rounded-md bg-muted/60 px-2 py-1.5 text-left text-[11px] leading-relaxed text-muted-foreground outline-none transition-colors hover:bg-muted"
          >
            <span className={noteExpanded ? "" : "line-clamp-2"}>{note}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function ItineraryDayMap({
  locations,
  routes,
  compact,
  selectedRouteId,
}: ItineraryDayMapProps & { compact?: boolean }) {
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
  // Track route layer source IDs and coords so the highlight effect can update paint properties and fit bounds
  const routeSourceIdsRef = useRef<
    { routeId: string; sourceId: string; coords: [number, number][] }[]
  >([]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!locations.length) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    setSelectedLocationId(null);
    markerStateRef.current = null;

    let disposed = false;

    const first = locations[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: [first.longitude, first.latitude],
      zoom: locations.length === 1 ? 14.5 : 11,
      attributionControl: compact ? false : undefined,
    });

    mapRef.current = map;
    if (!compact) {
      map.addControl(
        new NavigationControl({ visualizePitch: true }),
        "top-right"
      );
    }

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
          category={loc.category}
          image_url={loc.image_url}
          user_image_url={loc.user_image_url}
          requires_booking={loc.requires_booking}
          city={loc.city}
          note={loc.note}
        />
      );
      popupRoots.push(popupRoot);

      const popup = new maplibregl.Popup({
        anchor: "bottom",
        offset: [0, -46] as Offset,
        closeButton: true,
        closeOnClick: false,
        maxWidth: "240px",
      }).setDOMContent(popupContentEl);

      const el = document.createElement("div");
      const root = createRoot(el);
      roots.push(root);
      popups.push(popup);

      function renderMarker(isOpen = false, isSelected = false) {
        if (disposed) return;
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
        if (disposed) return;
        setSelectedLocationId(loc.id);
        markers.forEach((m, i) => {
          if (locations[i].id !== loc.id) {
            popups[i].remove();
          }
        });
        renderMarker(true, true);
        // Pan so the pin is in the lower third of the viewport,
        // leaving room for the popup card above.
        const zoom = map.getZoom();
        const targetZoom = zoom < 12 ? 12 : zoom;
        const container = map.getContainer();
        const offsetY = container.clientHeight * 0.25;
        const pinScreen = map.project(lngLat);
        const adjustedCenter = map.unproject([
          pinScreen.x,
          pinScreen.y - offsetY,
        ]);
        map.flyTo({
          center: adjustedCenter,
          zoom: targetZoom,
          duration: 500,
        });
      });
      popup.on("close", () => {
        if (disposed) return;
        setSelectedLocationId((prev) => (prev === loc.id ? null : prev));
        renderMarker(false, false);
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, 0],
      })
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

    const routeSources: {
      routeId: string;
      sourceId: string;
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
          routeSources.push({
            routeId: route.routeId,
            sourceId,
            coords: allCoords,
          });
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

          // Outer glow for contrast and depth
          map.addLayer({
            id: `${sourceId}-glow`,
            type: "line",
            source: sourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": color,
              "line-width": 10,
              "line-opacity": 0.08,
              "line-blur": 4,
            },
          });

          // White casing for contrast against the map
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
              "line-width": 6,
              "line-opacity": 0.85,
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
              "line-width": 3.5,
              "line-opacity": 0.85,
            },
          });

          // Direction chevrons along the route
          map.addLayer({
            id: `${sourceId}-arrows`,
            type: "symbol",
            source: sourceId,
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": 80,
              "text-field": "▸",
              "text-size": 14,
              "text-rotation-alignment": "map",
              "text-keep-upright": false,
              "text-allow-overlap": true,
            },
            paint: {
              "text-color": color,
              "text-opacity": 0.7,
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
          padding: compact ? 20 : 40,
          maxZoom: compact ? 13 : 15,
          duration: 0,
        });
      }
      map.resize();

      // Place route labels avoiding marker overlap.
      // We check whether the label's bounding box (estimated from text)
      // would overlap any marker's bounding box on screen.
      if (pendingLabels.length > 0) {
        const MARKER_HALF_W = 20;
        const MARKER_HALF_H = 24;
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

      // Store route layer IDs now that all layers are added
      routeSourceIdsRef.current = routeSources;
    });

    requestAnimationFrame(() => map.resize());

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
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
  }, [locations, routes, compact]);

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

  // Highlight the selected route, dim others
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sources = routeSourceIdsRef.current;
    if (sources.length === 0) return;

    let selectedCoords: [number, number][] | null = null;

    for (const { routeId, sourceId, coords } of sources) {
      const isSelected = routeId === selectedRouteId;
      const isDimmed = selectedRouteId != null && !isSelected;

      if (isSelected) selectedCoords = coords;

      try {
        map.setPaintProperty(
          `${sourceId}-line`,
          "line-opacity",
          isDimmed ? 0.25 : 0.85
        );
        map.setPaintProperty(
          `${sourceId}-line`,
          "line-width",
          isSelected ? 5 : 3.5
        );
        map.setPaintProperty(
          `${sourceId}-outline`,
          "line-opacity",
          isDimmed ? 0.3 : 0.85
        );
        map.setPaintProperty(
          `${sourceId}-outline`,
          "line-width",
          isSelected ? 8 : 6
        );
        map.setPaintProperty(
          `${sourceId}-glow`,
          "line-opacity",
          isSelected ? 0.15 : isDimmed ? 0.02 : 0.08
        );
        map.setPaintProperty(
          `${sourceId}-arrows`,
          "text-opacity",
          isDimmed ? 0.15 : isSelected ? 0.9 : 0.7
        );
      } catch {
        // Layers may not exist yet if map hasn't loaded
      }
    }

    // Fit the map to the selected route's bounds
    if (selectedCoords && selectedCoords.length >= 2) {
      const routeBounds = new maplibregl.LngLatBounds();
      for (const c of selectedCoords) routeBounds.extend(c);
      map.fitBounds(routeBounds, {
        padding: compact ? 30 : 60,
        maxZoom: 15,
        duration: 500,
      });
    } else if (selectedRouteId == null) {
      // Deselected — fit back to all locations + routes
      const allBounds = new maplibregl.LngLatBounds();
      for (const loc of locations) {
        allBounds.extend([loc.longitude, loc.latitude]);
      }
      for (const { coords } of sources) {
        for (const c of coords) allBounds.extend(c);
      }
      if (!allBounds.isEmpty()) {
        map.fitBounds(allBounds, {
          padding: compact ? 20 : 40,
          maxZoom: compact ? 13 : 15,
          duration: 500,
        });
      }
    }
  }, [selectedRouteId, locations, compact]);

  return (
    <div
      ref={containerRef}
      data-testid="itinerary-day-map"
      data-selected-route-id={selectedRouteId ?? ""}
      className="h-full min-h-[200px] w-full"
    />
  );
}
