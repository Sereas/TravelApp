"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type ShareResponse,
  type TripMember,
  type InviteLink,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  Globe,
  Loader2,
  LinkIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

interface ShareTripDialogProps {
  tripId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: string | null;
}

export function ShareTripDialog({
  tripId,
  open,
  onOpenChange,
  userRole,
}: ShareTripDialogProps) {
  const isOwner = userRole === "owner";

  // --- Members state ---
  const [members, setMembers] = useState<TripMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // --- Invite link state (one link at a time) ---
  const [activeLink, setActiveLink] = useState<InviteLink | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // --- Public share state (existing) ---
  const [share, setShare] = useState<ShareResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    setMembersLoading(true);
    try {
      const membersData = await api.members.listMembers(tripId);
      setMembers(membersData);

      if (isOwner) {
        const [invites, shareData] = await Promise.allSettled([
          api.members.listInvitations(tripId),
          api.sharing.getShare(tripId),
        ]);
        if (invites.status === "fulfilled")
          setActiveLink(invites.value[0] ?? null);
        if (shareData.status === "fulfilled") setShare(shareData.value);
      }
    } catch {
      setError("Failed to load sharing info");
    } finally {
      setMembersLoading(false);
    }
  }, [tripId, isOwner]);

  useEffect(() => {
    if (open) {
      fetchAll();
      setLinkCopied(false);
      setShareCopied(false);
    }
  }, [open, fetchAll]);

  // --- Invite link handlers ---
  async function handleCreateLink() {
    setCreatingLink(true);
    setError(null);
    try {
      const link = await api.members.createInvitation(tripId);
      setActiveLink(link);
      setLinkCopied(false);
    } catch {
      setError("Failed to create invite link");
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  }

  async function handleRevokeLink() {
    if (!activeLink) return;
    try {
      await api.members.revokeInvitation(tripId, activeLink.id);
      setActiveLink(null);
    } catch {
      setError("Failed to revoke invite link");
    }
  }

  // --- Member handlers ---
  async function handleRemoveMember(memberId: string) {
    try {
      await api.members.removeMember(tripId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      setError("Failed to remove member");
    }
  }

  // --- Public share handlers (existing) ---
  async function handleEnableShare() {
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

  async function handleRevokeShare() {
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

  async function handleCopyShare() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.share_url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setError("Failed to copy link");
    }
  }

  function getInitial(member: TripMember): string {
    if (member.email) return member.email[0].toUpperCase();
    return "?";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {/* ---- Header ---- */}
        <DialogHeader className="px-6 pb-3 pr-12 pt-6">
          <DialogTitle className="text-lg font-bold tracking-tight">
            Share Trip
          </DialogTitle>
          <DialogDescription>
            Manage who can access and view this trip.
          </DialogDescription>
        </DialogHeader>

        {membersLoading ? (
          <div className="flex justify-center px-6 py-10">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-0">
            {error && (
              <p className="mx-6 mb-3 text-sm text-destructive">{error}</p>
            )}

            {/* ---- Section 1: Members ---- */}
            <div className="px-6 pb-4">
              <h3 className="mb-2 text-[10px] font-bold tracking-wide text-muted-foreground">
                Members
              </h3>
              <div className="space-y-px">
                {members.map((member, idx) => (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2 py-2",
                      "transition-colors hover-hover:hover:bg-muted/50"
                    )}
                    style={
                      {
                        "--stagger": `${idx * 30}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {/* Avatar with ring for depth */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted ring-2 ring-brand/10">
                      <span className="text-xs font-bold leading-none text-brand">
                        {getInitial(member)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {member.email || "Unknown"}
                      </p>
                    </div>
                    {/* Role badge */}
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize leading-tight",
                        member.role === "owner"
                          ? "bg-brand-muted text-brand"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {member.role}
                    </span>
                    {isOwner && member.role !== "owner" && (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 touch-target text-muted-foreground/60 transition-colors hover-hover:hover:text-destructive"
                            aria-label={`Remove ${member.email || "member"}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        }
                        title="Remove member?"
                        description={`${member.email || "This member"} will lose access to this trip.`}
                        confirmLabel="Remove"
                        variant="destructive"
                        onConfirm={() => handleRemoveMember(member.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Divider between members and link sections */}
            {isOwner && <div className="mx-6 border-t border-border/60" />}

            {/* ---- Section 2: Invite Link (owner only) ---- */}
            {isOwner && (
              <div
                className={cn(
                  "mx-3 mt-3 rounded-xl px-4 pb-4 pt-3.5",
                  "border border-brand/10",
                  "bg-brand-muted/30",
                  "grain-overlay"
                )}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand/10">
                    <LinkIcon size={11} className="text-brand" />
                  </div>
                  <h3 className="text-[10px] font-bold tracking-wide text-brand">
                    Invite to collaborate
                  </h3>
                </div>

                {activeLink ? (
                  <>
                    {/* URL display -- ticket-like container */}
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-lg bg-card px-3 py-2",
                        "shadow-sm",
                        "border border-brand/15"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                        {activeLink.invite_url}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-target",
                          "transition-transform duration-150 ease-out active:scale-90",
                          linkCopied
                            ? "text-brand"
                            : "text-muted-foreground hover-hover:hover:bg-brand/5 hover-hover:hover:text-foreground"
                        )}
                        onClick={() => handleCopyLink(activeLink.invite_url)}
                        aria-label="Copy invite link"
                      >
                        <span
                          className={cn(
                            "inline-flex transition-transform duration-150 ease-out",
                            linkCopied && "scale-110"
                          )}
                        >
                          {linkCopied ? (
                            <Check size={14} strokeWidth={2.5} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </span>
                      </button>
                    </div>
                    {/* Meta row -- expiry + revoke integrated */}
                    <div className="mt-2 flex items-center justify-between px-0.5">
                      <p className="text-[11px] text-muted-foreground/80">
                        Expires{" "}
                        {new Date(activeLink.expires_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </p>
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            className="touch-target rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover-hover:hover:text-destructive"
                          >
                            Revoke
                          </button>
                        }
                        title="Revoke invite link?"
                        description="This link will stop working. You can create a new one afterward."
                        confirmLabel="Revoke"
                        variant="destructive"
                        onConfirm={handleRevokeLink}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleCreateLink}
                      disabled={creatingLink}
                    >
                      {creatingLink ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Plus size={14} className="mr-1.5" />
                      )}
                      Create invite link
                    </Button>
                    <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                      Recipients join as editors. Link expires in 7 days.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ---- Section 3: Public view (owner only) ---- */}
            {isOwner && (
              <div className="mx-3 mb-4 mt-2 rounded-xl border border-border/40 bg-muted/30 px-4 pb-4 pt-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted">
                    <Globe size={11} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-[10px] font-bold tracking-wide text-muted-foreground">
                    Public view
                  </h3>
                </div>

                {share ? (
                  <>
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-lg bg-card px-3 py-2",
                        "shadow-sm",
                        "border border-border/60"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                        {share.share_url}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-target",
                          "transition-transform duration-150 ease-out active:scale-90",
                          shareCopied
                            ? "text-brand"
                            : "text-muted-foreground hover-hover:hover:bg-muted hover-hover:hover:text-foreground"
                        )}
                        onClick={handleCopyShare}
                        aria-label="Copy public link"
                      >
                        <span
                          className={cn(
                            "inline-flex transition-transform duration-150 ease-out",
                            shareCopied && "scale-110"
                          )}
                        >
                          {shareCopied ? (
                            <Check size={14} strokeWidth={2.5} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </span>
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between px-0.5">
                      <p className="text-[11px] text-muted-foreground/70">
                        Read-only. No account needed.
                      </p>
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            className="touch-target rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover-hover:hover:text-destructive"
                          >
                            Disable
                          </button>
                        }
                        title="Disable public link?"
                        description="Anyone with this link will lose access. You can re-enable it later."
                        confirmLabel="Disable"
                        variant="destructive"
                        onConfirm={handleRevokeShare}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground/70">
                      Let anyone view this trip without an account.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleEnableShare}
                      disabled={toggling}
                    >
                      {toggling ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Globe size={14} className="mr-1.5" />
                      )}
                      Enable public link
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Bottom breathing room when not owner (no link sections) */}
            {!isOwner && <div className="h-2" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
