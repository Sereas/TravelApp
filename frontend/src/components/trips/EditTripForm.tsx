"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, type Trip } from "@/lib/api";

export interface TripUpdatePayload {
  name: string;
  start_date: string | null;
  end_date: string | null;
}

interface EditTripFormProps {
  trip: Trip;
  onUpdated: (trip: Trip) => void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
  /**
   * Called before saving when dates change. If provided, the form
   * delegates saving to the parent so reconciliation can happen first.
   * The callback should call api.trips.update itself and return the result.
   */
  onBeforeSave?: (payload: TripUpdatePayload) => Promise<Trip>;
}

function toDate(s: string | null | undefined): Date | undefined {
  return s ? parseISO(s) : undefined;
}

function toISODate(d: Date | undefined): string | null {
  return d ? format(d, "yyyy-MM-dd") : null;
}

export function EditTripForm({
  trip,
  onUpdated,
  onCancel,
  onDelete,
  onBeforeSave,
}: EditTripFormProps) {
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

    const payload: TripUpdatePayload = {
      name,
      start_date: toISODate(startDate),
      end_date: toISODate(endDate),
    };

    try {
      const datesChanged =
        payload.start_date !== (trip.start_date ?? null) ||
        payload.end_date !== (trip.end_date ?? null);

      let updated: Trip;
      if (datesChanged && onBeforeSave) {
        updated = await onBeforeSave(payload);
      } else {
        updated = await api.trips.update(trip.id, payload);
      }
      onUpdated(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update trip";
      if (msg !== "Cancelled") {
        setError(msg);
      }
      setSaving(false);
    }
  }

  const inputClass =
    "h-8 w-full rounded-lg border border-warm-border bg-surface-card px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-green";
  const labelClass = "text-xs font-medium text-content-muted";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>Edit Trip</DialogTitle>
          <DialogDescription className="sr-only">
            Edit trip details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="px-5 pt-1">
              <ErrorBanner message={error} />
            </div>
          )}

          <div className="space-y-2.5 px-5 pt-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-trip-name" className={labelClass}>
                Trip name
              </Label>
              <input
                id="edit-trip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                autoComplete="off"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className={labelClass}>Start date</Label>
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
              <div className="flex flex-col gap-1">
                <Label className={labelClass}>End date</Label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="End date"
                  fromDate={startDate}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center border-t border-warm-border px-5 py-3">
            {onDelete && (
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive transition-colors hover:text-destructive/80"
                    aria-label="Delete trip"
                  >
                    <Trash2 size={13} />
                    Delete trip
                  </button>
                }
                title="Delete trip?"
                description="This will permanently delete this trip and all its locations. This action cannot be undone."
                confirmLabel="Delete trip"
                variant="destructive"
                onConfirm={onDelete}
              />
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                className="rounded-full px-4 text-content-muted"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                size="sm"
                className="rounded-full bg-brand-terracotta px-5 font-semibold text-white hover:bg-brand-terracotta-dark"
              >
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
