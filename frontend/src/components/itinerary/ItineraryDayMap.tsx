"use client";

import { useEffect, useRef } from "react";
import maplibregl, { NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface ItineraryDayMapLocation {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

interface ItineraryDayMapProps {
  locations: ItineraryDayMapLocation[];
}

export function ItineraryDayMap({ locations }: ItineraryDayMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!locations.length) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const first = locations[0];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [first.longitude, first.latitude],
      zoom: locations.length === 1 ? 14.5 : 11,
    });

    mapRef.current = map;

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    const bounds = new maplibregl.LngLatBounds();

    locations.forEach((loc) => {
      const lngLat: [number, number] = [loc.longitude, loc.latitude];
      bounds.extend(lngLat);

      const popup = new maplibregl.Popup({ offset: 8 }).setHTML(
        `<div style="font-size: 12px; line-height: 1.4">
          <strong>${loc.name}</strong>${
            loc.address ? `<br/><span>${loc.address}</span>` : ""
          }
        </div>`
      );

      const el = document.createElement("div");
      el.className =
        "rounded-full bg-primary shadow-md border border-white w-3 h-3";

      new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .setPopup(popup)
        .addTo(map);
    });

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
    });

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [locations]);

  return <div ref={containerRef} className="h-64 w-full rounded-md" />;
}

