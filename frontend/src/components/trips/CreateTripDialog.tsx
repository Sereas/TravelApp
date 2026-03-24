"use client";

import { useMemo, useState } from "react";
import { differenceInDays } from "date-fns/differenceInDays";
import { format } from "date-fns";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Trip } from "@/lib/api";

interface CreateTripDialogProps {
  trigger: React.ReactNode;
  onCreated: (trip: Trip) => void;
}

export function CreateTripDialog({
  trigger,
  onCreated,
}: CreateTripDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setName("");
    setStartDate(undefined);
    setEndDate(undefined);
    setError(null);
    setLoading(false);
  }

  function toISODate(date: Date | undefined): string | null {
    return date ? format(date, "yyyy-MM-dd") : null;
  }

  const tripDuration = useMemo(() => {
    if (!startDate || !endDate) return null;
    const days = differenceInDays(endDate, startDate) + 1;
    if (days < 1) return null;
    return days === 1 ? "1 day" : `${days} days`;
  }, [startDate, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const trip = await api.trips.create({
        name,
        start_date: toISODate(startDate),
        end_date: toISODate(endDate),
      });
      onCreated(trip);
      setOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        {/* Illustrated banner */}
        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-brand-muted via-border to-primary/15">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/80 shadow-sm backdrop-blur-sm">
            <Image
              src="/logo.svg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
            />
          </div>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-4">
          <DialogHeader>
            <DialogTitle className="text-center">Create a new trip</DialogTitle>
            <DialogDescription className="text-center">
              Give your trip a name and optional dates.
            </DialogDescription>
          </DialogHeader>

          {error && <ErrorBanner message={error} />}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trip-name" className="text-foreground">
                Trip name
              </Label>
              <Input
                id="trip-name"
                placeholder="e.g. Paris Summer 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="rounded-lg border-border bg-card focus-visible:ring-brand"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Start date</Label>
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
                <Label className="text-foreground">End date</Label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="End date"
                  fromDate={startDate}
                />
              </div>
            </div>

            {tripDuration && (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand">
                  {tripDuration}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-full px-5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-brand-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="cursor-pointer rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating…" : "Create trip"}
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
