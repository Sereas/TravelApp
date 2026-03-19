import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

function LoginFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-3xl font-bold text-content-primary">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-content-muted">
            Sign in to plan your next trip
          </p>
        </div>
        <div className="space-y-4">
          <div className="h-10 animate-pulse rounded-lg bg-brand-green-light" />
          <div className="h-10 animate-pulse rounded-lg bg-brand-green-light" />
          <div className="h-10 animate-pulse rounded-full bg-brand-terracotta-light" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
