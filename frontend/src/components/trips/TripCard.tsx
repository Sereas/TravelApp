"use client";

import Link from "next/link";
import { Calendar, Trash2 } from "lucide-react";
import { TripGradient } from "@/components/trips/TripGradient";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface TripCardProps {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  imageUrl?: string | null;
  href?: string;
  onClick?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateDisplay(start?: string | null, end?: string | null): string {
  if (!start && !end) return "Dates still open";
  if (start && end) return `${formatDate(start)} \u2014 ${formatDate(end)}`;
  if (start) return `Starts ${formatDate(start)}`;
  return `Ends ${formatDate(end!)}`;
}

export function TripCard({
  id,
  name,
  startDate,
  endDate,
  imageUrl,
  href,
  onClick,
  onDelete,
}: TripCardProps) {
  const dateDisplay = formatDateDisplay(startDate, endDate);
  const hasDates = startDate || endDate;
  const isClickable = !!(href || onClick);

  const content = (
    <>
      {/* Visual area */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            // `sizes` matches the `/trips` grid: 1 col < sm, 2 cols
            // sm–lg, 3 cols at lg+. No sidebar on the trips list page,
            // so each card is roughly 1/N of the viewport minus gutters.
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <TripGradient
            name={name}
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {onDelete && (
          <div
            className="absolute right-2 top-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow-md transition-transform hover:scale-110"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 size={15} />
                </button>
              }
              title="Delete trip?"
              description={`This will permanently delete "${name}" and all its locations. This action cannot be undone.`}
              confirmLabel="Delete trip"
              variant="destructive"
              onConfirm={() => onDelete(id)}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {name}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={12} className="shrink-0" />
          <span className={hasDates ? "" : "italic"}>{dateDisplay}</span>
        </div>
      </div>
    </>
  );

  const classes = `group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200${
    isClickable ? " cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
  }`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <div
      className={classes}
      onClick={() => onClick?.(id)}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(id);
        }
      }}
    >
      {content}
    </div>
  );
}
