import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  message: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ message, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-12 text-center",
        className
      )}
    >
      <p className="text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}
