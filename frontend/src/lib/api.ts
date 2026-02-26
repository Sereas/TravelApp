import { createBrowserClient } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail ?? `Request failed with status ${res.status}`,
      res.status,
      body.detail
    );
  }

  return res.json();
}

export interface Trip {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  google_link: string | null;
  note: string | null;
}

export const api = {
  trips: {
    list: () => request<Trip[]>("/api/v1/trips"),

    get: (tripId: string) => request<Trip>(`/api/v1/trips/${tripId}`),

    create: (body: {
      name: string;
      start_date?: string | null;
      end_date?: string | null;
    }) =>
      request<Trip>("/api/v1/trips", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
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
      }),

    delete: (tripId: string) =>
      request<void>(`/api/v1/trips/${tripId}`, { method: "DELETE" }),
  },

  locations: {
    list: (tripId: string) =>
      request<Location[]>(`/api/v1/trips/${tripId}/locations`),

    add: (
      tripId: string,
      body: {
        name: string;
        address?: string | null;
        google_link?: string | null;
        note?: string | null;
      }
    ) =>
      request<Location>(`/api/v1/trips/${tripId}/locations`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (
      tripId: string,
      locationId: string,
      body: {
        name?: string;
        address?: string | null;
        google_link?: string | null;
        note?: string | null;
      }
    ) =>
      request<Location>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    delete: (tripId: string, locationId: string) =>
      request<void>(`/api/v1/trips/${tripId}/locations/${locationId}`, {
        method: "DELETE",
      }),
  },
};
