import { cn } from "@/lib/utils";

const REQUIRES_BOOKING_LABELS: Record<string, string> = {
  no: "No",
  yes: "Yes",
  yes_done: "Yes (done)",
};

export interface LocationRowProps {
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

export function LocationRow({
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
}: LocationRowProps) {
  const meta: string[] = [];
  if (city) meta.push(city);
  if (category) meta.push(category);
  if (requires_booking && REQUIRES_BOOKING_LABELS[requires_booking]) {
    meta.push(REQUIRES_BOOKING_LABELS[requires_booking]);
  }
  if (working_hours) meta.push(working_hours);
  const metaStr = meta.length > 0 ? meta.join(" · ") : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        {metaStr && (
          <p className="truncate text-sm text-muted-foreground">{metaStr}</p>
        )}
        {address && (
          <p className="truncate text-sm text-muted-foreground">{address}</p>
        )}
        {google_link && (
          <a
            href={google_link}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm text-primary underline hover:no-underline"
          >
            Open in Google Maps
          </a>
        )}
        {note && (
          <p className="truncate text-sm text-muted-foreground">{note}</p>
        )}
        {added_by_email && (
          <p className="truncate text-xs text-muted-foreground">
            Added by {added_by_email}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
