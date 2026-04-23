import {
  request,
  requestUpload,
  getAccessToken,
  ApiError,
  API_BASE,
} from "./transport";
import type {
  Location,
  LocationWriteBody,
  UpdateLocationBody,
  ImportSSEEvent,
} from "./types";

export const list = (tripId: string) =>
  request<Location[]>(`/api/v1/trips/${tripId}/locations`, {});

export const add = (tripId: string, body: LocationWriteBody) =>
  request<Location>(`/api/v1/trips/${tripId}/locations`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const batchAdd = (tripId: string, body: LocationWriteBody[]) =>
  request<Location[]>(`/api/v1/trips/${tripId}/locations/batch`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const update = (
  tripId: string,
  locationId: string,
  body: UpdateLocationBody
) =>
  request<Location>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const del = (tripId: string, locationId: string) =>
  request<void>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
    method: "DELETE",
  });

export const uploadPhoto = (
  tripId: string,
  locationId: string,
  file: File,
  cropData?: { x: number; y: number; width: number; height: number }
) =>
  requestUpload<Location>(
    `/api/v1/trips/${tripId}/locations/${locationId}/photo`,
    file,
    cropData ? { crop_data: JSON.stringify(cropData) } : undefined
  );

export const deletePhoto = (tripId: string, locationId: string) =>
  request<void>(`/api/v1/trips/${tripId}/locations/${locationId}/photo`, {
    method: "DELETE",
  });

export const importGoogleListStream = async (
  tripId: string,
  body: { google_list_url: string },
  onEvent: (event: ImportSSEEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const token = await getAccessToken();
  const res = await fetch(
    `${API_BASE}/api/v1/trips/${tripId}/locations/import-google-list-stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: "Import failed" }));
    throw new ApiError(
      errBody.detail || `HTTP ${res.status}`,
      res.status,
      errBody.detail
    );
  }

  if (!res.body) {
    throw new ApiError("Response body is not streamable", res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      for (const line of trimmed.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(data as ImportSSEEvent);
          } catch {
            // skip malformed events
          }
        }
      }
    }
  }
};
