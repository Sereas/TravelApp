"use client";

import { useEffect, useRef, useState } from "react";
import { type ItineraryDay, type ItineraryOption } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Pencil, Plus, X } from "lucide-react";

interface ItineraryPlanSwitcherProps {
  day: ItineraryDay;
  currentOption: ItineraryOption | undefined;
  createOptionLoading: boolean;
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

function optionLabel(option: ItineraryOption): string {
  if (option.option_index === 1) return option.created_by || "Main plan";
  return option.created_by || `Plan ${option.option_index - 1}`;
}

export function ItineraryPlanSwitcher({
  day,
  currentOption,
  createOptionLoading,
  onSelectOption,
  onCreateAlternative,
  onDeleteOption,
  onSaveOptionDetails,
}: ItineraryPlanSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [pendingAltName, setPendingAltName] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const prevOptionsLengthRef = useRef(day.options.length);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      if ((target as Element).closest?.('[role="dialog"]')) return;
      setOpen(false);
      setAddingPlan(false);
      setRenamingOptionId(null);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () =>
      document.removeEventListener("mousedown", handlePointerDown, true);
  }, [open]);

  useEffect(() => {
    if (pendingAltName === null) return;
    if (day.options.length <= prevOptionsLengthRef.current) return;
    prevOptionsLengthRef.current = day.options.length;
    const newest = [...day.options].sort(
      (a, b) => b.option_index - a.option_index
    )[0];
    if (newest) {
      onSaveOptionDetails(day.id, newest.id, { created_by: pendingAltName });
      onSelectOption(day.id, newest.id);
    }
    setPendingAltName(null);
  }, [
    day.id,
    day.options,
    onSaveOptionDetails,
    onSelectOption,
    pendingAltName,
  ]);

  function handleAddPlan() {
    const name = newPlanName.trim();
    if (!name) return;
    setPendingAltName(name);
    setNewPlanName("");
    setAddingPlan(false);
    setOpen(false);
    onCreateAlternative(day.id);
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setAddingPlan(false);
          setRenamingOptionId(null);
        }}
        className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs transition-colors hover:bg-accent"
        aria-label="Switch day plan"
      >
        <span className="max-w-[120px] truncate">
          {currentOption ? optionLabel(currentOption) : "No plan"}
        </span>
        <ChevronDown size={11} className="shrink-0 opacity-50" />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {day.options.map((option) => {
            const label = optionLabel(option);
            const isActive = option.id === currentOption?.id;
            const canDelete =
              day.options.length > 1 && option.option_index !== 1;

            return (
              <div
                key={option.id}
                className="group flex items-center gap-1 rounded-sm px-2 py-1.5 hover:bg-accent"
              >
                {renamingOptionId === option.id ? (
                  <input
                    autoFocus
                    defaultValue={option.created_by ?? ""}
                    placeholder="Plan name…"
                    className="flex-1 border-b border-primary bg-transparent py-0.5 text-xs outline-none"
                    onBlur={(event) => {
                      const value = event.target.value.trim() || null;
                      onSaveOptionDetails(day.id, option.id, {
                        created_by: value,
                      });
                      setRenamingOptionId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setRenamingOptionId(null);
                    }}
                  />
                ) : (
                  <>
                    {isActive ? (
                      <Check size={12} className="shrink-0 text-primary" />
                    ) : (
                      <div className="w-3 shrink-0" />
                    )}
                    <button
                      type="button"
                      className={cn(
                        "flex-1 truncate text-left text-xs",
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                      onClick={() => {
                        if (!isActive) onSelectOption(day.id, option.id);
                        setOpen(false);
                      }}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      title="Rename"
                      className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenamingOptionId(option.id);
                      }}
                    >
                      <Pencil size={10} />
                    </button>
                    {canDelete && (
                      <ConfirmDialog
                        trigger={
                          <button
                            type="button"
                            title="Delete plan"
                            className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                          >
                            <X size={10} />
                          </button>
                        }
                        title="Delete this plan?"
                        description={`"${label}" and all its locations will be removed.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={() => {
                          onDeleteOption(day.id, option.id);
                          setOpen(false);
                        }}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="mt-1 border-t border-border pt-1">
            {addingPlan ? (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <input
                  autoFocus
                  value={newPlanName}
                  onChange={(event) => setNewPlanName(event.target.value)}
                  placeholder="Plan name…"
                  className="flex-1 border-b border-primary bg-transparent py-0.5 text-xs outline-none"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddPlan();
                    if (event.key === "Escape") setAddingPlan(false);
                  }}
                />
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-40"
                  onClick={handleAddPlan}
                  disabled={createOptionLoading || !newPlanName.trim()}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => {
                  setAddingPlan(true);
                  setNewPlanName("");
                }}
              >
                <Plus size={11} />
                Add plan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
