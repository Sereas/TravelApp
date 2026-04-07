"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ItineraryDay, ItineraryOption } from "@/lib/api";
import { ItineraryPlanSwitcher } from "@/components/itinerary/ItineraryPlanSwitcher";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/lib/read-only-context";
import { ArrowRight, MapPin, Pencil } from "lucide-react";

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
        "h-7 rounded-md border px-2 text-sm font-medium transition-colors focus:border-ring focus:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
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
  const readOnly = useReadOnly();
  const dayLabel = day.date
    ? formatDate(day.date)
    : `Day ${day.sort_order + 1}`;
  const [editingDate, setEditingDate] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {!readOnly && editingDate ? (
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
              className="date-input-branded h-9 rounded-lg border border-border/50 bg-card px-2.5 text-sm shadow-sm"
            />
          ) : (
            <>
              <h3 className="text-2xl font-bold tracking-tight text-foreground">
                {dayLabel}
              </h3>
              {!readOnly && (
                <button
                  onClick={() => setEditingDate(true)}
                  className="rounded-full border border-transparent p-1 text-muted-foreground/50 transition-all hover:border-border/50 hover:bg-card hover:text-primary hover:shadow-sm"
                  aria-label="Edit day date"
                  title={day.date ? "Change date" : "Assign a date"}
                >
                  <Pencil size={12} />
                </button>
              )}
            </>
          )}
        </div>

        {currentOption && (
          <div className="mt-3 text-sm">
            {readOnly ? (
              (currentOption.starting_city || currentOption.ending_city) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={13} className="shrink-0 text-brand/50" />
                  {currentOption.starting_city && (
                    <span className="font-medium text-foreground">
                      {currentOption.starting_city}
                    </span>
                  )}
                  {currentOption.starting_city &&
                    currentOption.ending_city && (
                      <ArrowRight
                        size={13}
                        className="shrink-0 text-muted-foreground/40"
                      />
                    )}
                  {currentOption.ending_city && (
                    <span className="font-medium text-foreground">
                      {currentOption.ending_city}
                    </span>
                  )}
                </div>
              )
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`sc-${currentOption.id}`}
                    className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
                  >
                    From
                  </label>
                  <AutosaveInput
                    id={`sc-${currentOption.id}`}
                    placeholder="City"
                    initialValue={currentOption.starting_city ?? ""}
                    onSave={async (value) => {
                      const nextValue = value || null;
                      if (
                        nextValue ===
                        (currentOption.starting_city ?? null)
                      )
                        return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        starting_city: nextValue,
                      });
                    }}
                    className="w-32 rounded-lg border-border/40 bg-card text-sm font-medium shadow-sm transition-colors focus-within:border-primary/30 sm:w-36"
                  />
                </div>
                <ArrowRight
                  size={14}
                  className="shrink-0 text-muted-foreground/30"
                />
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`ec-${currentOption.id}`}
                    className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
                  >
                    To
                  </label>
                  <AutosaveInput
                    id={`ec-${currentOption.id}`}
                    placeholder="City"
                    initialValue={currentOption.ending_city ?? ""}
                    onSave={async (value) => {
                      const nextValue = value || null;
                      if (
                        nextValue ===
                        (currentOption.ending_city ?? null)
                      )
                        return;
                      onSaveOptionDetails(day.id, currentOption.id, {
                        ending_city: nextValue,
                      });
                    }}
                    className="w-32 rounded-lg border-border/40 bg-card text-sm font-medium shadow-sm transition-colors focus-within:border-primary/30 sm:w-36"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <ItineraryPlanSwitcher
          day={day}
          currentOption={currentOption}
          createOptionLoading={createOptionLoading}
          onSelectOption={onSelectOption}
          onCreateAlternative={onCreateAlternative}
          onDeleteOption={onDeleteOption}
          onSaveOptionDetails={onSaveOptionDetails}
        />
      )}
    </div>
  );
}
