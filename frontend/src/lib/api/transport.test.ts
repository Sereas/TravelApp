/// <reference types="vitest/globals" />

/**
 * Tests for transport.ts — specifically verifying:
 * - request() attaches Bearer token by default (auth: true)
 * - request() skips Bearer when called with auth: false
 * - request() throws ApiError with status and detail on non-ok responses
 * - request() returns undefined for 204 No Content
 */

const mockGetSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

// Import after mocks are set up
import { request, ApiError } from "./transport";

describe("transport — request()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-jwt-token" } },
    });
    global.fetch = vi.fn();
  });

  it("test_request_attaches_bearer_token_when_auth_default", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "1" }),
    });

    await request("/api/v1/trips");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-jwt-token",
        }),
      })
    );
  });

  it("test_request_skips_bearer_when_auth_false", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "public" }),
    });

    await request("/api/v1/shared/some-token", {}, { auth: false });

    const callHeaders = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty("Authorization");
    // getAccessToken should not be called at all when auth: false
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("test_request_throws_ApiError_with_status_and_detail", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: "Validation error" }),
    });

    await expect(request("/api/v1/trips")).rejects.toThrow(ApiError);
    await expect(request("/api/v1/trips")).rejects.toMatchObject({
      status: 422,
      detail: "Validation error",
    });
  });

  it("test_request_returns_undefined_for_204", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      // No json() call expected
    });

    const result = await request<void>("/api/v1/trips/1", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("uses fallback error message when body has no detail", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    await expect(request("/api/v1/trips")).rejects.toMatchObject({
      status: 500,
      message: "Request failed with status 500",
    });
  });
});
