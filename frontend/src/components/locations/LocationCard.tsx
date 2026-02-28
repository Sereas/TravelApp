import {
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Ticket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_META, type CategoryKey } from "@/lib/location-constants";
import { CategoryIcon } from "./CategoryIcon";

export interface LocationCardProps {
  id: string;
  name: string;
  address?: string | null;
  google_link?: string | null;
  note?: string | null;
  city?: string | null;
  category?: string | null;
  requires_booking?: string | null;
  working_hours?: string | null;
  added_by_email?: string | null;
  actions?: React.ReactNode;
  className?: string;
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category as CategoryKey];
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.bg,
        meta.text
      )}
    >
      <CategoryIcon category={category as CategoryKey} size={12} />
      {category}
    </span>
  );
}

function BookingBadge({ status }: { status: string }) {
  if (status === "no") return null;
  const isBooked = status === "yes_done";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        isBooked ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
      )}
    >
      <Ticket size={12} />
      {isBooked ? "Booked \u2713" : "Booking needed"}
    </span>
  );
}

export function LocationCard({
  name,
  address,
  google_link,
  note,
  city,
  category,
  requires_booking,
  working_hours,
  added_by_email,
  actions,
  className,
}: LocationCardProps) {
  const catMeta = category ? CATEGORY_META[category as CategoryKey] : undefined;
  const hasGeo = city || address;
  const hasDetails =
    working_hours || (requires_booking && requires_booking !== "no");

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3 transition-shadow hover:shadow-sm",
        className
      )}
    >
      {/* Row 1: icon + name + badges + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Category icon circle */}
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              catMeta?.bg ?? "bg-gray-50"
            )}
          >
            {category ? (
              <CategoryIcon category={category as CategoryKey} size={16} />
            ) : (
              <MapPin size={16} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold leading-tight">{name}</span>
              {category && <CategoryBadge category={category} />}
            </div>

            {/* City / address / maps link */}
            {hasGeo && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin
                  size={13}
                  className="shrink-0 text-muted-foreground/70"
                />
                <span className="truncate">
                  {city && address ? `${city} · ${address}` : city || address}
                </span>
                {google_link && (
                  <a
                    href={google_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex shrink-0 items-center gap-0.5 text-primary hover:underline"
                    aria-label="Open in Google Maps"
                  >
                    <ExternalLink size={12} />
                    <span className="text-xs">Maps</span>
                  </a>
                )}
              </p>
            )}

            {/* Google link when no geo context */}
            {!hasGeo && google_link && (
              <p className="mt-0.5 text-sm">
                <a
                  href={google_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  aria-label="Open in Google Maps"
                >
                  <ExternalLink size={12} />
                  Open in Google Maps
                </a>
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>

      {/* Row 2: working hours + booking badge */}
      {hasDetails && (
        <div className="ml-11 mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {working_hours && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Clock size={13} className="text-muted-foreground/70" />
              {working_hours}
            </span>
          )}
          {requires_booking && requires_booking !== "no" && (
            <BookingBadge status={requires_booking} />
          )}
        </div>
      )}

      {/* Row 3: note */}
      {note && (
        <div className="ml-11 mt-1.5 flex items-start gap-1 text-sm text-muted-foreground">
          <MessageSquare
            size={13}
            className="mt-0.5 shrink-0 text-muted-foreground/50"
          />
          <span className="italic">{note}</span>
        </div>
      )}

      {/* Row 4: added by (subtle) */}
      {added_by_email && (
        <p className="ml-11 mt-1 text-xs text-muted-foreground/60">
          Added by {added_by_email}
        </p>
      )}
    </div>
  );
}
