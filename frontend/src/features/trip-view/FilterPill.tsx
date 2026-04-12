"use client";

import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FilterPillOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterPillProps {
  label: string;
  icon: ReactNode;
  options: FilterPillOption[];
  selected: string | null;
  onChange: (value: string | null) => void;
  allLabel: string;
  /** When set, enables a "Group by {groupBy}" toggle inside the popover. */
  groupBy?: string;
  /** Whether group-by mode is currently active. */
  groupByActive?: boolean;
  onGroupByToggle?: () => void;
  /** Format the selected value for the trigger label. */
  triggerLabelFormat?: (value: string) => string;
}

export function FilterPill({
  label,
  icon,
  options,
  selected,
  onChange,
  allLabel,
  groupBy,
  groupByActive,
  onGroupByToggle,
  triggerLabelFormat,
}: FilterPillProps) {
  const [open, setOpen] = useState(false);

  const triggerText = selected
    ? triggerLabelFormat
      ? triggerLabelFormat(selected)
      : selected
    : groupByActive
      ? `Grouped by ${groupBy}`
      : label;

  const isActive = !!selected || !!groupByActive;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "touch-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors",
            isActive
              ? "bg-brand-muted text-brand-strong"
              : "text-foreground hover:bg-brand-muted"
          )}
        >
          {icon}
          {triggerText}
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-72 w-auto min-w-[12rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-1.5"
        align="start"
        sideOffset={6}
      >
        {/* "All" option */}
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
            !selected && !groupByActive
              ? "bg-brand-muted font-medium text-brand-strong"
              : "text-foreground hover:bg-muted"
          )}
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
        >
          {allLabel}
        </button>

        {/* Group-by toggle */}
        {onGroupByToggle && groupBy && (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
              groupByActive && !selected
                ? "bg-brand-muted font-medium text-brand-strong"
                : "text-foreground hover:bg-muted"
            )}
            onClick={() => {
              onGroupByToggle();
              setOpen(false);
            }}
          >
            Group by {groupBy}
          </button>
        )}

        <div className="my-1 border-t border-border" />

        {/* Options */}
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
              selected === opt.value
                ? "bg-brand-muted font-medium text-brand-strong"
                : "text-foreground hover:bg-muted"
            )}
            onClick={() => {
              onChange(selected === opt.value ? null : opt.value);
              setOpen(false);
            }}
          >
            <span className="truncate">{opt.label}</span>
            {opt.count != null && (
              <span className="text-xs text-muted-foreground">{opt.count}</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
