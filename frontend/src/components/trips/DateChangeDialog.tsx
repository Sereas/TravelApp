"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ItineraryDay } from "@/lib/api";

export type DateChangeAction = "shift" | "clear_dates" | "delete";

export interface DateChangeResult {
  action: DateChangeAction;
  offsetDays?: number;
  dayIds?: string[];
}

interface DateChangeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: DateChangeResult) => Promise<void>;
  orphanedDays: ItineraryDay[];
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
  canShift: boolean;
  offsetDays: number;
}

function fmtDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

export function DateChangeDialog({
  open,
  onClose,
  onConfirm,
  orphanedDays,
  oldStart,
  oldEnd,
  newStart,
  newEnd,
  canShift,
  offsetDays,
}: DateChangeDialogProps) {
  const [loading, setLoading] = useState<DateChangeAction | null>(null);

  const orphanedDates = orphanedDays
    .filter((d) => d.date)
    .map((d) => fmtDate(d.date!));

  async function handleAction(action: DateChangeAction) {
    setLoading(action);
    try {
      const result: DateChangeResult = { action };
      if (action === "shift") {
        result.offsetDays = offsetDays;
      } else {
        result.dayIds = orphanedDays.map((d) => d.id);
      }
      await onConfirm(result);
      onClose();
    } catch {
      // keep dialog open on error
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trip dates changing</DialogTitle>
          <DialogDescription>
            Dates are moving from {fmtDate(oldStart)}&ndash;{fmtDate(oldEnd)} to{" "}
            {fmtDate(newStart)}&ndash;{fmtDate(newEnd)}. {orphanedDays.length}{" "}
            day{orphanedDays.length !== 1 && "s"} will be outside the new range
            {orphanedDates.length > 0 && <>: {orphanedDates.join(", ")}</>}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {canShift && (
            <Button
              className="w-full justify-start"
              variant="outline"
              disabled={loading !== null}
              onClick={() => handleAction("shift")}
            >
              {loading === "shift"
                ? "Shifting..."
                : `Shift all days by ${offsetDays > 0 ? "+" : ""}${offsetDays} day${Math.abs(offsetDays) !== 1 ? "s" : ""}`}
            </Button>
          )}
          <Button
            className="w-full justify-start"
            variant="outline"
            disabled={loading !== null}
            onClick={() => handleAction("clear_dates")}
          >
            {loading === "clear_dates"
              ? "Removing dates..."
              : "Keep days with itineraries, remove empty ones"}
          </Button>
          <Button
            className="w-full justify-start"
            variant="outline"
            disabled={loading !== null}
            onClick={() => handleAction("delete")}
          >
            {loading === "delete"
              ? "Deleting..."
              : "Delete affected days and their itineraries"}
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading !== null}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
