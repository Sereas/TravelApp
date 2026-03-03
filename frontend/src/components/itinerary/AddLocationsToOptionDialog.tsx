"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Location } from "@/lib/api";

interface AddLocationsToOptionDialogProps {
  trigger: React.ReactNode;
  allLocations: Location[];
  alreadyAddedIds: Set<string>;
  startingCity: string | null;
  endingCity: string | null;
  onConfirm: (locationIds: string[]) => Promise<void>;
}

export function AddLocationsToOptionDialog({
  trigger,
  allLocations,
  alreadyAddedIds,
  startingCity,
  endingCity,
  onConfirm,
}: AddLocationsToOptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterByCities, setFilterByCities] = useState(true);
  const [saving, setSaving] = useState(false);

  const citiesForFilter = useMemo(() => {
    const s = new Set<string>();
    if (startingCity) s.add(startingCity.toLowerCase());
    if (endingCity) s.add(endingCity.toLowerCase());
    return s;
  }, [startingCity, endingCity]);

  const hasCityFilter = citiesForFilter.size > 0;

  const availableLocations = useMemo(() => {
    let locs = allLocations.filter((l) => !alreadyAddedIds.has(l.id));

    if (hasCityFilter && filterByCities) {
      locs = locs.filter(
        (l) => l.city && citiesForFilter.has(l.city.toLowerCase())
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      locs = locs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.city && l.city.toLowerCase().includes(q)) ||
          (l.category && l.category.toLowerCase().includes(q))
      );
    }

    return locs;
  }, [
    allLocations,
    alreadyAddedIds,
    hasCityFilter,
    filterByCities,
    citiesForFilter,
    search,
  ]);

  function toggleLocation(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setSelected(new Set());
      setSearch("");
      setFilterByCities(true);
    }
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await onConfirm(Array.from(selected));
      setOpen(false);
    } catch {
      // caller handles
    } finally {
      setSaving(false);
    }
  }

  const cityFilterLabel = [startingCity, endingCity]
    .filter(Boolean)
    .join(" & ");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add locations to plan</DialogTitle>
          <DialogDescription>
            Select locations from your trip to add to this day&apos;s plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            autoComplete="off"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Search locations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search locations"
          />

          {hasCityFilter && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filterByCities}
                onChange={(e) => setFilterByCities(e.target.checked)}
                className="rounded border-border"
              />
              Only show locations in {cityFilterLabel}
            </label>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-y border-border py-2">
          {availableLocations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {allLocations.length === 0
                ? "No locations in this trip yet."
                : search
                  ? "No matching locations."
                  : hasCityFilter && filterByCities
                    ? `No locations in ${cityFilterLabel}. Uncheck the filter to see all.`
                    : "All locations are already added."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {availableLocations.map((loc) => {
                const isSelected = selected.has(loc.id);
                return (
                  <li key={loc.id}>
                    <button
                      type="button"
                      onClick={() => toggleLocation(loc.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        )}
                      >
                        {isSelected && "✓"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{loc.name}</span>
                        {loc.city && (
                          <span className="ml-1.5 text-muted-foreground">
                            · {loc.city}
                          </span>
                        )}
                        {loc.category && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({loc.category})
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || selected.size === 0}
          >
            {saving
              ? "Adding…"
              : `Add ${selected.size > 0 ? `${selected.size} location${selected.size > 1 ? "s" : ""}` : "locations"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
