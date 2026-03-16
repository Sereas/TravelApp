"use client";

import { Calendar, MapPin } from "lucide-react";

export interface TripCardProps {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
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
  onClick,
}: TripCardProps) {
  const dateDisplay = formatDateDisplay(startDate, endDate);
  const hasDates = startDate || endDate;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-border/60 bg-card transition-all${onClick ? " cursor-pointer hover:shadow-md hover:border-primary/30" : ""}`}
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
      <div className="h-1 w-full bg-gradient-to-r from-primary/80 to-primary/30" />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
              {name}
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={12} className="shrink-0" />
              <span className={hasDates ? "" : "italic"}>{dateDisplay}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
