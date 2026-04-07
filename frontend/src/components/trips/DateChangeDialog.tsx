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
import { cn } from "@/lib/utils";
import type { ItineraryDay } from "@/lib/api";
import { MapPin } from "lucide-react";

export type DateChangeAction = "shift" | "clear_dates" | "delete" | "per_day";

export interface DateChangeResult {
  action: DateChangeAction;
  offsetDays?: number;
  dayIds?: string[];
  deleteDayIds?: string[];
  keepDayIds?: string[];
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

function fmtShortDate(iso: string): string {
  return format(parseISO(iso), "EEE, MMM d");
}

function dayHasContent(day: ItineraryDay): boolean {
  return day.options.some((opt) => opt.locations.length > 0);
}

function getDayStopCount(day: ItineraryDay): number {
  return day.options.reduce((sum, opt) => sum + opt.locations.length, 0);
}

function getDayCity(day: ItineraryDay): string | null {
  for (const opt of day.options) {
    if (opt.starting_city) return opt.starting_city;
    for (const loc of opt.locations) {
      if (loc.location.city) return loc.location.city;
    }
  }
  return null;
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
  const [loading, setLoading] = useState<string | null>(null);

  // Per-day decisions: days with content default to "keep", empty to "delete"
  const [decisions, setDecisions] = useState<Record<string, "keep" | "delete">>(
    () => {
      const initial: Record<string, "keep" | "delete"> = {};
      for (const day of orphanedDays) {
        initial[day.id] = dayHasContent(day) ? "keep" : "delete";
      }
      return initial;
    }
  );

  const contentDays = orphanedDays.filter(dayHasContent);
  const emptyDays = orphanedDays.filter((d) => !dayHasContent(d));
  const keepCount = Object.values(decisions).filter((d) => d === "keep").length;
  const deleteCount = Object.values(decisions).filter(
    (d) => d === "delete"
  ).length;

  function toggleDay(dayId: string) {
    setDecisions((prev) => ({
      ...prev,
      [dayId]: prev[dayId] === "keep" ? "delete" : "keep",
    }));
  }

  function setAll(decision: "keep" | "delete") {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) next[id] = decision;
      return next;
    });
  }

  async function handleShift() {
    setLoading("shift");
    try {
      await onConfirm({ action: "shift", offsetDays });
      onClose();
    } catch {
      // keep dialog open
    } finally {
      setLoading(null);
    }
  }

  async function handleConfirm() {
    setLoading("confirm");
    try {
      const deleteDayIds = Object.entries(decisions)
        .filter(([, d]) => d === "delete")
        .map(([id]) => id);
      const keepDayIds = Object.entries(decisions)
        .filter(([, d]) => d === "keep")
        .map(([id]) => id);

      await onConfirm({
        action: "per_day",
        deleteDayIds,
        keepDayIds,
      });
      onClose();
    } catch {
      // keep dialog open
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Some planned days fall outside the new dates
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Your trip is changing from{" "}
                <strong className="font-medium text-foreground">
                  {fmtDate(oldStart)}
                </strong>
                {" \u2013 "}
                <strong className="font-medium text-foreground">
                  {fmtDate(oldEnd)}
                </strong>
                {" to "}
                <strong className="font-medium text-foreground">
                  {fmtDate(newStart)}
                </strong>
                {" \u2013 "}
                <strong className="font-medium text-foreground">
                  {fmtDate(newEnd)}
                </strong>
                .
              </p>
              <p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {contentDays.length} with stops
                </span>
                {emptyDays.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {emptyDays.length} empty
                  </span>
                )}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Shift option */}
        {canShift && (
          <Button
            className="w-full justify-start"
            variant="outline"
            disabled={loading !== null}
            onClick={handleShift}
          >
            {loading === "shift"
              ? "Shifting..."
              : `Shift all days by ${offsetDays > 0 ? "+" : ""}${offsetDays} day${Math.abs(offsetDays) !== 1 ? "s" : ""}`}
          </Button>
        )}

        {/* Per-day list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Affected days
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setAll("keep")}
                className="rounded-full border border-brand/20 bg-brand/5 px-2.5 py-0.5 text-[10px] font-semibold text-brand transition-colors hover:bg-brand/10"
              >
                Keep all
              </button>
              <button
                type="button"
                onClick={() => setAll("delete")}
                className="rounded-full border border-destructive/20 bg-destructive/5 px-2.5 py-0.5 text-[10px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                Delete all
              </button>
            </div>
          </div>

          <div className="max-h-[260px] space-y-1.5 overflow-y-auto rounded-xl border border-border/40 bg-muted/30 p-2">
            {orphanedDays
              .filter((d) => d.date)
              .sort((a, b) => a.date!.localeCompare(b.date!))
              .map((day) => {
                const hasContent = dayHasContent(day);
                const stops = getDayStopCount(day);
                const city = getDayCity(day);
                const isKeep = decisions[day.id] === "keep";

                return (
                  <div
                    key={day.id}
                    className="flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {fmtShortDate(day.date!)}
                        </span>
                        {city && (
                          <>
                            <span className="text-muted-foreground/30">·</span>
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin size={10} className="shrink-0" />
                              {city}
                            </span>
                          </>
                        )}
                      </div>
                      {hasContent ? (
                        <span className="text-xs text-muted-foreground">
                          {stops} stop{stops !== 1 && "s"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          Empty
                        </span>
                      )}
                    </div>
                    {/* Two-button segmented toggle — user clicks the action they want */}
                    <div className="flex shrink-0 overflow-hidden rounded-full border border-border/50 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((p) => ({ ...p, [day.id]: "keep" }))
                        }
                        className={cn(
                          "px-2.5 py-1 transition-colors",
                          isKeep
                            ? "bg-brand text-white"
                            : "bg-transparent text-muted-foreground hover:bg-muted"
                        )}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((p) => ({ ...p, [day.id]: "delete" }))
                        }
                        className={cn(
                          "px-2.5 py-1 transition-colors",
                          !isKeep
                            ? "bg-destructive text-white"
                            : "bg-transparent text-muted-foreground hover:bg-muted"
                        )}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {keepCount > 0 && (
              <span className="text-brand">{keepCount} keep</span>
            )}
            {keepCount > 0 && deleteCount > 0 && " · "}
            {deleteCount > 0 && (
              <span className="text-destructive">{deleteCount} delete</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={loading !== null}
            >
              {loading === "confirm" ? "Saving..." : "Confirm"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
