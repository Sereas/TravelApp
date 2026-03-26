"use client";

import { useMemo, useState } from "react";
import type { Location } from "@/lib/api";
import { useReadOnly } from "@/lib/read-only-context";
import {
  ChevronDown,
  Compass,
  Inbox,
  MapPin,
  Plus,
  Search,
} from "lucide-react";

const COLLAPSED_COUNT = 4;
const SEARCH_THRESHOLD = 8;

interface UnscheduledLocationsPanelProps {
  locations: Location[];
  itineraryLocationMap: Map<string, string[]>;
  currentDayId: string | null;
  onScheduleToDay: (locationId: string, dayId: string) => void | Promise<void>;
}

export function UnscheduledLocationsPanel({
  locations,
  itineraryLocationMap,
  currentDayId,
  onScheduleToDay,
}: UnscheduledLocationsPanelProps) {
  const readOnly = useReadOnly();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("");

  const unscheduled = locations.filter(
    (location) => !itineraryLocationMap.has(location.id)
  );

  const filtered = useMemo(() => {
    if (!filter.trim()) return unscheduled;
    const q = filter.toLowerCase();
    return unscheduled.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.city?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q)
    );
  }, [unscheduled, filter]);

  const showSearch = unscheduled.length >= SEARCH_THRESHOLD;
  const needsCollapse = filtered.length > COLLAPSED_COUNT && !filter.trim();
  const visible =
    expanded || filter.trim() ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const hiddenCount = filtered.length - COLLAPSED_COUNT;

  return (
    <aside className="grain-overlay overflow-hidden rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox size={14} className="text-brand" />
          <span className="text-xs font-bold uppercase tracking-widest text-brand">
            Not yet planned
          </span>
        </div>
        {unscheduled.length > 0 && (
          <span className="stamp-badge text-[10px] text-primary">
            {unscheduled.length}
          </span>
        )}
      </div>

      {unscheduled.length === 0 ? (
        <div className="py-4 text-center">
          <Compass size={24} className="mx-auto mb-2 text-brand/40" />
          <p className="text-xs text-muted-foreground/60">
            All places planned!
          </p>
        </div>
      ) : (
        <>
          {showSearch && (
            <div className="relative mb-2">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
              />
              <input
                type="text"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setExpanded(false);
                }}
                placeholder="Filter places..."
                aria-label="Filter unscheduled places"
                className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          <div className="scrollbar-hide -mx-1 max-h-[320px] space-y-px overflow-y-auto px-1">
            {visible.map((location) => (
              <div
                key={location.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] leading-tight">
                    <span className="truncate font-bold text-foreground">
                      {location.name}
                    </span>
                    {location.city && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground/60">
                        <MapPin size={9} />
                        {location.city}
                      </span>
                    )}
                  </div>
                </div>
                {!readOnly && currentDayId && (
                  <button
                    type="button"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
                    aria-label={`Add ${location.name}`}
                    title="Add to current day"
                    onClick={(event) => {
                      event.stopPropagation();
                      onScheduleToDay(location.id, currentDayId);
                    }}
                  >
                    <Plus size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {needsCollapse && !expanded && hiddenCount > 0 && (
            <button
              type="button"
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
              onClick={() => setExpanded(true)}
            >
              Show {hiddenCount} more
              <ChevronDown size={12} />
            </button>
          )}

          {expanded && needsCollapse && (
            <button
              type="button"
              className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              Show less
            </button>
          )}

          {filter.trim() && filtered.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground/60">
              No matches
            </p>
          )}
        </>
      )}
    </aside>
  );
}
