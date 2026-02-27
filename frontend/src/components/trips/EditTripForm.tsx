"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Trip } from "@/lib/api";

interface EditTripFormProps {
  trip: Trip;
  onUpdated: (trip: Trip) => void;
  onCancel: () => void;
}

function toDate(s: string | null | undefined): Date | undefined {
  return s ? parseISO(s) : undefined;
}

function toISODate(d: Date | undefined): string | null {
  return d ? format(d, "yyyy-MM-dd") : null;
}

export function EditTripForm({ trip, onUpdated, onCancel }: EditTripFormProps) {
  const [name, setName] = useState(trip.name);
  const [startDate, setStartDate] = useState<Date | undefined>(
    toDate(trip.start_date)
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    toDate(trip.end_date)
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const updated = await api.trips.update(trip.id, {
        name,
        start_date: toISODate(startDate),
        end_date: toISODate(endDate),
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update trip");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <ErrorBanner message={error} />}

      <div className="space-y-2">
        <Label htmlFor="edit-trip-name">Trip name</Label>
        <Input
          id="edit-trip-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start date</Label>
          <DatePicker
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              if (endDate && date && endDate < date) {
                setEndDate(undefined);
              }
            }}
            placeholder="Start date"
          />
        </div>
        <div className="space-y-2">
          <Label>End date</Label>
          <DatePicker
            value={endDate}
            onChange={setEndDate}
            placeholder="End date"
            fromDate={startDate}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
