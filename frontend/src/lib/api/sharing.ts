import { request, ApiError } from "./transport";
import type { ShareResponse, SharedTripData } from "./types";

/** Create or get existing share link for a trip. */
export const createShare = (tripId: string) =>
  request<ShareResponse>(`/api/v1/trips/${tripId}/share`, {
    method: "POST",
  });

/** Get current active share status. Returns null if no active share (404). */
export const getShare = async (
  tripId: string
): Promise<ShareResponse | null> => {
  try {
    return await request<ShareResponse>(`/api/v1/trips/${tripId}/share`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
};

/** Revoke the active share link. */
export const revokeShare = (tripId: string) =>
  request<void>(`/api/v1/trips/${tripId}/share`, { method: "DELETE" });

/** Get shared trip data (public, no auth). */
export const getSharedTrip = (token: string) =>
  request<SharedTripData>(`/api/v1/shared/${token}`, {}, { auth: false });
