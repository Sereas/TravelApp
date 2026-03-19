"use client";

import { Calendar, Compass, Map, Mountain } from "lucide-react";

export interface TripCardProps {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  imageUrl?: string | null;
  onClick?: (id: string) => void;
}

const PLACEHOLDER_ICONS = [Compass, Map, Mountain] as const;

function getPlaceholderIcon(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return PLACEHOLDER_ICONS[Math.abs(hash) % PLACEHOLDER_ICONS.length];
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
  onClick,
}: TripCardProps) {
  const dateDisplay = formatDateDisplay(startDate, endDate);
  const hasDates = startDate || endDate;
  const PlaceholderIcon = getPlaceholderIcon(id);

  return (
    <div
      className={`group overflow-hidden rounded-xl border border-[#E8E5DD] bg-surface-card shadow-sm transition-all duration-200${
        onClick ? " cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
      }`}
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
      {/* Image area */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-green-light to-surface-page">
            <PlaceholderIcon
              size={40}
              className="text-brand-green opacity-20"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-content-primary">
          {name}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-content-muted">
          <Calendar size={12} className="shrink-0" />
          <span className={hasDates ? "" : "italic"}>{dateDisplay}</span>
        </div>
      </div>
    </div>
  );
}
