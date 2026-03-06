/// <reference types="vitest/globals" />
import { api, ApiError } from "./api";

const mockGetSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

describe("API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-jwt-token" } },
    });
    global.fetch = vi.fn();
  });

  it("includes Authorization header with JWT", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await api.trips.list();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-jwt-token",
        }),
      })
    );
  });

  it("omits Authorization header when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await api.trips.list();

    const callHeaders = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty("Authorization");
  });

  it("sends POST with JSON body for create trip", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "1",
          name: "Paris",
          start_date: null,
          end_date: null,
        }),
    });

    await api.trips.create({ name: "Paris" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Paris" }),
      })
    );
  });

  it("sends PATCH for update trip", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "1",
          name: "Rome",
          start_date: null,
          end_date: null,
        }),
    });

    await api.trips.update("trip-1", { name: "Rome" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips/trip-1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Rome" }),
      })
    );
  });

  it("sends DELETE for delete trip", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
    });

    await api.trips.delete("trip-1");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips/trip-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("throws ApiError on non-ok response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: "Trip not found" }),
    });

    await expect(api.trips.get("bad-id")).rejects.toThrow(ApiError);
    await expect(api.trips.get("bad-id")).rejects.toMatchObject({
      status: 404,
      detail: "Trip not found",
    });
  });

  it("calls correct URL for locations endpoints", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await api.locations.list("trip-1");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips/trip-1/locations"),
      expect.any(Object)
    );
  });

  it("sends POST for add location", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "loc-1",
          name: "Eiffel Tower",
          address: null,
          google_link: null,
          note: null,
        }),
    });

    await api.locations.add("trip-1", { name: "Eiffel Tower" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/trips/trip-1/locations"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Eiffel Tower" }),
      })
    );
  });

  it("sends PATCH for reorderOptionLocations", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            option_id: "opt-1",
            location_id: "loc-2",
            sort_order: 0,
            time_period: "morning",
            location: { id: "loc-2", name: "Louvre" },
          },
          {
            option_id: "opt-1",
            location_id: "loc-1",
            sort_order: 1,
            time_period: "afternoon",
            location: { id: "loc-1", name: "Eiffel" },
          },
        ]),
    });

    const result = await api.itinerary.reorderOptionLocations(
      "trip-1",
      "day-1",
      "opt-1",
      { location_ids: ["loc-2", "loc-1"] }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/trips/trip-1/days/day-1/options/opt-1/locations/reorder"
      ),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ location_ids: ["loc-2", "loc-1"] }),
      })
    );
    expect(result).toHaveLength(2);
    expect(result[0].location_id).toBe("loc-2");
    expect(result[0].sort_order).toBe(0);
  });

  it("sends PATCH for updateOptionLocation", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          option_id: "opt-1",
          location_id: "loc-1",
          sort_order: 0,
          time_period: "evening",
          location: { id: "loc-1", name: "Eiffel" },
        }),
    });

    const result = await api.itinerary.updateOptionLocation(
      "trip-1",
      "day-1",
      "opt-1",
      "loc-1",
      { time_period: "evening" }
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/trips/trip-1/days/day-1/options/opt-1/locations/loc-1"
      ),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ time_period: "evening" }),
      })
    );
    expect(result.time_period).toBe("evening");
  });
});
