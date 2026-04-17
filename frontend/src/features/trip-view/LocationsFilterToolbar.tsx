"use client";

import { useMemo } from "react";
import { Building2, Map as MapIcon, Tag, User } from "lucide-react";
import type { Location } from "@/lib/api";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
import { FilterPill } from "./FilterPill";
import { cn } from "@/lib/utils";

export interface LocationsFilterToolbarProps {
  locations: Location[];
  isReadOnly: boolean;
  categoryFilter: string | null;
  cityFilter: string | null;
  personFilter: string | null;
  groupBy: "city" | "category" | "person" | null;
  scheduleFilter: "all" | "scheduled" | "unscheduled";
  onCategoryChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onPersonChange: (value: string | null) => void;
  onGroupByChange: (value: "city" | "category" | "person" | null) => void;
  onScheduleFilterChange: (value: "all" | "scheduled" | "unscheduled") => void;
  onMapOpen: () => void;
  categoryOptions: [string, number][];
  /** Total locations matching non-schedule filters (for "All" tab count). */
  totalFiltered: number;
  /** Scheduled locations matching non-schedule filters. */
  scheduledCount: number;
}

const SCHEDULE_TABS = [
  { key: "all" as const, label: "All" },
  { key: "scheduled" as const, label: "Scheduled" },
  { key: "unscheduled" as const, label: "Unscheduled" },
];

export function LocationsFilterToolbar({
  locations,
  isReadOnly,
  categoryFilter,
  cityFilter,
  personFilter,
  groupBy,
  scheduleFilter,
  onCategoryChange,
  onCityChange,
  onPersonChange,
  onGroupByChange,
  onScheduleFilterChange,
  onMapOpen,
  categoryOptions,
  totalFiltered,
  scheduledCount,
}: LocationsFilterToolbarProps) {
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
        colorDot: (
          CATEGORY_META as Record<string, (typeof CATEGORY_META)[CategoryKey]>
        )[cat]?.text?.replace("text-", "bg-"),
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

  const unscheduledCount = totalFiltered - scheduledCount;

  const tabCounts: Record<string, number> = {
    all: totalFiltered,
    scheduled: scheduledCount,
    unscheduled: unscheduledCount,
  };

  return (
    <div className="mb-4 space-y-2.5">
      {/* Schedule status filter — serves as heading + primary filter */}
      <div
        role="radiogroup"
        aria-label="Filter by schedule status"
        className="flex items-center gap-1"
      >
        {SCHEDULE_TABS.map(({ key, label }) => {
          const isActive = scheduleFilter === key;
          const count = tabCounts[key];
          return (
            <button
              key={key}
              role="radio"
              type="button"
              aria-checked={isActive}
              className={cn(
                "touch-target rounded-full px-3 py-1 text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-muted text-brand-strong"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onScheduleFilterChange(key)}
            >
              {label} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filter pills row */}
      <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
