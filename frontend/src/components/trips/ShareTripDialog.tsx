"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ShareResponse } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, Globe, Loader2, LinkIcon, X } from "lucide-react";

interface ShareTripDialogProps {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareTripDialog({
  tripId,
  open,
  onOpenChange,
}: ShareTripDialogProps) {
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.sharing.getShare(tripId);
      setShare(result);
    } catch {
      setError("Failed to load share status");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (open) {
      fetchShare();
      setCopied(false);
    }
  }, [open, fetchShare]);

  async function handleEnable() {
    setToggling(true);
    setError(null);
    try {
      const result = await api.sharing.createShare(tripId);
      setShare(result);
    } catch {
      setError("Failed to enable sharing");
    } finally {
      setToggling(false);
    }
  }

  async function handleRevoke() {
    setToggling(true);
    setError(null);
    try {
      await api.sharing.revokeShare(tripId);
      setShare(null);
    } catch {
      setError("Failed to disable sharing");
    } finally {
      setToggling(false);
    }
  }

  async function handleCopy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe size={18} />
            Share Trip
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-0 space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {share ? (
              <>
                <div className="min-w-0 space-y-2">
                  <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
                    <LinkIcon
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {share.share_url}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check size={14} className="text-green-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anyone with this link can view your trip (read-only). They
                    don&apos;t need an account.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                  <span className="text-sm text-muted-foreground">
                    Link sharing is{" "}
                    <span className="font-medium text-green-600">enabled</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleRevoke}
                    disabled={toggling}
                  >
                    {toggling ? (
                      <Loader2 size={14} className="mr-1.5 animate-spin" />
                    ) : (
                      <X size={14} className="mr-1.5" />
                    )}
                    Disable
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Create a shareable link so anyone can view this trip without
                  needing an account.
                </p>
                <Button
                  onClick={handleEnable}
                  disabled={toggling}
                  className="w-full"
                >
                  {toggling ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <Globe size={14} className="mr-1.5" />
                  )}
                  Enable Link Sharing
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
