"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { ItineraryPlanSwitcher } from "@/components/itinerary/ItineraryPlanSwitcher";
import { cn } from "@/lib/utils";
import { ArrowRight, Pencil } from "lucide-react";

function AutosaveInput({
  id,
  placeholder,
  initialValue,
  onSave,
  className,
}: {
  id: string;
  placeholder: string;
  initialValue: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const savedRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    savedRef.current = initialValue;
  }, [initialValue]);

  const commit = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === savedRef.current) return;
    savedRef.current = trimmed;
    await onSave(trimmed);
  }, [onSave, value]);

  return (
    <input
      id={id}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-7 rounded border border-transparent bg-transparent px-1.5 text-sm transition-colors hover:border-input focus:border-input focus:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    />
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface ItineraryDayHeaderProps {
  day: ItineraryDay;
  currentOption: ItineraryOption | undefined;
  createOptionLoading: boolean;
  tripStartDate: string | null;
  tripEndDate: string | null;
  onUpdateDayDate: (
    dayId: string,
    date: string | null,
    optionId: string | undefined
  ) => void;
  onSelectOption: (dayId: string, optionId: string) => void;
  onCreateAlternative: (
    dayId: string,
    name?: string
  ) => Promise<string | null> | void;
  onDeleteOption: (dayId: string, optionId: string) => void;
  onSaveOptionDetails: (
    dayId: string,
    optionId: string,
    updates: {
      starting_city?: string | null;
      ending_city?: string | null;
      created_by?: string | null;
    }
  ) => void;
}

export function ItineraryDayHeader({
  day,
  currentOption,
  createOptionLoading,
  tripStartDate,
  tripEndDate,
  onUpdateDayDate,
  onSelectOption,
  onCreateAlternative,
  onDeleteOption,
  onSaveOptionDetails,
}: ItineraryDayHeaderProps) {
  const dayLabel = day.date
    ? formatDate(day.date)
    : `Day ${day.sort_order + 1}`;
  const [editingDate, setEditingDate] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {editingDate ? (
            <input
              type="date"
              ref={(el) => {
                if (!el) return;
                el.focus();
                try {
                  (
                    el as HTMLInputElement & { showPicker?: () => void }
                  ).showPicker?.();
                } catch {
                  /* showPicker not supported */
                }
              }}
              defaultValue={day.date ?? ""}
              min={tripStartDate ?? undefined}
              max={tripEndDate ?? undefined}
              onChange={(event) => {
                const value = event.target.value || null;
                if (value && value !== (day.date ?? null)) {
                  setEditingDate(false);
                  onUpdateDayDate(day.id, value, currentOption?.id);
                }
              }}
              onBlur={() => setEditingDate(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditingDate(false);
              }}
              className="h-9 rounded border border-input bg-background px-2 text-sm"
            />
          ) : (
            <>
              <h3 className="text-xl font-semibold tracking-tight text-content-primary">
                {dayLabel}
              </h3>
              <button
                onClick={() => setEditingDate(true)}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Edit day date"
                title={day.date ? "Change date" : "Assign a date"}
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>

        {currentOption && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-content-muted">
            <AutosaveInput
              id={`sc-${currentOption.id}`}
              placeholder="Start city"
              initialValue={currentOption.starting_city ?? ""}
              onSave={async (value) => {
                const nextValue = value || null;
                if (nextValue === (currentOption.starting_city ?? null)) return;
                onSaveOptionDetails(day.id, currentOption.id, {
                  starting_city: nextValue,
                });
              }}
              className="w-28 text-sm"
            />
            <ArrowRight size={12} className="shrink-0 text-content-muted/40" />
            <AutosaveInput
              id={`ec-${currentOption.id}`}
              placeholder="End city"
              initialValue={currentOption.ending_city ?? ""}
              onSave={async (value) => {
                const nextValue = value || null;
                if (nextValue === (currentOption.ending_city ?? null)) return;
                onSaveOptionDetails(day.id, currentOption.id, {
                  ending_city: nextValue,
                });
              }}
              className="w-28 text-sm"
            />
          </div>
        )}
      </div>

      <ItineraryPlanSwitcher
        day={day}
        currentOption={currentOption}
        createOptionLoading={createOptionLoading}
        onSelectOption={onSelectOption}
        onCreateAlternative={onCreateAlternative}
        onDeleteOption={onDeleteOption}
        onSaveOptionDetails={onSaveOptionDetails}
      />
    </div>
  );
}
