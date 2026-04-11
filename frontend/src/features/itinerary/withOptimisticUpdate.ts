/**
 * withOptimisticUpdate — try/catch/rollback wrapper for mutation handlers.
 *
 * Not a React hook. A plain async function that:
 *   1. Applies the optimistic patch via `setter` (synchronous).
 *   2. Calls `serverCall`.
 *   3. On error: calls `refetch` to roll back + calls `onError` with the error.
 *   4. Returns the server result or `undefined` on failure.
 *
 * Usage:
 *   return withOptimisticUpdate({
 *     setter: setItinerary,
 *     optimisticUpdate: prev => mutateOption(prev, dayId, optionId, patch),
 *     serverCall: () => api.itinerary.updateOption(tripId, dayId, optionId, patch),
 *     refetch: fetchItinerary,
 *     onError: err => setError(String(err)),
 *   });
 */

import type { ItineraryResponse } from "@/lib/api";

export interface WithOptimisticUpdateParams<TResult> {
  /** React setState dispatcher (or equivalent) for the itinerary. */
  setter: (
    updater: (prev: ItineraryResponse | null) => ItineraryResponse | null
  ) => void;
  /**
   * Pure function that takes the current itinerary and returns the optimistically
   * updated version. Only called when `prev` is non-null.
   */
  optimisticUpdate: (prev: ItineraryResponse) => ItineraryResponse;
  /** The async API call that persists the change. */
  serverCall: () => Promise<TResult>;
  /** Called with the thrown error when `serverCall` rejects. */
  onError: (err: unknown) => void;
  /**
   * Called after `onError` to reload authoritative state from the server,
   * effectively rolling back the optimistic patch.
   */
  refetch: () => Promise<void>;
}

export async function withOptimisticUpdate<TResult>(
  params: WithOptimisticUpdateParams<TResult>
): Promise<TResult | undefined> {
  const { setter, optimisticUpdate, serverCall, onError, refetch } = params;

  // Step 1: apply optimistic patch immediately (synchronous)
  setter((prev) => (prev ? optimisticUpdate(prev) : null));

  // Step 2: run the server call
  try {
    return await serverCall();
  } catch (err) {
    // Step 3: rollback via refetch + surface error
    onError(err);
    await refetch();
    return undefined;
  }
}
