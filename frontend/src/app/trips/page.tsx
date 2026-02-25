import { EmptyState } from "@/components/feedback/EmptyState";

export default function TripsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My Trips</h1>
      <EmptyState message="Your trips will appear here after you create one." />
    </div>
  );
}
