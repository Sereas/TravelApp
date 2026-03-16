import Link from "next/link";
import { MapPin, Calendar, Route } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
        <MapPin size={32} className="text-primary-foreground" />
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Shtab Travel
      </h1>
      <p className="mt-3 max-w-md text-lg text-muted-foreground">
        Your travel planning headquarters. Collect locations, build day-by-day
        itineraries, and explore with confidence.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="rounded-xl px-8 shadow-md">
          <Link href="/login">Get started</Link>
        </Button>
      </div>

      <div className="mt-16 grid max-w-2xl gap-6 sm:grid-cols-3">
        <div className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin size={20} />
          </div>
          <h3 className="text-sm font-semibold">Save locations</h3>
          <p className="text-xs text-muted-foreground">
            Bookmark places from Google Maps or add your own
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Calendar size={20} />
          </div>
          <h3 className="text-sm font-semibold">Plan your days</h3>
          <p className="text-xs text-muted-foreground">
            Organize locations into a day-by-day itinerary
          </p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/50">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Route size={20} />
          </div>
          <h3 className="text-sm font-semibold">Explore routes</h3>
          <p className="text-xs text-muted-foreground">
            See distances and walking routes between stops
          </p>
        </div>
      </div>
    </div>
  );
}
