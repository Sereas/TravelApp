"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, FileUp, Loader2, MapPin } from "lucide-react";

import { api } from "@/lib/api";
import type { LocationPreviewPayload } from "@/components/locations/AddLocationForm";
import { useAutocomplete } from "@/features/locations/useAutocomplete";

/** Subset of Location fields needed to annotate Google suggestions with
 * the "On list" pill. Narrowed from `Location` so tests (and future
 * callers) don't have to construct full Location objects. */
type ExistingLocationSummary = {
  id: string;
  name: string;
  google_place_id: string | null;
};

import { ImportGoogleListDialog } from "./ImportGoogleListDialog";
import {
  LocationSuggestionList,
  type SuggestionItem,
} from "./LocationSuggestionList";

function looksLikeGoogleMapsUrl(text: string): boolean {
  return /google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(
    text
  );
}

/**
 * Build the suggestion list shown under the input. The list contains only
 * Google suggestions; the "On list" pill is added when a Google suggestion
 * already has a saved equivalent in the trip. We match on `place_id`
 * (preferred, O(1) hash lookup) and fall back to a case-insensitive name
 * substring match so legacy locations without a `google_place_id` still
 * show the pill.
 */
function buildSuggestionItems(
  googleSuggestions: {
    place_id: string;
    main_text: string;
    secondary_text: string | null;
    types: string[];
  }[],
  existingLocations: ExistingLocationSummary[]
): SuggestionItem[] {
  const byPlaceId = new Map<string, string>();
  for (const loc of existingLocations) {
    if (loc.google_place_id) byPlaceId.set(loc.google_place_id, loc.id);
  }

  return googleSuggestions.map((s) => {
    // Primary match: exact place_id (cheap, definitive).
    let matchedLocationId: string | null = byPlaceId.get(s.place_id) ?? null;

    // Fallback: case-insensitive name-substring match against ALL existing
    // locations. Catches two realistic cases:
    //   (a) Legacy locations added before the Places integration which
    //       have `google_place_id = null`.
    //   (b) Manually entered / URL-pasted locations whose persisted
    //       place_id differs from what Autocomplete now returns for the
    //       same place (Google occasionally returns multiple place_ids
    //       for the same venue).
    if (matchedLocationId === null && s.main_text) {
      const suggestionLower = s.main_text.toLowerCase();
      const fallback = existingLocations.find((loc) => {
        const name = (loc.name ?? "").toLowerCase();
        if (!name) return false;
        return (
          name === suggestionLower ||
          suggestionLower.includes(name) ||
          name.includes(suggestionLower)
        );
      });
      if (fallback) matchedLocationId = fallback.id;
    }
    return {
      kind: "google" as const,
      placeId: s.place_id,
      mainText: s.main_text,
      secondaryText: s.secondary_text,
      types: s.types,
      matchedLocationId,
    };
  });
}

interface SmartLocationInputProps {
  tripId: string;
  onSubmit: (value: string, isUrl: boolean) => void;
  onImported: () => void;
  /**
   * Trip locations held in memory on the parent page. Used to annotate
   * Google suggestions with the "On list" pill — no network call needed.
   * Accepts a narrowed shape so callers don't need to construct full
   * `Location` objects (and tests can pass simple fixtures).
   */
  existingLocations?: ExistingLocationSummary[];
  /**
   * Fired when the user clicks an "On list" suggestion. The parent is
   * expected to scroll to / highlight the matching LocationCard. When not
   * provided, clicking an on-list row is a no-op (no Google call either).
   */
  onPickExisting?: (locationId: string) => void;
  /**
   * Fired when the user picks a new Google suggestion and the backend has
   * resolved it via `/resolve`. The parent uses the prefill payload to open
   * the existing `AddLocationForm` in "prefilled-from-typeahead" mode,
   * avoiding a second `/preview` round-trip.
   */
  onGoogleResolved?: (prefill: LocationPreviewPayload) => void;
  /**
   * When true, the input renders disabled — read-only / shared trip views.
   * Shared viewers are also gated upstream via `useReadOnly()`, but this
   * prop is a belt-and-braces guard.
   */
  readOnly?: boolean;
}

export function SmartLocationInput({
  tripId,
  onSubmit,
  onImported,
  existingLocations,
  onPickExisting,
  onGoogleResolved,
  readOnly = false,
}: SmartLocationInputProps) {
  const [value, setValue] = useState("");
  // -1 == nothing highlighted yet; the first ArrowDown moves to index 0.
  // Matches WAI-ARIA combobox guidance and the test's expectation that
  // "ArrowDown × 2" lands on the second suggestion.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Manual "force close" flag — independent of item availability. We set it
  // on Escape / Tab / blur / URL input so the dropdown stays closed even if
  // there are still suggestions in memory.
  const [forceClosed, setForceClosed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const isUrl = looksLikeGoogleMapsUrl(trimmed);
  // We only ask the hook to search when the input is NOT a URL. URL pastes
  // go through the existing `/preview` path and must not burn autocomplete
  // quota. Feeding an empty string to the hook short-circuits at min-chars.
  const searchQuery = !isUrl && !readOnly ? trimmed : "";

  const { setQuery, suggestions, loading, consumeSession, resetSession } =
    useAutocomplete();

  // Keep the hook's internal query in sync with the input value.
  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery, setQuery]);

  const items = useMemo(
    () => buildSuggestionItems(suggestions, existingLocations ?? []),
    [suggestions, existingLocations]
  );

  // Derived open-state — synchronous, no extra render from an effect-chain.
  // Closed whenever: read-only, the input is a URL, too few chars, nothing
  // to show, or the user explicitly dismissed (forceClosed).
  const isOpen =
    !readOnly &&
    !isUrl &&
    !forceClosed &&
    trimmed.length >= 2 &&
    items.length > 0;

  // Keep the highlighted index in range as items shift — but preserve -1
  // (nothing highlighted) as a valid state so the first ArrowDown reliably
  // lands on index 0.
  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex((prev) => (prev >= items.length ? -1 : prev));
  }, [items, isOpen]);

  // Resetting the forceClosed flag when the user types something new — any
  // keystroke that produces a different query should reopen the dropdown.
  useEffect(() => {
    setForceClosed(false);
  }, [trimmed]);

  const closeDropdown = useCallback(() => {
    setForceClosed(true);
  }, []);

  const handleSubmit = useCallback(() => {
    const toSubmit = value.trim();
    if (!toSubmit) return;
    // URL-paste path stays on the existing preview flow — don't touch
    // autocomplete session.
    onSubmit(toSubmit, looksLikeGoogleMapsUrl(toSubmit));
    setValue("");
    setForceClosed(true);
    resetSession();
  }, [value, onSubmit, resetSession]);

  const handlePickSuggestion = useCallback(
    async (item: SuggestionItem) => {
      if (item.matchedLocationId) {
        // Already on the list — scroll to existing card, no Google call.
        setForceClosed(true);
        setValue("");
        resetSession();
        onPickExisting?.(item.matchedLocationId);
        return;
      }

      // New place — resolve via the paid Place Details Pro call regardless
      // of whether a handler is wired. Consuming the session token is a
      // cost-contract obligation: the `/resolve` call is what Google uses
      // to collapse preceding autocomplete requests into the free Session
      // Usage SKU. Skipping it turns every keystroke into $2.83/1000.
      const sessionToken = consumeSession();
      setResolving(true);
      setResolveError(null);
      try {
        const resolved = await api.google.resolvePlace({
          place_id: item.placeId,
          ...(sessionToken ? { session_token: sessionToken } : {}),
        });
        setForceClosed(true);
        setValue("");
        if (onGoogleResolved) {
          onGoogleResolved(resolved);
        } else {
          // No upstream prefill handler wired — pass the resolved name
          // through the existing text-submit path so the form still opens
          // (the AddLocationForm will run its own preview unnecessarily,
          // but this branch is only used in isolated tests or callers
          // that haven't upgraded to the prefill-aware mode).
          onSubmit(resolved.name, false);
        }
      } catch (err: unknown) {
        setResolveError(
          err instanceof Error ? err.message : "Could not resolve place"
        );
      } finally {
        setResolving(false);
      }
    },
    [onPickExisting, onGoogleResolved, onSubmit, consumeSession, resetSession]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (isOpen && items.length > 0 && highlightedIndex >= 0) {
          e.preventDefault();
          void handlePickSuggestion(items[highlightedIndex]);
          return;
        }
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (!isOpen || items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        // -1 or last → first; otherwise step forward. Wraps at the end.
        setHighlightedIndex((prev) =>
          prev < 0 || prev + 1 >= items.length ? 0 : prev + 1
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        // -1 or 0 → last; otherwise step back. Wraps at the start.
        setHighlightedIndex((prev) =>
          prev <= 0 ? items.length - 1 : prev - 1
        );
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
      } else if (e.key === "Tab") {
        closeDropdown();
      }
    },
    [
      isOpen,
      items,
      highlightedIndex,
      handlePickSuggestion,
      handleSubmit,
      closeDropdown,
    ]
  );

  const listboxId = "smart-location-suggestions";
  const activeDescendantId =
    isOpen && items.length > 0 && highlightedIndex >= 0
      ? `loc-suggestion-${highlightedIndex}`
      : undefined;

  return (
    <div className="mb-6 flex items-center gap-2.5">
      <div className="relative flex flex-1 items-center gap-2 rounded-2xl border-2 border-primary/25 bg-primary/[0.04] px-3.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <MapPin size={14} strokeWidth={2.5} />
        </div>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          placeholder="Add a location — paste a Google Maps link or type a name..."
          value={value}
          disabled={readOnly}
          readOnly={readOnly}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay close to allow mousedown-then-click on list items.
            setTimeout(() => setForceClosed(true), 150);
          }}
          onFocus={() => {
            // A focused input with existing text should reopen the dropdown
            // — release the manual close flag and let the derived isOpen
            // become true again.
            setForceClosed(false);
          }}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-activedescendant={activeDescendantId}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:outline-none disabled:cursor-not-allowed"
        />
        {/* Inline spinner — shows during autocomplete debounce / resolve. Sits
            to the left of the submit button so the button remains always
            visible when there's text (preserves the "submit ready" affordance
            even while suggestions are loading). */}
        {(loading || resolving) && (
          <span
            className="flex h-7 w-5 shrink-0 items-center justify-center text-muted-foreground"
            aria-hidden
          >
            <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
          </span>
        )}
        <AnimatePresence>
          {value.trim() && (
            <motion.button
              key="submit"
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={handleSubmit}
              disabled={resolving}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Add location"
            >
              <ArrowRight size={14} strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>

        {isOpen && (
          <LocationSuggestionList
            suggestions={items}
            highlightedIndex={highlightedIndex}
            query={trimmed}
            listboxId={listboxId}
            onSelect={(item) => void handlePickSuggestion(item)}
            onHover={(idx) => setHighlightedIndex(idx)}
          />
        )}

        {resolveError && (
          <span
            className="absolute -bottom-6 left-0 text-xs text-destructive"
            role="alert"
          >
            {resolveError}
          </span>
        )}
      </div>
      <ImportGoogleListDialog
        tripId={tripId}
        trigger={
          <button
            type="button"
            aria-label="Import Google List"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-foreground"
          >
            <FileUp size={16} />
            <span className="hidden sm:inline">Import List</span>
          </button>
        }
        onImported={onImported}
      />
    </div>
  );
}
