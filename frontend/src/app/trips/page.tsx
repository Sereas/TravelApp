"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Trip } from "@/lib/api";
import { TripCard } from "@/components/trips";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My Trips</h1>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={fetchTrips} />}

      {!loading && !error && trips.length === 0 && (
        <EmptyState message="You haven't created any trips yet.">
          <Button onClick={() => router.push("/trips/new")}>
            Create your first trip
          </Button>
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
