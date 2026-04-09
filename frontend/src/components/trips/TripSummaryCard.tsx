"use client";

import type { Location } from "@/lib/api";
import { DollarSign, Hotel, Users } from "lucide-react";

interface TripSummaryCardProps {
  locations: Location[];
  addedByEmails: Set<string>;
}

export function TripSummaryCard({
  locations,
  addedByEmails,
}: TripSummaryCardProps) {
  const bookable = locations.filter(
    (l) => l.requires_booking === "yes" || l.requires_booking === "yes_done"
  );
  const booked = locations.filter(
    (l) => l.requires_booking === "yes_done"
  ).length;

  const emails = Array.from(addedByEmails);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-bold tracking-tight text-foreground">
        Trip Summary
      </h3>

      <div className="mt-5 space-y-5">
        {/* Estimated Budget */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Estimated Budget
            </p>
            <p className="text-base font-bold text-foreground">&mdash;</p>
          </div>
        </div>

        {/* Stays Booked */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Hotel size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Stays Booked
            </p>
            <p className="text-base font-bold text-foreground">
              {bookable.length > 0
                ? `${booked} / ${bookable.length} Booked`
                : "No bookings needed"}
            </p>
          </div>
        </div>

        {/* Travelers */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Users size={18} className="text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Travelers
            </p>
            <div className="mt-1 flex -space-x-1.5">
              {emails.slice(0, 3).map((email) => (
                <div
                  key={email}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold uppercase text-brand ring-2 ring-card"
                  title={email}
                >
                  {email[0]}
                </div>
              ))}
              {emails.length > 3 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">
                  +{emails.length - 3}
                </div>
              )}
              {emails.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  No travelers yet
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
