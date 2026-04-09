"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  // Loading state
  if (sessionReady === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Invalid / expired link
  if (sessionReady === false) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Invalid or expired link
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This password reset link is invalid or has expired. Request a new
            one from the login page.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block cursor-pointer rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-lg border border-brand/20 bg-brand-muted px-4 py-3 text-sm text-brand-strong">
            Your password has been updated successfully. Redirecting to login…
          </div>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Set new password
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your new password below.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              New password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="rounded-lg border-border bg-card focus-visible:ring-brand"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-foreground">
              Confirm password
            </Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="rounded-lg border-border bg-card focus-visible:ring-brand"
            />
          </div>
          <button
            type="submit"
            className="w-full cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="cursor-pointer text-brand underline underline-offset-4 transition-colors duration-150 hover:text-brand-strong"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
