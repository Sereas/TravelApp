"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
import type {
  GoogleSuggestion,
  ExistingSuggestion,
  SuggestionItem,
} from "@/components/locations/LocationSuggestionList";
import { useAutocomplete } from "@/features/locations/useAutocomplete";
import { cn } from "@/lib/utils";
import { api, type Location } from "@/lib/api";
import { CATEGORY_OPTIONS } from "@/lib/location-constants";
import { Check, Link2, Loader2, Search } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResolvedPlace {
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  suggested_category: string | null;
  photo_resource_name: string | null;
}

interface AddLocationsToOptionDialogProps {
  trigger: React.ReactNode;
  allLocations: Location[];
  alreadyAddedIds: Set<string>;
  startingCity: string | null;
  endingCity: string | null;
  onConfirm: (locationIds: string[]) => Promise<void>;
  tripId?: string;
  onLocationCreated?: (location: Location) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function looksLikeGoogleMapsUrl(text: string): boolean {
  return /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(
    text
  );
}

/** Build existing-location matches for the unified dropdown. */
function buildExistingMatches(
  query: string,
  locations: Location[]
): ExistingSuggestion[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return locations
    .filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.city && l.city.toLowerCase().includes(q))
    )
    .slice(0, 5)
    .map((l) => ({
      kind: "existing" as const,
      locationId: l.id,
      mainText: l.name,
      secondaryText: l.city ?? null,
    }));
}

/** Build Google suggestion items, annotated with pool matches. */
function buildGoogleItems(
  suggestions: { place_id: string; main_text: string; secondary_text: string | null; types: string[] }[],
  locations: Location[],
  shownIds: Set<string>
): GoogleSuggestion[] {
  const byPlaceId = new Map<string, string>();
  for (const loc of locations) {
    if (loc.google_place_id) byPlaceId.set(loc.google_place_id, loc.id);
  }

  const results: GoogleSuggestion[] = [];
  for (const s of suggestions) {
    let matchedLocationId: string | null = byPlaceId.get(s.place_id) ?? null;
    if (matchedLocationId === null && s.main_text) {
      const lower = s.main_text.toLowerCase();
      const fallback = locations.find(
        (l) => l.name.toLowerCase() === lower
      );
      if (fallback) matchedLocationId = fallback.id;
    }
    if (matchedLocationId && shownIds.has(matchedLocationId)) continue;
    results.push({
      kind: "google",
      placeId: s.place_id,
      mainText: s.main_text,
      secondaryText: s.secondary_text,
      types: s.types,
      matchedLocationId,
    });
  }
  return results;
}

// Easing from /animate skill — natural deceleration
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddLocationsToOptionDialog({
  trigger,
  allLocations,
  alreadyAddedIds,
  startingCity,
  endingCity,
  onConfirm,
  tripId,
  onLocationCreated,
}: AddLocationsToOptionDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterByCities, setFilterByCities] = useState(true);
  const [saving, setSaving] = useState(false);

  // Google resolution state
  const [resolved, setResolved] = useState<ResolvedPlace | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [category, setCategory] = useState("Other");
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const trimmed = search.trim();
  const isUrl = looksLikeGoogleMapsUrl(trimmed);
  const hasGoogle = Boolean(tripId);

  // Autocomplete — only fires when NOT a URL and Google is available
  const autocompleteQuery = hasGoogle && !isUrl ? trimmed : "";
  const {
    setQuery: setAutocompleteQuery,
    suggestions: rawSuggestions,
    loading: autocompleteLoading,
    consumeSession,
    resetSession,
  } = useAutocomplete();

  // Sync autocomplete query with search input
  useEffect(() => {
    setAutocompleteQuery(autocompleteQuery);
  }, [autocompleteQuery, setAutocompleteQuery]);

  // Build unified suggestion dropdown (existing-first, then Google).
  // Only shown when Google is available — without it the pool list already
  // handles search filtering and the dropdown would duplicate items.
  const suggestionItems: SuggestionItem[] = useMemo(() => {
    if (!hasGoogle || isUrl || trimmed.length < 2) return [];
    const existing = buildExistingMatches(trimmed, allLocations);
    const shownIds = new Set(existing.map((e) => e.locationId));
    const google = buildGoogleItems(rawSuggestions, allLocations, shownIds);
    return [...existing, ...google];
  }, [trimmed, isUrl, allLocations, rawSuggestions, hasGoogle]);

  const showDropdown =
    !isUrl &&
    !dropdownDismissed &&
    !resolved &&
    trimmed.length >= 2 &&
    suggestionItems.length > 0;

  // Reset dropdown dismiss when query changes
  useEffect(() => {
    setDropdownDismissed(false);
  }, [trimmed]);

  // Keep highlighted index in range
  useEffect(() => {
    if (!showDropdown) return;
    setHighlightedIdx((prev) =>
      prev >= suggestionItems.length ? -1 : prev
    );
  }, [suggestionItems, showDropdown]);

  // -- city filter for pool list --------------------------------------------
  const citiesForFilter = useMemo(() => {
    const s = new Set<string>();
    if (startingCity) s.add(startingCity.toLowerCase());
    if (endingCity) s.add(endingCity.toLowerCase());
    return s;
  }, [startingCity, endingCity]);

  const hasCityFilter = citiesForFilter.size > 0;

  const poolLocations = useMemo(() => {
    let locs = [...allLocations];

    if (hasCityFilter && filterByCities) {
      locs = locs.filter(
        (l) => l.city && citiesForFilter.has(l.city.toLowerCase())
      );
    }

    // When searching, filter pool by query too
    if (trimmed.length >= 1) {
      const q = trimmed.toLowerCase();
      locs = locs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.city && l.city.toLowerCase().includes(q)) ||
          (l.category && l.category.toLowerCase().includes(q))
      );
    }

    return locs;
  }, [allLocations, hasCityFilter, filterByCities, citiesForFilter, trimmed]);

  // -- handlers -------------------------------------------------------------

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setSelected(new Set());
      setSearch("");
      setFilterByCities(true);
      setResolved(null);
      setResolving(false);
      setResolveError(null);
      setCategory("Other");
      setHighlightedIdx(-1);
      setDropdownDismissed(false);
      resetSession();
    } else {
      resetSession();
    }
  }

  function toggleLocation(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (saving || selected.size === 0) return;
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

  // -- suggestion selection (from unified dropdown) -------------------------

  const handlePickSuggestion = useCallback(
    async (item: SuggestionItem) => {
      if (item.kind === "existing") {
        // Existing location — always add (never toggle-off from search)
        setSelected((prev) => new Set(prev).add(item.locationId));
        setSearch("");
        setDropdownDismissed(true);
        resetSession();
        return;
      }

      if (item.kind === "google" && item.matchedLocationId) {
        // Google result matching existing location — always add
        setSelected((prev) => new Set(prev).add(item.matchedLocationId!));
        setSearch("");
        setDropdownDismissed(true);
        resetSession();
        return;
      }

      // New Google place — resolve it
      setDropdownDismissed(true);
      setResolving(true);
      setResolveError(null);

      try {
        const token = consumeSession();
        const place = await api.google.resolvePlace({
          place_id: item.placeId,
          session_token: token ?? undefined,
        });
        if (!openRef.current) return;
        setResolved(place as ResolvedPlace);
        setCategory(place.suggested_category ?? "Other");
        setSearch(item.mainText);
      } catch (err) {
        if (!openRef.current) return;
        setResolveError(
          err instanceof Error ? err.message : "Failed to resolve place"
        );
      } finally {
        setResolving(false);
      }
    },
    [consumeSession, resetSession]
  );

  // -- link resolution ------------------------------------------------------

  async function handleLinkResolve() {
    if (!trimmed) return;
    setResolving(true);
    setResolveError(null);
    try {
      const place = await api.google.previewLocationFromLink({
        google_link: trimmed,
      });
      if (!openRef.current) return;
      setResolved(place as ResolvedPlace);
      setCategory(place.suggested_category ?? "Other");
    } catch (err) {
      if (!openRef.current) return;
      setResolveError(
        err instanceof Error ? err.message : "Failed to resolve link"
      );
    } finally {
      setResolving(false);
    }
  }

  // -- create location and queue into selection ------------------------------

  async function handleCreateAndQueue() {
    if (!resolved || !tripId) return;

    // If already in pool, just add to selection
    const existing = allLocations.find(
      (l) => l.google_place_id === resolved.google_place_id
    );
    if (existing) {
      setSelected((prev) => new Set(prev).add(existing.id));
      setResolved(null);
      setSearch("");
      setResolveError(null);
      setCategory("Other");
      return;
    }

    // Create in pool, then add to selection
    setSaving(true);
    try {
      const location = await api.locations.add(tripId, {
        name: resolved.name,
        address: resolved.address,
        city: resolved.city,
        category,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        google_place_id: resolved.google_place_id,
        google_source_type: "manual_url",
        photo_resource_name: resolved.photo_resource_name,
      });
      if (!openRef.current) return;
      onLocationCreated?.(location);
      setSelected((prev) => new Set(prev).add(location.id));
      setResolved(null);
      setSearch("");
      setResolveError(null);
      setCategory("Other");
    } catch (err) {
      setResolveError(
        err instanceof Error ? err.message : "Failed to create location"
      );
    } finally {
      setSaving(false);
    }
  }

  // -- keyboard nav ---------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) {
      if (e.key === "Enter" && isUrl && !resolving) {
        e.preventDefault();
        handleLinkResolve();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev >= suggestionItems.length - 1 ? 0 : prev + 1
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev <= 0 ? suggestionItems.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && highlightedIdx >= 0) {
      e.preventDefault();
      handlePickSuggestion(suggestionItems[highlightedIdx]);
    } else if (e.key === "Escape") {
      setDropdownDismissed(true);
    }
  }

  // -- derived ---------------------------------------------------------------

  const cityFilterLabel = [startingCity, endingCity]
    .filter(Boolean)
    .join(" & ");

  // Show pool list only when NOT showing resolved card, link prompt, or
  // Google suggestion results (inline suggestions replace the pool).
  const showPool = !resolved && !isUrl && !showDropdown;

  // Selected location names for the summary chips
  const selectedLocations = useMemo(
    () => allLocations.filter((l) => selected.has(l.id)),
    [allLocations, selected]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 sm:max-w-lg">
        <DialogHeader className="pb-3">
          <DialogTitle>Add locations to plan</DialogTitle>
          <DialogDescription className="sr-only">
            Search and select locations to add to this day&apos;s plan.
          </DialogDescription>
        </DialogHeader>

        {/* ── Unified search bar ── */}
        <div className="relative">
          {isUrl ? (
            <Link2
              size={15}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground/60"
            />
          ) : (
            <Search
              size={15}
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground/60"
            />
          )}
          <input
            ref={inputRef}
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-10 text-sm shadow-sm transition-shadow placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            placeholder={
              hasGoogle
                ? "Search your locations or find new\u2026"
                : "Search locations\u2026"
            }
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setResolved(null);
              setResolveError(null);
            }}
            onKeyDown={handleKeyDown}
            aria-label="Search locations"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? "add-loc-suggestions" : undefined}
            aria-activedescendant={
              showDropdown && highlightedIdx >= 0
                ? `loc-suggestion-${highlightedIdx}`
                : undefined
            }
            aria-autocomplete="list"
          />
          {(autocompleteLoading || resolving) && (
            <Loader2
              size={15}
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 animate-spin text-muted-foreground/50"
            />
          )}
        </div>

        {/* ── Inline Google suggestions (replaces pool while searching) ── */}
        {showDropdown && (
          <ul
            role="listbox"
            id="add-loc-suggestions"
            className="mt-2 min-h-0 flex-1 space-y-px overflow-y-auto border-t border-border/40 py-1"
          >
            {suggestionItems.map((item, idx) => {
              const highlighted = idx === highlightedIdx;
              const onList =
                item.kind === "existing" ||
                (item.kind === "google" && item.matchedLocationId !== null);
              const key =
                item.kind === "existing"
                  ? `ex-${item.locationId}`
                  : `g-${item.placeId}-${idx}`;

              return (
                <li
                  key={key}
                  role="option"
                  id={`loc-suggestion-${idx}`}
                  aria-selected={highlighted}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150",
                    highlighted ? "bg-brand/[0.08]" : "hover:bg-muted/50"
                  )}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePickSuggestion(item)}
                >
                  <Search
                    size={14}
                    className="shrink-0 text-muted-foreground/40"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">
                      {item.mainText}
                    </span>
                    {item.secondaryText && (
                      <span className="ml-1.5 text-xs text-muted-foreground/60">
                        {item.secondaryText}
                      </span>
                    )}
                  </div>
                  {onList && (
                    <span className="shrink-0 rounded-full bg-brand-muted px-2 py-0.5 text-[10px] font-medium text-brand-strong">
                      On list
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* ── Link resolve prompt ── */}
        <AnimatePresence mode="wait">
          {isUrl && !resolved && !resolving && (
            <motion.button
              key="link-resolve"
              type="button"
              onClick={handleLinkResolve}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE_OUT_QUART }}
              className="mt-3 flex items-center gap-2.5 rounded-xl border border-dashed border-brand/25 bg-brand/[0.03] px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/[0.06] hover:text-foreground"
            >
              <Link2 size={15} className="shrink-0 text-brand/60" />
              <span>Resolve this Google Maps link</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Resolve error ── */}
        <AnimatePresence>
          {resolveError && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 overflow-hidden rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {resolveError}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ── Resolved place card ── */}
        <AnimatePresence mode="wait">
          {resolved && (
            <motion.div
              key="resolved"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -4 }}
              transition={{ duration: 0.25, ease: EASE_OUT_QUART }}
              className="mt-3 space-y-3 rounded-xl border border-brand/20 bg-brand/[0.03] p-4"
            >
              <div>
                <p className="font-medium text-foreground">{resolved.name}</p>
                {resolved.address && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {resolved.address}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pt-4">
                  <Button
                    size="sm"
                    onClick={handleCreateAndQueue}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    {saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    {saving ? "Adding\u2026" : "Add to plan"}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Pool locations (city-filtered quick-add list) ── */}
        {showPool && (
          <>
            {hasCityFilter && (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={filterByCities}
                    onChange={(e) => setFilterByCities(e.target.checked)}
                    className="rounded border-border accent-brand"
                  />
                  Only show locations in {cityFilterLabel}
                </label>
              </div>
            )}

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-border/40 pt-1">
              {poolLocations.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground/60">
                  {allLocations.length === 0
                    ? "No locations in this trip yet."
                    : trimmed
                      ? "No matching locations in your trip."
                      : hasCityFilter && filterByCities
                        ? `No locations in ${cityFilterLabel}.`
                        : "No locations found."}
                </p>
              ) : (
                <ul className="space-y-px py-1">
                  {poolLocations.map((loc) => {
                    const isSelected = selected.has(loc.id);
                    const isAlreadyAdded = alreadyAddedIds.has(loc.id);
                    return (
                      <li key={loc.id}>
                        <button
                          type="button"
                          onClick={() => toggleLocation(loc.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-150",
                            isSelected
                              ? "bg-brand/10 ring-1 ring-brand/20"
                              : "hover:bg-muted/50"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150",
                              isSelected
                                ? "border-brand bg-brand text-white"
                                : "border-border/60"
                            )}
                          >
                            {isSelected && (
                              <Check size={11} strokeWidth={3} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{loc.name}</span>
                            {loc.city && (
                              <span className="ml-1.5 text-muted-foreground/70">
                                &middot; {loc.city}
                              </span>
                            )}
                            {loc.category && (
                              <span className="ml-1 text-xs text-muted-foreground/50">
                                ({loc.category})
                              </span>
                            )}
                          </span>
                          {isAlreadyAdded && (
                            <span className="shrink-0 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                              In plan
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {/* ── Selection summary chips ── */}
        <AnimatePresence>
          {selectedLocations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT_QUART }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 border-t border-border/30 px-1 pt-3">
                {selectedLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => toggleLocation(loc.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-strong transition-colors hover:bg-brand/20"
                  >
                    {loc.name}
                    <span className="ml-0.5 text-brand/50">&times;</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Footer ── */}
        <DialogFooter className="mt-3 gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (resolved || isUrl) {
                // Go back to pool view instead of closing
                setResolved(null);
                setSearch("");
                setResolveError(null);
                setCategory("Other");
              } else {
                setOpen(false);
              }
            }}
            disabled={saving}
          >
            {resolved || isUrl ? "Back" : "Cancel"}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={saving || selected.size === 0}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : selected.size > 0 ? (
              <Check size={14} />
            ) : null}
            {saving
              ? "Adding\u2026"
              : selected.size > 0
                ? `Add ${selected.size} location${selected.size > 1 ? "s" : ""}`
                : "Add locations"}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
