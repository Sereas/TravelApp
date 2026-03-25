"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { User as UserIcon, LogOut } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createBrowserClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export function UserNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!user || pathname.startsWith("/shared/")) return null;

  async function handleLogout() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-muted text-brand transition-colors duration-150 hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label="Profile menu"
        >
          <UserIcon size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-xl border border-border bg-card p-0 shadow-md"
      >
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 truncate text-sm font-medium text-foreground">
            {user.email}
          </p>
        </div>
        <div className="p-1.5">
          <button
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-brand-muted hover:text-foreground"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
