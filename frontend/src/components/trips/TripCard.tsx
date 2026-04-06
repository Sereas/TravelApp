"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { TripGradient } from "@/components/trips/TripGradient";

export interface TripCardProps {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  imageUrl?: string | null;
  href?: string;
  onClick?: (id: string) => void;
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
          />
        ) : (
          <TripGradient
            name={name}
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          />
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
