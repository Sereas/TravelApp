import { request } from "./transport";

export const previewLocationFromLink = (body: { google_link: string }) =>
  request<{
    name: string;
    address: string | null;
    city?: string | null;
    latitude: number | null;
    longitude: number | null;
    google_place_id: string;
    suggested_category: string | null;
    photo_resource_name: string | null;
  }>("/api/v1/locations/google/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
