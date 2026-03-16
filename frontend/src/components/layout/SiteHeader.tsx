import Link from "next/link";
import { MapPin } from "lucide-react";
import { UserNav } from "./UserNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <MapPin size={16} className="text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Shtab Travel
          </span>
        </Link>
        <UserNav />
      </div>
    </header>
  );
}
