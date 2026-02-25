import { cn } from "@/lib/utils";

export interface LocationRowProps {
  id: string;
  name: string;
  note?: string | null;
  actions?: React.ReactNode;
  className?: string;
}

export function LocationRow({
  name,
  note,
  actions,
  className,
}: LocationRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        {note && (
          <p className="truncate text-sm text-muted-foreground">{note}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
