/// <reference types="vitest/globals" />

/**
 * Tests for locations.ts — verifying payload shapes and HTTP method/URL.
 * Uses vi.mock("./transport") to intercept the underlying request() call.
 */

import type { LocationWriteBody } from "./types";

// vi.mock is hoisted — declare mocks before imports using vi.hoisted
const { mockRequest, mockRequestUpload } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockRequestUpload: vi.fn(),
}));

vi.mock("./transport", () => ({
  request: mockRequest,
  requestUpload: mockRequestUpload,
  getAccessToken: vi.fn().mockResolvedValue(null),
  API_BASE: "http://localhost:8000",
  ApiError: class ApiError extends Error {
    status: number;
    detail?: string;
    constructor(message: string, status: number, detail?: string) {
      super(message);
      this.status = status;
      this.detail = detail;
    }
  },
}));

// Import AFTER mocks
import * as locations from "./locations";

describe("locations API module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.mockResolvedValue({ id: "loc-1", name: "Eiffel Tower" });
    mockRequestUpload.mockResolvedValue({
      id: "loc-1",
      name: "Eiffel Tower",
      image_url: "https://example.com/img.jpg",
    });
  });

  it("test_add_uses_LocationWriteBody", async () => {
    const body: LocationWriteBody = {
      name: "Eiffel Tower",
      address: "Champ de Mars, Paris",
      category: "attraction",
      note: "Great views",
      city: "Paris",
    };

    await locations.add("trip-1", body);

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  });

  it("test_add_sends_minimal_body_with_only_name", async () => {
    await locations.add("trip-1", { name: "Louvre" });

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Louvre" }),
      })
    );
  });

  it("test_batchAdd_accepts_array", async () => {
    mockRequest.mockResolvedValue([
      { id: "loc-1", name: "Eiffel Tower" },
      { id: "loc-2", name: "Louvre" },
    ]);

    const items: LocationWriteBody[] = [
      { name: "Eiffel Tower", city: "Paris" },
      { name: "Louvre", city: "Paris" },
    ];

    const result = await locations.batchAdd("trip-1", items);

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(items),
      })
    );
    expect(Array.isArray(result)).toBe(true);
  });

  it("test_batchAdd_accepts_empty_array", async () => {
    mockRequest.mockResolvedValue([]);

    await locations.batchAdd("trip-1", []);

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/batch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify([]),
      })
    );
  });

  it("test_update_uses_partial_LocationWriteBody", async () => {
    const partial: Partial<LocationWriteBody> = {
      note: "Updated note",
      requires_booking: "yes",
    };

    await locations.update("trip-1", "loc-1", partial);

    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/loc-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(partial),
      })
    );
  });

  it("list calls correct URL", async () => {
    mockRequest.mockResolvedValue([]);
    await locations.list("trip-1");
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations",
      {}
    );
  });

  it("delete calls DELETE on correct URL", async () => {
    mockRequest.mockResolvedValue(undefined);
    await locations.del("trip-1", "loc-1");
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/loc-1",
      { method: "DELETE" }
    );
  });

  it("deletePhoto calls DELETE on photo URL", async () => {
    mockRequest.mockResolvedValue(undefined);
    await locations.deletePhoto("trip-1", "loc-1");
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/loc-1/photo",
      { method: "DELETE" }
    );
  });

  it("uploadPhoto uses requestUpload with correct path", async () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    await locations.uploadPhoto("trip-1", "loc-1", file);
    expect(mockRequestUpload).toHaveBeenCalledWith(
      "/api/v1/trips/trip-1/locations/loc-1/photo",
      file
    );
  });
});
