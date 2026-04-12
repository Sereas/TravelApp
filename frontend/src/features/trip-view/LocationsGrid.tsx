"use client";

import type { ReactNode } from "react";
import { MapPin, Tag, User } from "lucide-react";
import type { Location } from "@/lib/api";

export interface LocationsGridProps {
  filteredLocations: Location[];
  groupBy: "city" | "category" | "person" | null;
  groupedLocations: [string, Location[]][] | null;
  locationNameSearch: string;
  categoryFilter: string | null;
  cityFilter: string | null;
  personFilter: string | null;
  renderLocationCard: (loc: Location) => ReactNode;
}

export function LocationsGrid({
  filteredLocations,
  groupBy,
  groupedLocations,
  locationNameSearch,
  categoryFilter,
  cityFilter,
  personFilter,
  renderLocationCard,
}: LocationsGridProps) {
  const hasActiveFilter =
    !!locationNameSearch.trim() ||
    !!categoryFilter ||
    !!cityFilter ||
    !!personFilter;

  if (filteredLocations.length === 0 && hasActiveFilter) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No locations match the current filters.
      </p>
    );
  }

  if (groupedLocations) {
    return (
      <div className="space-y-8">
        {groupedLocations.map(([groupName, locs]) => (
          <div key={groupName}>
            <div className="mb-4 flex items-center gap-3">
              {groupBy === "city" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                  <MapPin size={14} className="text-brand" />
                </div>
              )}
              {groupBy === "category" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                  <Tag size={14} className="text-brand" />
                </div>
              )}
              {groupBy === "person" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <User size={14} className="text-primary" />
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {groupName}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {locs.length} {locs.length === 1 ? "location" : "locations"}
                </p>
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {locs.map(renderLocationCard)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filteredLocations.map(renderLocationCard)}
    </div>
  );
}
