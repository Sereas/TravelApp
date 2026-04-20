"use client";

/**
 * Rendered below `SmartLocationInput` when typeahead suggestions are
 * available. Pure presentation: keyboard/click events bubble up to the
 * parent via `onSelect`; parent owns the state (highlightedIndex, session
 * token consumption, etc.).
 *
 * The "On list" pill is a visual affordance — it tells the user a
 * suggested place already exists in the trip. Clicking such a row scrolls
 * to the existing `LocationCard` instead of opening the add form (and
 * saves a Place Details Pro call, since nothing needs to be resolved).
 */

import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

export interface GoogleSuggestion {
  kind: "google";
  placeId: string;
  mainText: string;
  secondaryText: string | null;
  types: string[];
  /**
   * When non-null, the suggestion's place_id (or matched name) already
   * exists in the trip as a saved location. Clicking the row scrolls to
   * that location rather than opening the add-form flow.
   */
  matchedLocationId: string | null;
}

export interface ExistingSuggestion {
  kind: "existing";
  locationId: string;
  mainText: string;
  secondaryText: string | null;
}

export type SuggestionItem = GoogleSuggestion | ExistingSuggestion;

export interface LocationSuggestionListProps {
  suggestions: SuggestionItem[];
  highlightedIndex: number;
  query: string;
  listboxId: string;
  onSelect: (item: SuggestionItem) => void;
  onHover: (index: number) => void;
}

/**
 * Case-insensitive highlight of the matching substring. Pure client-side
 * rendering — no additional API cost.
 *
 * Keeps a sibling sr-only copy of the full text so that tools which walk
 * text nodes (RTL `getByText`, screen readers crawling character by
 * character) see the whole name as one unit. The visually-bolded version
 * is `aria-hidden` so assistive tech doesn't double-read it.
 */
function BoldMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + trimmed.length);
  const after = text.slice(idx + trimmed.length);
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {before}
        <strong className="font-semibold">{match}</strong>
        {after}
      </span>
    </>
  );
}

export function LocationSuggestionList({
  suggestions,
  highlightedIndex,
  query,
  listboxId,
  onSelect,
  onHover,
}: LocationSuggestionListProps) {
  if (suggestions.length === 0) return null;

  // Find the boundary between existing and google sections for the separator.
  const firstGoogleIdx = suggestions.findIndex((s) => s.kind === "google");
  const hasExisting = suggestions.some((s) => s.kind === "existing");
  const showSeparator = hasExisting && firstGoogleIdx > 0;

  function renderItem(item: SuggestionItem, idx: number) {
    const highlighted = idx === highlightedIndex;
    const onList =
      item.kind === "existing" ||
      (item.kind === "google" && item.matchedLocationId !== null);
    const itemKey =
      item.kind === "existing"
        ? `existing-${item.locationId}`
        : `google-${item.placeId}-${idx}`;

    return (
      <li
        key={itemKey}
        role="option"
        id={`loc-suggestion-${idx}`}
        aria-selected={highlighted}
        data-highlighted={highlighted || undefined}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
          highlighted ? "bg-primary/10" : "hover:bg-primary/[0.06]"
        )}
        onMouseEnter={() => onHover(idx)}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => onSelect(item)}
      >
        <MapPin
          size={16}
          className="shrink-0 text-muted-foreground"
          strokeWidth={2}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-foreground">
            <BoldMatch text={item.mainText} query={query} />
          </span>
          {item.secondaryText && (
            <span className="truncate text-xs text-muted-foreground">
              {item.secondaryText}
            </span>
          )}
        </div>
        {onList && (
          <span
            className="ml-auto inline-flex shrink-0 items-center rounded-full bg-brand-muted px-2 py-0.5 text-xs font-medium text-brand-strong"
            aria-label="Already on this trip"
          >
            On list
          </span>
        )}
      </li>
    );
  }

  return (
    <ul
      role="listbox"
      id={listboxId}
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-2xl border-2 border-primary/25 bg-popover py-1 shadow-lg"
    >
      {suggestions.map((item, idx) => {
        const nodes = [];
        if (showSeparator && idx === firstGoogleIdx) {
          nodes.push(
            <li
              key="section-separator"
              role="presentation"
              aria-hidden
              className="my-0.5 border-t border-border/40"
            />
          );
        }
        nodes.push(renderItem(item, idx));
        return nodes;
      })}
    </ul>
  );
}
