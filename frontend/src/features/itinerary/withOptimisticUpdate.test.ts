/**
 * Tests for withOptimisticUpdate — the try/catch/rollback helper.
 */
import { describe, expect, it, vi } from "vitest";

import { withOptimisticUpdate } from "./withOptimisticUpdate";
import type { ItineraryResponse } from "@/lib/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItinerary(label = "original"): ItineraryResponse {
  return { days: [], _label: label } as unknown as ItineraryResponse;
}

function makeOptimistic(label = "optimistic"): ItineraryResponse {
  return { days: [], _label: label } as unknown as ItineraryResponse;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withOptimisticUpdate", () => {
  it("applies optimistic patch synchronously via setter before serverCall resolves", async () => {
    const calls: string[] = [];
    const original = makeItinerary("original");
    const optimistic = makeOptimistic("optimistic");

    let capturedState: ItineraryResponse | null = original;
    const setter = vi.fn((updater: (prev: ItineraryResponse | null) => ItineraryResponse | null) => {
      capturedState = updater(capturedState);
      calls.push("setter");
    });

    const serverCall = vi.fn(async () => {
      calls.push("serverCall");
      return "result";
    });

    await withOptimisticUpdate({
      setter,
      optimisticUpdate: () => optimistic,
      serverCall,
      onError: vi.fn(),
      refetch: vi.fn(),
    });

    // setter called first, then serverCall
    expect(calls[0]).toBe("setter");
    expect(capturedState).toBe(optimistic);
  });

  it("does not call refetch or onError when serverCall succeeds", async () => {
    const refetch = vi.fn();
    const onError = vi.fn();
    const original = makeItinerary();

    await withOptimisticUpdate({
      setter: vi.fn((updater) => updater(original)),
      optimisticUpdate: () => makeOptimistic(),
      serverCall: vi.fn(async () => "ok"),
      onError,
      refetch,
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("returns the serverCall result to the caller on success", async () => {
    const original = makeItinerary();

    const result = await withOptimisticUpdate({
      setter: vi.fn((updater) => updater(original)),
      optimisticUpdate: () => makeOptimistic(),
      serverCall: vi.fn(async () => 42),
      onError: vi.fn(),
      refetch: vi.fn(),
    });

    expect(result).toBe(42);
  });

  it("calls refetch and onError when serverCall throws", async () => {
    const refetch = vi.fn(async () => {});
    const onError = vi.fn();
    const error = new Error("network down");
    const original = makeItinerary();

    const result = await withOptimisticUpdate({
      setter: vi.fn((updater) => updater(original)),
      optimisticUpdate: () => makeOptimistic(),
      serverCall: vi.fn(async () => {
        throw error;
      }),
      onError,
      refetch,
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(result).toBeUndefined();
  });

  it("passes the thrown error object to onError unchanged", async () => {
    const onError = vi.fn();
    const errorObj = { code: 500, message: "server error" };
    const original = makeItinerary();

    await withOptimisticUpdate({
      setter: vi.fn((updater) => updater(original)),
      optimisticUpdate: () => makeOptimistic(),
      serverCall: vi.fn(async () => {
        throw errorObj;
      }),
      onError,
      refetch: vi.fn(async () => {}),
    });

    expect(onError).toHaveBeenCalledWith(errorObj);
  });

  it("applies optimisticUpdate only to non-null prev state", async () => {
    const optimistic = makeOptimistic();
    let capturedState: ItineraryResponse | null = null;

    await withOptimisticUpdate({
      setter: (updater) => {
        capturedState = updater(null);
      },
      optimisticUpdate: () => optimistic,
      serverCall: vi.fn(async () => "ok"),
      onError: vi.fn(),
      refetch: vi.fn(),
    });

    // When prev is null, setter should receive null back (no optimistic applied)
    expect(capturedState).toBeNull();
  });
});
