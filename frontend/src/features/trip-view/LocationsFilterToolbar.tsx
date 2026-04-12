"use client";

import { useMemo, useRef, useState } from "react";
import {
  Building2,
  Map as MapIcon,
  MapPin,
  Search,
  Tag,
  User,
  X,
} from "lucide-react";
import type { Location } from "@/lib/api";
import { FilterPill } from "./FilterPill";
import { cn } from "@/lib/utils";

export interface LocationsFilterToolbarProps {
  locations: Location[];
  isReadOnly: boolean;
  categoryFilter: string | null;
  cityFilter: string | null;
  personFilter: string | null;
  groupBy: "city" | "category" | "person" | null;
  locationNameSearch: string;
  onCategoryChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onPersonChange: (value: string | null) => void;
  onGroupByChange: (value: "city" | "category" | "person" | null) => void;
  onSearchChange: (value: string) => void;
  onMapOpen: () => void;
  categoryOptions: [string, number][];
}

export function LocationsFilterToolbar({
  locations,
  isReadOnly,
  categoryFilter,
  cityFilter,
  personFilter,
  groupBy,
  locationNameSearch,
  onCategoryChange,
  onCityChange,
  onPersonChange,
  onGroupByChange,
  onSearchChange,
  onMapOpen,
  categoryOptions,
}: LocationsFilterToolbarProps) {
  const [searchExpanded, setSearchExpanded] = useState(
    !!locationNameSearch.trim()
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      if (loc.city) set.add(loc.city);
    }
    return set;
  }, [locations]);

  const addedByEmails = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      if (loc.added_by_email) set.add(loc.added_by_email);
    }
    return set;
  }, [locations]);

  const cityOptions = useMemo(
    () =>
      Array.from(cities)
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c, label: c })),
    [cities]
  );

  const catPillOptions = useMemo(
    () =>
      categoryOptions.map(([cat, count]) => ({
        value: cat,
        label: cat,
        count,
      })),
    [categoryOptions]
  );

  const personOptions = useMemo(
    () =>
      Array.from(addedByEmails)
        .sort((a, b) => a.localeCompare(b))
        .map((email) => ({ value: email, label: email })),
    [addedByEmails]
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* Search pill */}
      {searchExpanded ? (
        <div className="relative flex items-center">
          <Search
            size={14}
            className="absolute left-2.5 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            type="search"
            role="searchbox"
            autoComplete="off"
            autoFocus
            placeholder="Search..."
            value={locationNameSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            onBlur={() => {
              if (!locationNameSearch.trim()) {
                setSearchExpanded(false);
              }
            }}
            className="h-8 w-44 rounded-full border border-border bg-card pl-8 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            aria-label="Search by location name"
          />
          <button
            type="button"
            className="absolute right-2 text-muted-foreground hover:text-foreground"
            onClick={() => {
              onSearchChange("");
              setSearchExpanded(false);
            }}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(
            "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
            locationNameSearch
              ? "bg-brand-muted text-brand-strong"
              : "text-foreground hover:bg-brand-muted"
          )}
          onClick={() => setSearchExpanded(true)}
        >
          <Search size={14} />
          Search
        </button>
      )}

      {/* Mobile-only Map pill */}
      <button
        type="button"
        onClick={onMapOpen}
        className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-muted lg:hidden"
        aria-label="Map"
      >
        <MapIcon size={14} />
        Map
      </button>

      {/* City filter */}
      {cities.size >= 2 && (
        <FilterPill
          label="City"
          icon={<Building2 size={14} />}
          options={cityOptions}
          selected={cityFilter}
          onChange={(val) => {
            onCityChange(val);
            if (val) {
              onCategoryChange(null);
              onGroupByChange(null);
            }
          }}
          allLabel="All cities"
          groupBy={!isReadOnly ? "city" : undefined}
          groupByActive={groupBy === "city"}
          onGroupByToggle={
            !isReadOnly
              ? () => {
                  onGroupByChange("city");
                  onCityChange(null);
                  onCategoryChange(null);
                  onPersonChange(null);
                }
              : undefined
          }
        />
      )}

      {/* Category filter */}
      {categoryOptions.length >= 2 && (
        <FilterPill
          label="Category"
          icon={<Tag size={14} />}
          options={catPillOptions}
          selected={categoryFilter}
          onChange={(val) => {
            onCategoryChange(val);
            if (val) onGroupByChange(null);
          }}
          allLabel="All categories"
          groupBy={!isReadOnly ? "category" : undefined}
          groupByActive={groupBy === "category"}
          onGroupByToggle={
            !isReadOnly
              ? () => {
                  onGroupByChange("category");
                  onCategoryChange(null);
                  onPersonChange(null);
                }
              : undefined
          }
        />
      )}

      {/* Added-by filter — edit only (PII) */}
      {!isReadOnly && addedByEmails.size >= 2 && (
        <FilterPill
          label="Added by"
          icon={<User size={14} />}
          options={personOptions}
          selected={personFilter}
          onChange={(val) => {
            onPersonChange(val);
            if (val) onGroupByChange(null);
          }}
          allLabel="Everyone"
          groupBy="person"
          groupByActive={groupBy === "person"}
          onGroupByToggle={() => {
            onGroupByChange("person");
            onPersonChange(null);
            onCityChange(null);
            onCategoryChange(null);
          }}
          triggerLabelFormat={(v) => v.split("@")[0]}
        />
      )}
    </div>
  );
}
