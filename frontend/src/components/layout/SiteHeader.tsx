import Link from "next/link";
import Image from "next/image";
import { UserNav } from "./UserNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
            <span className="text-content-primary">Shtab</span>
            <span className="text-brand-green">Travel</span>
          </span>
        </Link>
        <UserNav />
      </div>
    </header>
  );
}
