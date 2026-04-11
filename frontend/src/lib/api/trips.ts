import { request } from "./transport";
import type { Trip } from "./types";

export const list = () => request<Trip[]>("/api/v1/trips");

export const get = (tripId: string) => request<Trip>(`/api/v1/trips/${tripId}`);

export const create = (body: {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
}) =>
  request<Trip>("/api/v1/trips", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const update = (
  tripId: string,
  body: {
    name?: string;
    start_date?: string | null;
    end_date?: string | null;
  }
) =>
  request<Trip>(`/api/v1/trips/${tripId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const del = (tripId: string) =>
  request<void>(`/api/v1/trips/${tripId}`, { method: "DELETE" });
