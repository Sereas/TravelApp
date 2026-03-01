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

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5 transition-shadow hover:shadow-sm",
        className
      )}
    >
      {/* Header: icon + name + badges + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              catMeta?.bg ?? "bg-gray-50"
            )}
          >
            {category ? (
              <CategoryIcon category={category as CategoryKey} size={14} />
            ) : (
              <MapPin size={14} className="text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold leading-tight">
                {name}
              </span>
              {category && <CategoryBadge category={category} />}
              {requires_booking && requires_booking !== "no" && (
                <BookingBadge status={requires_booking} />
              )}
            </div>

            {/* Inline metadata row: geo + hours + maps link */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {hasGeo && (
                <span className="inline-flex items-center gap-1">
                  <MapPin
                    size={11}
                    className="shrink-0 text-muted-foreground/70"
                  />
                  <span className="truncate">
                    {city && address ? `${city} · ${address}` : city || address}
                  </span>
                </span>
              )}
              {working_hours && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} className="text-muted-foreground/70" />
                  {working_hours}
                </span>
              )}
              {google_link && (
                <a
                  href={google_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-0.5 text-primary hover:underline"
                  aria-label="Open in Google Maps"
                >
                  <ExternalLink size={11} />
                  Maps
                </a>
              )}
            </div>
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </div>

      {/* Note (compact) */}
      {note && (
        <p className="ml-[2.375rem] mt-1 truncate text-xs italic text-muted-foreground">
          <MessageSquare
            size={11}
            className="mr-1 inline shrink-0 text-muted-foreground/50"
          />
          {note}
        </p>
      )}

      {/* Added by — inline subtle */}
      {added_by_email && (
        <p className="ml-[2.375rem] mt-0.5 truncate text-[11px] text-muted-foreground/50">
          {added_by_email}
        </p>
      )}
    </div>
  );
}
