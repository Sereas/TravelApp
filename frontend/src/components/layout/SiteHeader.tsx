import Link from "next/link";
import { UserNav } from "./UserNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg">TravelApp</span>
        </Link>
        <UserNav />
      </div>
    </header>
  );
}
