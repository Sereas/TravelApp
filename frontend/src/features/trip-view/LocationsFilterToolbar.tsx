"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Map as MapIcon,
  Tag,
  User,
} from "lucide-react";
import type { Location } from "@/lib/api";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
import { FilterPill } from "./FilterPill";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ScheduleFilterKey =
  | "all"
  | "scheduled"
  | "unscheduled"
  | "needs_booking";

export type SortKey = "recently_added" | "name_asc";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "recently_added", label: "Recently added" },
  { key: "name_asc", label: "Name A–Z" },
];

export interface LocationsFilterToolbarProps {
  locations: Location[];
  isReadOnly: boolean;
  categoryFilter: string | null;
  cityFilter: string | null;
  personFilter: string | null;
  groupBy: "city" | "category" | "person" | null;
  scheduleFilter: ScheduleFilterKey;
  sortBy: SortKey;
  onCategoryChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  onPersonChange: (value: string | null) => void;
  onGroupByChange: (value: "city" | "category" | "person" | null) => void;
  onScheduleFilterChange: (value: ScheduleFilterKey) => void;
  onSortChange: (value: SortKey) => void;
  onMapOpen: () => void;
  categoryOptions: [string, number][];
  /** Total locations matching non-schedule filters (for "All" tab count). */
  totalFiltered: number;
  /** Scheduled locations matching non-schedule filters. */
  scheduledCount: number;
  /** Locations that need booking (requires_booking === "yes"). */
  needsBookingCount: number;
}

const SCHEDULE_TABS: { key: ScheduleFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "unscheduled", label: "Unscheduled" },
  { key: "needs_booking", label: "Needs booking" },
];

export function LocationsFilterToolbar({
  locations,
  isReadOnly,
  categoryFilter,
  cityFilter,
  personFilter,
  groupBy,
  scheduleFilter,
  sortBy,
  onCategoryChange,
  onCityChange,
  onPersonChange,
  onGroupByChange,
  onScheduleFilterChange,
  onSortChange,
  onMapOpen,
  categoryOptions,
  totalFiltered,
  scheduledCount,
  needsBookingCount,
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

  const tabCounts: Record<ScheduleFilterKey, number> = {
    all: totalFiltered,
    scheduled: scheduledCount,
    unscheduled: unscheduledCount,
    needs_booking: needsBookingCount,
  };

  const [sortOpen, setSortOpen] = useState(false);
  const currentSortLabel =
    SORT_OPTIONS.find((o) => o.key === sortBy)?.label ?? "Recently added";

  return (
    <div className="mb-4 space-y-3">
      {/* Schedule status tabs + sort dropdown */}
      <div className="flex items-center gap-2">
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
                  "touch-target rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                onClick={() => onScheduleFilterChange(key)}
              >
                {label}{" "}
                <span
                  className={cn(
                    "ml-0.5 tabular-nums",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground/50"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort dropdown — right-aligned */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground/60">Sort</span>
          <Popover open={sortOpen} onOpenChange={setSortOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-expanded={sortOpen}
                aria-haspopup="true"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {currentSortLabel}
                <ChevronDown size={12} className="opacity-40" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto min-w-[10rem] p-1.5"
              align="end"
              sideOffset={6}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={cn(
                    "flex w-full items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    sortBy === opt.key
                      ? "bg-brand-muted font-medium text-brand-strong"
                      : "text-foreground hover:bg-muted"
                  )}
                  onClick={() => {
                    onSortChange(opt.key);
                    setSortOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Filter pills row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Mobile-only Map pill */}
        <button
          type="button"
          onClick={onMapOpen}
          className="touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-brand-muted lg:hidden"
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
              } else if (groupBy === "city") {
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
              if (val || groupBy === "category") onGroupByChange(null);
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
              if (val || groupBy === "person") onGroupByChange(null);
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
