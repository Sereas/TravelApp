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

function formatDateRange(
  start?: string | null,
  end?: string | null
): string | null {
  if (!start && !end) return null;
  if (start && end) return `${start} — ${end}`;
  return start ?? end ?? null;
}

export function TripCard({
  id,
  name,
  startDate,
  endDate,
  onClick,
}: TripCardProps) {
  const dateRange = formatDateRange(startDate, endDate);

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
        {dateRange && (
          <CardDescription className="text-sm">{dateRange}</CardDescription>
        )}
      </CardHeader>
    </Card>
  );
}
