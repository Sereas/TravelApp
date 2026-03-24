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

function formatCitySummary(option: ItineraryOption | undefined): string | null {
  const start = option?.starting_city?.trim() || null;
  const end = option?.ending_city?.trim() || null;

  if (start && end) {
    if (start.toLowerCase() === end.toLowerCase()) return start;
    return `${start} → ${end}`;
  }
  return start || end;
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
  onCreateAlternative: (dayId: string) => void;
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
  const citySummary = formatCitySummary(currentOption);
  const [editingDate, setEditingDate] = useState(false);
  const [editingCities, setEditingCities] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0">
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

        {citySummary ? (
          <div className="mt-1 text-sm font-medium text-content-muted">
            {citySummary}
          </div>
        ) : null}

        {currentOption && (
          <div className="mt-2">
            <button
              type="button"
              className="text-xs font-medium text-content-muted underline-offset-2 hover:text-content-primary hover:underline"
              onClick={() => setEditingCities((value) => !value)}
            >
              {editingCities ? "Hide city editing" : "Edit cities"}
            </button>
            {editingCities ? (
              <div className="mt-2 flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-50">
                  route
                </span>
                <AutosaveInput
                  id={`sc-${currentOption.id}`}
                  placeholder="start city"
                  initialValue={currentOption.starting_city ?? ""}
                  onSave={async (value) => {
                    const nextValue = value || null;
                    if (nextValue === (currentOption.starting_city ?? null))
                      return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      starting_city: nextValue,
                    });
                  }}
                  className="w-24 text-xs"
                />
                <ArrowRight size={10} className="shrink-0 opacity-30" />
                <AutosaveInput
                  id={`ec-${currentOption.id}`}
                  placeholder="end city"
                  initialValue={currentOption.ending_city ?? ""}
                  onSave={async (value) => {
                    const nextValue = value || null;
                    if (nextValue === (currentOption.ending_city ?? null))
                      return;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      ending_city: nextValue,
                    });
                  }}
                  className="w-24 text-xs"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex-1" />

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
