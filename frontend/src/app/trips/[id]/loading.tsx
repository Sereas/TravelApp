import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";

export default function TripDetailLoading() {
  return (
    <div className="flex justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  );
}
