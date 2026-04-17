/// <reference types="vitest/globals" />
/**
 * Tests for useAutocomplete hook.
 *
 * The hook will live at:
 *   frontend/src/features/locations/useAutocomplete.ts
 *
 * These tests are in the RED phase: the hook does not exist yet.
 * Every test is expected to FAIL until the implementation lands.
 *
 * Key contracts being tested:
 * 1. Single UUID session_token across all keystrokes in one session
 * 2. New UUID generated after consumeSession()
 * 3. 250 ms debounce — N keystrokes within 250 ms → 1 API call
 * 4. AbortController abort on superseded request
 * 5. In-memory cache — same query doesn't hit network twice
 * 6. Min 2 chars threshold before API call
 * 7. Read-only bail-out — no calls, no UUID, when useReadOnly() returns true
 * 8. Lazy UUID — crypto.randomUUID() called only once per session
 */

import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that pulls in the hook or api.
// `vi.mock` is hoisted to the top of the file; any references inside its
// factory must come from `vi.hoisted` so they are initialised before the
// hoisted mock runs.
// ---------------------------------------------------------------------------

const { mockAutocomplete, readOnlyRef } = vi.hoisted(() => ({
  mockAutocomplete: vi.fn(),
  readOnlyRef: { current: false },
}));

vi.mock("@/lib/api", () => ({
  api: {
    google: {
      autocomplete: mockAutocomplete,
    },
  },
}));

vi.mock("@/lib/read-only-context", () => ({
  useReadOnly: () => readOnlyRef.current,
}));

function setIsReadOnly(value: boolean) {
  readOnlyRef.current = value;
}

// Mock crypto.randomUUID so we can track invocation count and return deterministic values
let _uuidCallCount = 0;
const _generatedUUIDs: string[] = [];
const _originalRandomUUID = globalThis.crypto?.randomUUID?.bind(
  globalThis.crypto
);
const _mockRandomUUID = vi.fn(() => {
  _uuidCallCount++;
  const uuid = `test-uuid-${_uuidCallCount}`;
  _generatedUUIDs.push(uuid);
  return uuid;
});

// Import AFTER mocks
import { useAutocomplete } from "./useAutocomplete";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 250;

function makeSuccessResponse(query: string) {
  return {
    suggestions: [
      {
        place_id: `ChIJ_${query}_1`,
        main_text: `${query} Place One`,
        secondary_text: "Paris, France",
        types: ["tourist_attraction"],
      },
      {
        place_id: `ChIJ_${query}_2`,
        main_text: `${query} Place Two`,
        secondary_text: "Lyon, France",
        types: ["establishment"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  _uuidCallCount = 0;
  _generatedUUIDs.length = 0;
  setIsReadOnly(false);
  // Install mock
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: _mockRandomUUID,
    writable: true,
    configurable: true,
  });
  mockAutocomplete.mockResolvedValue(makeSuccessResponse("default"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Restore real randomUUID if available
  if (_originalRandomUUID) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: _originalRandomUUID,
      writable: true,
      configurable: true,
    });
  }
});

// ---------------------------------------------------------------------------
// Test 1: Single UUID across multiple keystrokes in one session
// ---------------------------------------------------------------------------

describe("session_token lifetime", () => {
  it("uses the same session_token UUID across all keystrokes in a single session", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Ei"));

    const { result } = renderHook(() => useAutocomplete());

    // Keystroke 1: "E"  (below min chars — no call)
    act(() => {
      result.current.setQuery("E");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Keystroke 2: "Ei" (2 chars — first API call fires)
    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Keystroke 3: "Eif" (3 chars — second API call)
    act(() => {
      result.current.setQuery("Eif");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Keystroke 4: "Eiff" (4 chars — third API call)
    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // At least 2 calls should have been made (for "Ei", "Eif", "Eiff")
    expect(mockAutocomplete.mock.calls.length).toBeGreaterThanOrEqual(2);

    // ALL calls must carry the same session_token
    const sessionTokens = mockAutocomplete.mock.calls.map(
      (call) => call[0]?.session_token ?? call[0]?.sessionToken
    );
    const uniqueTokens = Array.from(new Set(sessionTokens.filter(Boolean)));
    expect(uniqueTokens.length).toBe(1);
    const singleToken = uniqueTokens[0];
    expect(typeof singleToken).toBe("string");
    expect(singleToken!.length).toBeGreaterThan(0);
  });

  it("generates a NEW session_token after consumeSession() is called", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Ei"));

    const { result } = renderHook(() => useAutocomplete());

    // First session: type "Ei"
    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    const firstToken = mockAutocomplete.mock.calls[0]?.[0]?.session_token;
    expect(firstToken).toBeDefined();

    // Consume the session (simulating a place pick)
    act(() => {
      result.current.consumeSession();
    });

    vi.clearAllMocks();
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Lo"));

    // Second session: type "Lo"
    act(() => {
      result.current.setQuery("Lo");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    const secondToken = mockAutocomplete.mock.calls[0]?.[0]?.session_token;
    expect(secondToken).toBeDefined();
    expect(secondToken).not.toBe(firstToken);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Debounce — multiple keystrokes within 250 ms → one API call
// ---------------------------------------------------------------------------

describe("debounce", () => {
  it("fires only one API call when four keystrokes arrive within 250 ms", async () => {
    const { result } = renderHook(() => useAutocomplete());

    // Four rapid keystrokes within debounce window
    act(() => {
      result.current.setQuery("E");
    });
    act(() => {
      result.current.setQuery("Ei");
    });
    act(() => {
      result.current.setQuery("Eif");
    });
    act(() => {
      result.current.setQuery("Eiff");
    });

    // Advance timer past the debounce threshold once
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Exactly one call should have fired (for the last value "Eiff")
    expect(mockAutocomplete).toHaveBeenCalledTimes(1);
    expect(
      mockAutocomplete.mock.calls[0][0]?.input ??
        mockAutocomplete.mock.calls[0][0]
    ).toBe("Eiff");
  });

  it("does not call the API before the debounce window expires", async () => {
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("Ei");
    });

    // Advance by less than the debounce window
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    });

    expect(mockAutocomplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 3: AbortController — previous request is cancelled on new keystroke
// ---------------------------------------------------------------------------

describe("request cancellation", () => {
  it("aborts the previous in-flight request when a new query arrives", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    let resolveFirst!: (value: unknown) => void;
    const firstRequestPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    // First request hangs
    mockAutocomplete.mockReturnValueOnce(firstRequestPromise);
    // Second request resolves immediately
    mockAutocomplete.mockResolvedValueOnce(makeSuccessResponse("Eif"));

    const { result } = renderHook(() => useAutocomplete());

    // First query
    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Second query arrives while first is still in flight
    act(() => {
      result.current.setQuery("Eif");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // The first request's AbortController must have been aborted
    expect(abortSpy).toHaveBeenCalled();

    // Clean up dangling promise
    resolveFirst(makeSuccessResponse("Ei"));
    abortSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Test 4: In-memory cache — same query does not hit network twice
// ---------------------------------------------------------------------------

describe("request cache", () => {
  it("does not call the API a second time for a cached query", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Eiff"));

    const { result } = renderHook(() => useAutocomplete());

    // First fetch for "Eiff"
    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(mockAutocomplete).toHaveBeenCalledTimes(1);

    // Navigate away (e.g., "Eifff") then back to "Eiff"
    act(() => {
      result.current.setQuery("Eifff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Still only 2 calls total — one for "Eiff", one for "Eifff".
    // The second "Eiff" must be a cache hit, not a new network request.
    expect(mockAutocomplete).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Minimum 2 characters before API call
// ---------------------------------------------------------------------------

describe("minimum character threshold", () => {
  it("does not call the API for a single-character query", async () => {
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("E");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it("does not call the API for an empty query", async () => {
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it("calls the API once the query reaches 2 characters", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Ei"));
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(mockAutocomplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Read-only bail-out
// ---------------------------------------------------------------------------

describe("read-only mode", () => {
  it("does not call the API when the component is in read-only mode", async () => {
    setIsReadOnly(true);
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it("returns empty suggestions when in read-only mode", async () => {
    setIsReadOnly(true);
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(result.current.suggestions).toEqual([]);
  });

  it("does not generate a UUID when in read-only mode", async () => {
    setIsReadOnly(true);
    const { result } = renderHook(() => useAutocomplete());

    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    expect(_mockRandomUUID).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 7: Lazy UUID — crypto.randomUUID() called only once per session
// ---------------------------------------------------------------------------

describe("lazy UUID generation", () => {
  it("calls crypto.randomUUID() only once during a full type→pick flow", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Eiff"));
    const { result } = renderHook(() => useAutocomplete());

    // Multiple keystrokes in the same session
    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });
    act(() => {
      result.current.setQuery("Eif");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });
    act(() => {
      result.current.setQuery("Eiff");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // Pick (consume session)
    act(() => {
      result.current.consumeSession();
    });

    // Only ONE UUID should have been generated for the entire session
    expect(_mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it("consumeSession() returns the current session token before rotating", async () => {
    mockAutocomplete.mockResolvedValue(makeSuccessResponse("Ei"));
    const { result } = renderHook(() => useAutocomplete());

    // Trigger UUID generation with first keystroke
    act(() => {
      result.current.setQuery("Ei");
    });
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    });

    // consumeSession() must return the same token that was passed to the API
    let consumedToken: string | null = null;
    act(() => {
      consumedToken = result.current.consumeSession();
    });

    const apiToken = mockAutocomplete.mock.calls[0]?.[0]?.session_token;
    expect(consumedToken).toBe(apiToken);
  });
});
