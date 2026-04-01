"use client";

import { useRef, useState } from "react";
import { api, type ImportSSEEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Info,
  List,
  Loader2,
  MapPin,
  SkipForward,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LocationSummary = {
  name: string;
  status: string;
  detail: string | null;
};

type ImportResult = {
  imported_count: number;
  existing_count: number;
  failed_count: number;
  imported: LocationSummary[];
  existing: LocationSummary[];
  failed: LocationSummary[];
};

type Phase = "input" | "scraping" | "enriching" | "saving" | "result" | "error";

interface ImportGoogleListDialogProps {
  tripId: string;
  trigger: React.ReactNode;
  onImported?: () => void;
}

export function ImportGoogleListDialog({
  tripId,
  trigger,
  onImported,
}: ImportGoogleListDialogProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [currentPlace, setCurrentPlace] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  function reset() {
    setUrl("");
    setPhase("input");
    setResult(null);
    setErrorMessage("");
    setProgress({ current: 0, total: 0 });
    setCurrentPlace("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Abort any in-flight import when closing the dialog
      abortRef.current?.abort();
      abortRef.current = null;
      if (phase === "result" && result && result.imported_count > 0) {
        onImported?.();
      }
      setTimeout(reset, 200);
    }
    setOpen(next);
  }

  function handleClose() {
    if (phase === "result" && result && result.imported_count > 0) {
      onImported?.();
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setTimeout(reset, 200);
  }

  function handleSSEEvent(event: ImportSSEEvent) {
    switch (event.event) {
      case "scraping":
        setPhase("scraping");
        break;
      case "scraping_done":
        setPhase("enriching");
        setProgress({ current: 0, total: event.total });
        break;
      case "enriching":
        setProgress({ current: event.current, total: event.total });
        setCurrentPlace(event.name);
        break;
      case "saving":
        setPhase("saving");
        break;
      case "complete":
        setResult({
          imported_count: event.imported_count,
          existing_count: event.existing_count,
          failed_count: event.failed_count,
          imported: event.imported,
          existing: event.existing,
          failed: event.failed,
        });
        setPhase("result");
        break;
      case "error":
        setErrorMessage(event.message);
        setPhase("error");
        break;
    }
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;

    const abortController = new AbortController();
    abortRef.current = abortController;
    setPhase("scraping");

    try {
      await api.locations.importGoogleListStream(
        tripId,
        { google_list_url: trimmed },
        handleSSEEvent,
        abortController.signal
      );
    } catch (err) {
      if (abortController.signal.aborted) return;
      const msg =
        err instanceof Error ? err.message : "Import failed unexpectedly";
      setErrorMessage(msg);
      setPhase("error");
    }
  }

  const isValidUrl =
    url.trim().length > 0 &&
    (url.includes("google.com/maps") ||
      url.includes("maps.app.goo.gl") ||
      url.includes("goo.gl/maps"));

  const isStreaming =
    phase === "scraping" || phase === "enriching" || phase === "saving";

  const percent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List size={18} className="text-brand" />
            Import from Google Maps List
          </DialogTitle>
          <DialogDescription>
            Paste a shared Google Maps list link to bulk-add all its places.
          </DialogDescription>
        </DialogHeader>

        {/* INPUT PHASE */}
        {phase === "input" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="google-list-url"
                className="text-sm font-medium text-foreground"
              >
                Google Maps list URL
              </label>
              <input
                id="google-list-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValidUrl) handleImport();
                }}
                placeholder="https://maps.app.goo.gl/..."
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                autoFocus
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info size={12} className="mt-0.5 shrink-0" />
                Open your Google Maps saved list, tap Share, and paste the link
                here. Works with lists of up to 100+ places.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!isValidUrl}
                onClick={handleImport}
                className="gap-1.5"
              >
                <MapPin size={14} />
                Import places
              </Button>
            </div>
          </div>
        )}

        {/* SCRAPING PHASE — shimmer animation */}
        {phase === "scraping" && (
          <div className="flex flex-col items-center gap-5 py-8">
            <div className="relative">
              <Globe size={36} className="animate-pulse text-brand" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Exploring the list...
              </p>
              <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">
                Having a look at the places and figuring out what&apos;s inside
              </p>
            </div>
            {/* Shimmer bar */}
            <div className="relative h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div className="absolute inset-0 h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-brand/40" />
            </div>
          </div>
        )}

        {/* ENRICHING PHASE — progress bar */}
        {phase === "enriching" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Resolving places...</span>
                <span className="tabular-nums font-medium">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <Progress value={percent} />
            </div>
            {currentPlace && (
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <MapPin size={14} className="shrink-0 text-brand" />
                <span className="min-w-0 truncate text-sm text-foreground">
                  {currentPlace}
                </span>
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Discovering details for each place — this takes a moment
            </p>
          </div>
        )}

        {/* SAVING PHASE */}
        {phase === "saving" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={28} className="animate-spin text-brand" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Almost there!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Saving your places and fetching photos...
              </p>
            </div>
            <Progress value={100} className="max-w-xs" />
          </div>
        )}

        {/* ERROR PHASE */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-destructive"
                />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Import failed
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {errorMessage}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button size="sm" onClick={reset}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* RESULT PHASE */}
        {phase === "result" && result && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {result.imported_count > 0 && (
                <div className="flex-1 rounded-lg border border-brand/20 bg-brand/5 p-3 text-center">
                  <div className="text-2xl font-bold text-brand">
                    {result.imported_count}
                  </div>
                  <div className="text-xs text-muted-foreground">imported</div>
                </div>
              )}
              {result.existing_count > 0 && (
                <div className="flex-1 rounded-lg border border-border bg-muted/30 p-3 text-center">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {result.existing_count}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    already existed
                  </div>
                </div>
              )}
              {result.failed_count > 0 && (
                <div className="flex-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
                  <div className="text-2xl font-bold text-destructive">
                    {result.failed_count}
                  </div>
                  <div className="text-xs text-muted-foreground">failed</div>
                </div>
              )}
            </div>

            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {result.imported.length > 0 && (
                <ResultSection
                  title="Imported"
                  items={result.imported}
                  icon={
                    <CheckCircle2 size={13} className="text-brand shrink-0" />
                  }
                  itemClass="text-foreground"
                />
              )}
              {result.existing.length > 0 && (
                <ResultSection
                  title="Already in trip"
                  items={result.existing}
                  icon={
                    <SkipForward
                      size={13}
                      className="shrink-0 text-muted-foreground"
                    />
                  }
                  itemClass="text-muted-foreground"
                />
              )}
              {result.failed.length > 0 && (
                <ResultSection
                  title="Failed"
                  items={result.failed}
                  icon={
                    <XCircle
                      size={13}
                      className="shrink-0 text-destructive/70"
                    />
                  }
                  itemClass="text-muted-foreground"
                />
              )}
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultSection({
  title,
  items,
  icon,
  itemClass,
}: {
  title: string;
  items: LocationSummary[];
  icon: React.ReactNode;
  itemClass: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">
        {title} ({items.length})
      </div>
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <div
            key={`${item.name}-${i}`}
            className="flex items-start gap-2 rounded px-2 py-1 text-xs"
          >
            {icon}
            <span className={cn("min-w-0 flex-1", itemClass)}>{item.name}</span>
            {item.detail && (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {item.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
