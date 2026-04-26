"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type InvitePreview } from "@/lib/api";
import { createBrowserClient } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

type PageState =
  | { kind: "loading" }
  | { kind: "active"; preview: InvitePreview }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    async function load() {
      try {
        const preview = await api.members.getInvitePreview(token);

        if (preview.status !== "active") {
          setState({ kind: preview.status as "expired" | "revoked" });
          return;
        }

        // If authenticated, auto-accept and redirect to the trip
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          try {
            const result = await api.members.acceptInvitation(token);
            router.replace(`/trips/${result.trip_id}`);
            return;
          } catch (acceptErr) {
            if (acceptErr instanceof Error && "status" in acceptErr) {
              const s = (acceptErr as { status: number }).status;
              if (s === 410) {
                setState({ kind: "expired" });
                return;
              }
            }
            // Other errors (e.g. network) — fall through to show invite card
          }
        }

        // Not authenticated — show sign-up / login prompt
        setState({ kind: "active", preview });
      } catch (err) {
        if (err instanceof Error && "status" in err) {
          const status = (err as { status: number }).status;
          if (status === 404) {
            setState({ kind: "not_found" });
            return;
          }
        }
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    }

    load();
  }, [token, router]);

  function handleLogin() {
    router.push(`/login?redirect=/invite/${token}`);
  }

  function handleSignup() {
    router.push(`/login?redirect=/invite/${token}&tab=signup`);
  }

  // --- Render ---

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card px-8 py-12 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-muted">
          <Compass size={32} className="text-brand opacity-40" />
        </div>

        {state.kind === "active" && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              You&apos;re invited to plan a trip!
            </h1>
            <p className="mt-4 text-lg font-semibold text-foreground">
              &ldquo;{state.preview.trip_name}&rdquo;
            </p>

            <div className="mt-8 space-y-3">
              <Button
                onClick={handleSignup}
                className="w-full cursor-pointer rounded-full bg-primary px-8 py-2.5 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md"
              >
                Sign up to join
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={handleLogin}
                  className="cursor-pointer font-medium text-brand underline underline-offset-4 transition-colors hover:text-brand-strong"
                >
                  Log in
                </button>
              </p>
            </div>
          </>
        )}

        {state.kind === "expired" && (
          <>
            <h1 className="text-xl font-bold text-foreground">
              This invite link has expired
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Invite links are valid for 7 days after they are created. This one
              is no longer active.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the trip owner to generate a new invite link and share it with
              you.
            </p>
          </>
        )}

        {state.kind === "revoked" && (
          <>
            <h1 className="text-xl font-bold text-foreground">
              This invite link has been revoked
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The trip owner has deactivated this invite link. It can no longer
              be used to join the trip.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              If you still need access, ask the trip owner to send you a new
              invite link.
            </p>
          </>
        )}

        {state.kind === "not_found" && (
          <>
            <h1 className="text-xl font-bold text-foreground">
              Invite not found
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This invite link doesn&apos;t exist. Check the URL and try again.
            </p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <h1 className="text-xl font-bold text-foreground">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {state.message}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
