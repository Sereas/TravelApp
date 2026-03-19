import Link from "next/link";
import { MapPin, Calendar, Route, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero section */}
      <section className="flex w-full flex-col items-center px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
        <h1 className="max-w-2xl text-center font-serif text-5xl font-bold leading-tight tracking-tight text-content-primary sm:text-6xl md:text-7xl">
          Plan your next <span className="text-brand-green">adventure</span>
        </h1>
        <p className="mt-6 max-w-lg text-center text-lg text-content-muted">
          Collect places, build day-by-day itineraries, and explore your
          destinations with confidence.
        </p>

        <Link
          href="/login"
          className="mt-10 inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand-terracotta px-8 py-3 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-brand-terracotta-dark hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-terracotta focus-visible:ring-offset-2"
        >
          Get started
          <ArrowRight size={18} />
        </Link>
      </section>

      {/* Feature cards */}
      <section className="w-full max-w-4xl px-4 pb-10">
        <div className="grid gap-6 sm:grid-cols-3">
          <div
            className="rounded-xl border border-[#E8E5DD] border-l-brand-green bg-surface-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
            style={{ borderLeftWidth: "3px" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-green-light text-brand-green">
              <MapPin size={18} />
            </div>
            <h3 className="text-base font-semibold text-content-primary">
              Save places
            </h3>
            <p className="mt-1 text-sm text-content-muted">
              Bookmark spots from Google Maps or add your own hidden gems
            </p>
          </div>

          <div
            className="rounded-xl border border-[#E8E5DD] border-l-brand-green bg-surface-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
            style={{ borderLeftWidth: "3px" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-green-light text-brand-green">
              <Calendar size={18} />
            </div>
            <h3 className="text-base font-semibold text-content-primary">
              Plan your days
            </h3>
            <p className="mt-1 text-sm text-content-muted">
              Drag locations into a day-by-day itinerary with time slots
            </p>
          </div>

          <div
            className="rounded-xl border border-[#E8E5DD] border-l-brand-green bg-surface-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md"
            style={{ borderLeftWidth: "3px" }}
          >
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-green-light text-brand-green">
              <Route size={18} />
            </div>
            <h3 className="text-base font-semibold text-content-primary">
              See routes
            </h3>
            <p className="mt-1 text-sm text-content-muted">
              Walking, driving & transit routes between your stops
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
