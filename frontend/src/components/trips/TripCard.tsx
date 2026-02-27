"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

function formatDateDisplay(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
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

  return (
    <Card
      className={
        onClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""
      }
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
      <CardHeader className="p-4">
        <CardTitle className="text-base">{name}</CardTitle>
        {dateDisplay && (
          <CardDescription className="text-sm">{dateDisplay}</CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
