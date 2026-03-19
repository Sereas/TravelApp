"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, ArrowRight } from "lucide-react";
import { api, type Trip } from "@/lib/api";
import { TripCard, CreateTripDialog } from "@/components/trips";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { Button } from "@/components/ui/button";

type TripFilter = "all" | "upcoming" | "past";

const FILTERS: { value: TripFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

function isUpcoming(trip: Trip): boolean {
  if (!trip.end_date) return true;
  const end = new Date(trip.end_date + "T23:59:59");
  return end >= new Date();
}

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TripFilter>("all");

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

  const filteredTrips = useMemo(() => {
    if (filter === "all") return trips;
    if (filter === "upcoming") return trips.filter(isUpcoming);
    return trips.filter((t) => !isUpcoming(t));
  }, [trips, filter]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-content-primary">
            My Trips
          </h1>
          {!loading && trips.length > 0 && (
            <p className="mt-0.5 text-sm text-content-muted">
              {trips.length} trip{trips.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {!loading && trips.length > 0 && (
          <CreateTripDialog
            trigger={
              <Button className="cursor-pointer rounded-full bg-brand-terracotta px-6 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-terracotta-dark hover:shadow-md">
                New trip
              </Button>
            }
            onCreated={handleTripCreated}
          />
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Error */}
      {error && <ErrorBanner message={error} onRetry={fetchTrips} />}

      {/* Empty state */}
      {!loading && !error && trips.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-full max-w-md rounded-xl border border-[#E8E5DD] bg-surface-card px-8 py-12 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green-light">
              <Compass size={32} className="text-brand-green opacity-40" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-content-primary">
              Plan your first{" "}
              <span className="text-brand-green">adventure</span>
            </h2>
            <p className="mt-3 text-sm text-content-muted">
              Where are you heading next? Create a trip to start building your
              itinerary.
            </p>
            <div className="mt-6">
              <CreateTripDialog
                trigger={
                  <Button className="cursor-pointer rounded-full bg-brand-terracotta px-8 py-2.5 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-terracotta-dark hover:shadow-md">
                    Create your first trip
                    <ArrowRight size={16} className="ml-1.5" />
                  </Button>
                }
                onCreated={handleTripCreated}
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs + Trip grid */}
      {!loading && !error && trips.length > 0 && (
        <>
          {/* Pill filter tabs */}
          <div className="flex gap-2" role="tablist" aria-label="Trip filters">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 ${
                  filter === value
                    ? "bg-brand-green text-white shadow-sm"
                    : "text-content-muted hover:bg-brand-green-light hover:text-brand-green"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredTrips.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTrips.map((trip) => (
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
          ) : (
            <p className="py-8 text-center text-sm text-content-muted">
              No {filter} trips yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
