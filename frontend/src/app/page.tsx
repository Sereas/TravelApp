import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">TravelApp</h1>
        <p className="text-muted-foreground">
          Plan trips, collect locations, and organize day-by-day itineraries.
        </p>
      </div>
      <Button asChild>
        <Link href="/login">Sign in to get started</Link>
      </Button>
    </div>
  );
}
