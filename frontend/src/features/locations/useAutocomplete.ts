"use client";

/**
 * Typeahead autocomplete hook for the Add-a-location input.
 *
 * Cost contract (Places API New, 2026):
 *   - Each keystroke that settles past the debounce threshold triggers one
 *     `api.google.autocomplete()` call. Billed FREE as *Autocomplete
 *     Session Usage* SKU when the session concludes with a matching
 *     `api.google.resolvePlace()` call carrying the same `session_token`.
 *     Abandoned sessions are billed at $2.83 / 1000 (first 10k/mo free).
 *   - The lazy session-token ref ensures a UUID is only generated once the
 *     user actually types — no SSR hazard, no unused sessions.
 *
 * Features:
 *   * Debounce 250 ms (configurable via opts).
 *   * Minimum input length 2 chars; shorter queries clear suggestions
 *     and never hit the network.
 *   * In-memory cache keyed by normalised (trim + lowercase) query; stable
 *     for the lifetime of the hook.
 *   * `AbortController` cancels the previous in-flight fetch on every new
 *     query, so stale responses never overwrite newer ones.
 *   * `consumeSession()` returns the current token and rotates to a fresh
 *     one — call it just before `resolvePlace()` so the next typing
 *     session starts a new billing session.
 *   * Read-only bail-out: when `useReadOnly()` is `true` the hook returns
 *     inert state, never generates a UUID, and never calls the API. This
 *     keeps shared/readonly trip views free of Google traffic.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, type AutocompleteSuggestion } from "@/lib/api";
import { useReadOnly } from "@/lib/read-only-context";

export interface UseAutocompleteOptions {
  /** Debounce delay in milliseconds. Default 250 ms. */
  debounceMs?: number;
  /** Minimum query length before we make a network call. Default 2. */
  minChars?: number;
  /** Optional BCP-47 language code forwarded to Google. */
  languageCode?: string;
  /** Optional ccTLD region code forwarded to Google. */
  regionCode?: string;
  /** Optional location bias circle. */
  locationBias?: { lat: number; lng: number; radius_m: number };
}

export interface UseAutocompleteResult {
  query: string;
  setQuery: (next: string) => void;
  suggestions: AutocompleteSuggestion[];
  loading: boolean;
  error: string | null;
  /**
   * Returns the current session token (generating one lazily if needed)
   * AND rotates to a fresh token for the next session. Call this right
   * before `api.google.resolvePlace({ session_token })` so the completed
   * session collapses preceding autocomplete calls into the free tier.
   */
  consumeSession: () => string | null;
  /** Clear the session token and cached suggestions. */
  resetSession: () => void;
}

function normalise(q: string): string {
  return q.trim().toLowerCase();
}

function lazyRandomUUID(): string {
  // Guard against SSR / ancient runtimes. Every modern browser we support
  // has `crypto.randomUUID`; the explicit `??=` call path makes this safe
  // on Node ≥ 19 too (used by server-side tests).
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Last-resort fallback — RFC4122-ish random string. Not cryptographically
  // identical to randomUUID but satisfies the session-token character set
  // enforced by the backend (`^[A-Za-z0-9_\-]+$`, length 16-128).
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function useAutocomplete(
  opts: UseAutocompleteOptions = {}
): UseAutocompleteResult {
  const {
    debounceMs = 250,
    minChars = 2,
    languageCode,
    regionCode,
    locationBias,
  } = opts;

  const isReadOnly = useReadOnly();

  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy session token — generated on first real keystroke only. Never in
  // read-only mode.
  const sessionTokenRef = useRef<string | null>(null);
  // In-memory cache; cleared on reset. Keyed by normalised query.
  const cacheRef = useRef<Map<string, AutocompleteSuggestion[]>>(new Map());
  // Abort handle for the in-flight request (the superseded one).
  const abortControllerRef = useRef<AbortController | null>(null);
  // Debounce timer.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  const ensureSessionToken = useCallback((): string => {
    if (sessionTokenRef.current === null) {
      sessionTokenRef.current = lazyRandomUUID();
    }
    return sessionTokenRef.current;
  }, []);

  const consumeSession = useCallback((): string | null => {
    const token = sessionTokenRef.current;
    // Rotate — next call will lazily mint a new UUID.
    sessionTokenRef.current = null;
    // Clear cache so the fresh session doesn't serve stale suggestions.
    cacheRef.current.clear();
    return token;
  }, []);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
    cacheRef.current.clear();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSuggestions([]);
    setError(null);
    setLoading(false);
  }, []);

  // Main effect: debounce, cache, fetch. Runs on every `query` change.
  useEffect(() => {
    // Clear any pending debounced call from the previous render — every
    // keystroke restarts the timer.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Read-only bail: no calls, no UUID, no suggestions.
    if (isReadOnly) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      // Below threshold — clear dropdown content without touching the
      // network. Loading flag is reset so spinners hide.
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const cacheKey = normalise(trimmed);
    const cached = cacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setSuggestions(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    debounceTimerRef.current = setTimeout(() => {
      // Cancel any in-flight request from earlier.
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const ac = new AbortController();
      abortControllerRef.current = ac;

      const sessionToken = ensureSessionToken();

      // SKU: Autocomplete Requests (New). Billed FREE as Session Usage
      // when the session ends with a /resolve call sharing this token;
      // otherwise $2.83 / 1000 (first 10k/mo free).
      api.google
        .autocomplete({
          input: trimmed,
          session_token: sessionToken,
          language: languageCode,
          region: regionCode,
          location_bias: locationBias,
          signal: ac.signal,
        })
        .then((response) => {
          // Ignore if this request was aborted or superseded.
          if (ac.signal.aborted) return;
          cacheRef.current.set(cacheKey, response.suggestions);
          setSuggestions(response.suggestions);
          setError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          // Abort errors come in three flavours across runtimes; ignore
          // all of them.
          if (ac.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (err instanceof Error && err.name === "AbortError") return;
          setError(
            err instanceof Error ? err.message : "Autocomplete request failed"
          );
          setLoading(false);
        });
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // Stable primitive key prevents inline-literal `locationBias` props
    // from triggering a re-run on every parent render.
  }, [
    query,
    isReadOnly,
    debounceMs,
    minChars,
    languageCode,
    regionCode,
    locationBias?.lat,
    locationBias?.lng,
    locationBias?.radius_m,
    ensureSessionToken,
  ]);

  // Cleanup on unmount — abort any in-flight request.
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  return {
    query,
    setQuery,
    suggestions,
    loading,
    error,
    consumeSession,
    resetSession,
  };
}
