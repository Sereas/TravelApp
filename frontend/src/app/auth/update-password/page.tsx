"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { createBrowserClient } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 6;

/**
 * Dedicated page for Supabase password recovery.
 * User lands here after clicking the link in the reset email.
 * Add this route to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();

    const setReady = (value: boolean) => {
      setSessionReady(value);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true);
        return;
      }
      const hasHash =
        typeof window !== "undefined" && window.location.hash.length > 0;
      if (hasHash) {
        // Let onAuthStateChange fire after client processes the recovery hash
        return;
      }
      setReady(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    let expiredTimer: ReturnType<typeof setTimeout> | null = null;
    if (typeof window !== "undefined" && window.location.hash.length > 0) {
      expiredTimer = setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) setSessionReady(false);
        });
      }, 2500);
    }

    return () => {
      subscription.unsubscribe();
      if (expiredTimer) clearTimeout(expiredTimer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setLoading(true);
    const supabase = createBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/login?message=password_updated");
      router.refresh();
    }, 1500);
  }

  if (sessionReady === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (sessionReady === false) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Invalid or expired link
            </h1>
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Request a new
              one from the login page.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Your password has been updated successfully. Redirecting to login…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Set new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your new password below.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
