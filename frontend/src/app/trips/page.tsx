"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Trip } from "@/lib/api";
import { TripCard, CreateTripDialog } from "@/components/trips";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { Button } from "@/components/ui/button";

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchTrips() {
    setError(null);
    setLoading(true);
    try {
      const data = await api.trips.list();
      setTrips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTrips();
  }, []);

  function handleTripCreated(trip: Trip) {
    setTrips((prev) => [trip, ...prev]);
  }

  const createButton = (
    <CreateTripDialog
      trigger={<Button className="rounded-xl px-6 shadow-md">New trip</Button>}
      onCreated={handleTripCreated}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Trips</h1>
          {!loading && trips.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {trips.length} trip{trips.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {!loading && trips.length > 0 && createButton}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchTrips} />}

      {!loading && !error && trips.length === 0 && (
        <EmptyState message="You haven't created any trips yet.">
          <CreateTripDialog
            trigger={<Button>Create your first trip</Button>}
            onCreated={handleTripCreated}
          />
        </EmptyState>
      )}

      {!loading && !error && trips.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              id={trip.id}
              name={trip.name}
              startDate={trip.start_date}
              endDate={trip.end_date}
              onClick={(id) => router.push(`/trips/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
