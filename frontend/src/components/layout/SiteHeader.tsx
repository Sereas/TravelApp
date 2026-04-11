import Link from "next/link";
import Image from "next/image";
import { UserNav } from "./UserNav";

/**
 * Site-wide sticky header.
 *
 * Absorbs the iOS safe-area inset at the top via `pt-safe-t` so the
 * backdrop extends under the notch on landing. The inner row is still
 * pinned at `h-14`, but the total header box on a notched device is
 * `h-14 + var(--safe-top)`.
 *
 * Downstream sticky elements (e.g. the tabs bar in `TripView.tsx`) must
 * account for this growth explicitly — `sticky top-14` alone would place
 * them behind the notch. TripView uses `top-[calc(3.5rem+var(--safe-top))]`
 * for exactly this reason.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 pt-safe-t backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.svg"
            alt="Shtab Travel logo"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="text-lg font-bold tracking-tight">
            <span className="text-foreground">Shtab</span>
            <span className="text-brand">Travel</span>
          </span>
        </Link>
        <UserNav />
      </div>
    </header>
  );
}
