"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Trip, type Location } from "@/lib/api";
import { LocationRow } from "@/components/locations/LocationRow";
import { AddLocationForm } from "@/components/locations/AddLocationForm";
import { EditLocationRow } from "@/components/locations/EditLocationRow";
import { EditTripForm } from "@/components/trips/EditTripForm";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { Button } from "@/components/ui/button";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} \u2014 ${formatDate(end)}`;
  if (start) return `Starts ${formatDate(start)}`;
  return `Ends ${formatDate(end!)}`;
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params.id;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTrip, setEditingTrip] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null
  );

  async function fetchData() {
    setError(null);
    setLoading(true);
    try {
      const [tripData, locationsData] = await Promise.all([
        api.trips.get(tripId),
        api.locations.list(tripId),
      ]);
      setTrip(tripData);
      setLocations(locationsData);
    } catch (err) {
      if (
        err instanceof Error &&
        "status" in err &&
        (err as any).status === 404
      ) {
        setError("Trip not found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load trip");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} onRetry={fetchData} />
        <Button variant="ghost" onClick={() => router.push("/trips")}>
          &larr; Back to trips
        </Button>
      </div>
    );
  }

  if (!trip) return null;

  const dateDisplay = formatDateRange(trip.start_date, trip.end_date);

  function handleTripUpdated(updated: Trip) {
    setTrip(updated);
    setEditingTrip(false);
  }

  function handleLocationAdded(location: Location) {
    setLocations((prev) => [...prev, location]);
    setAddingLocation(false);
  }

  function handleLocationUpdated(updated: Location) {
    setLocations((prev) =>
      prev.map((loc) => (loc.id === updated.id ? updated : loc))
    );
    setEditingLocationId(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => router.push("/trips")}
        >
          &larr; Back to trips
        </Button>

        {editingTrip ? (
          <EditTripForm
            trip={trip}
            onUpdated={handleTripUpdated}
            onCancel={() => setEditingTrip(false)}
          />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{trip.name}</h1>
              {dateDisplay && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {dateDisplay}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingTrip(true)}
            >
              Edit trip
            </Button>
          </div>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Locations</h2>
          {!addingLocation && locations.length > 0 && (
            <Button size="sm" onClick={() => setAddingLocation(true)}>
              Add location
            </Button>
          )}
        </div>

        {addingLocation && (
          <div className="mb-4">
            <AddLocationForm
              tripId={tripId}
              onAdded={handleLocationAdded}
              onCancel={() => setAddingLocation(false)}
            />
          </div>
        )}

        {locations.length === 0 && !addingLocation ? (
          <EmptyState message="No locations added to this trip yet.">
            <Button onClick={() => setAddingLocation(true)}>
              Add a location
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {locations.map((loc) =>
              editingLocationId === loc.id ? (
                <EditLocationRow
                  key={loc.id}
                  tripId={tripId}
                  location={loc}
                  onUpdated={handleLocationUpdated}
                  onCancel={() => setEditingLocationId(null)}
                />
              ) : (
                <LocationRow
                  key={loc.id}
                  id={loc.id}
                  name={loc.name}
                  address={loc.address}
                  google_link={loc.google_link}
                  note={loc.note}
                  city={loc.city}
                  category={loc.category}
                  requires_booking={loc.requires_booking}
                  working_hours={loc.working_hours}
                  added_by_email={loc.added_by_email}
                  actions={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLocationId(loc.id)}
                    >
                      Edit
                    </Button>
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
