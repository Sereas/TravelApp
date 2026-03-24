"use client";

import { useEffect, useRef, useState } from "react";
import { type ItineraryDay, type ItineraryOption } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

interface ItineraryPlanSwitcherProps {
  day: ItineraryDay;
  currentOption: ItineraryOption | undefined;
  createOptionLoading: boolean;
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
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const newPlanNameRef = useRef("");
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const addSubmitLockRef = useRef(false);

  useEffect(() => {
    newPlanNameRef.current = newPlanName;
  }, [newPlanName]);

  async function handleAddPlan() {
    if (addSubmitLockRef.current || createOptionLoading) return;
    // Ref + state: Radix Popover can fire onOpenChange(false) on input blur before
    // the Create click runs; onPointerDown preventDefault on Create avoids that.
    const raw = newPlanNameRef.current.trim() || newPlanName.trim();
    const name = raw || undefined;
    addSubmitLockRef.current = true;
    setNewPlanName("");
    newPlanNameRef.current = "";
    setAddingPlan(false);
    setPlanMenuOpen(false);
    try {
      const newOptionId = await onCreateAlternative(day.id, name);
      if (newOptionId) {
        onSelectOption(day.id, newOptionId);
      }
    } finally {
      addSubmitLockRef.current = false;
    }
  }

  function handleCancelAdd() {
    setAddingPlan(false);
    setNewPlanName("");
    newPlanNameRef.current = "";
  }

  function openAddFlow() {
    setAddingPlan(true);
    setNewPlanName("");
    newPlanNameRef.current = "";
  }

  const currentLabel = currentOption
    ? optionLabel(currentOption)
    : "Choose plan";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Popover
        open={planMenuOpen}
        onOpenChange={(open) => {
          setPlanMenuOpen(open);
          if (!open) {
            // Do not clear newPlanName here: Radix can fire close (focus-outside)
            // before the Create button's click runs, wiping the typed name. Reset
            // only in openAddFlow, handleCancelAdd, and handleAddPlan after read.
            setAddingPlan(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            id={`plan-switch-${day.id}`}
            className="h-8 min-w-[10.5rem] max-w-[min(16rem,55vw)] justify-between gap-2 border-border/80 bg-card/90 px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-background"
            title="Choose plan for this day"
            aria-haspopup="listbox"
            aria-expanded={planMenuOpen}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {currentLabel}
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 opacity-60"
              aria-hidden
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[min(calc(100vw-1.5rem),17rem)] p-0"
          onOpenAutoFocus={(event) => {
            if (addingPlan) return;
            event.preventDefault();
          }}
        >
          <div
            className="max-h-64 overflow-y-auto p-1"
            role="listbox"
            aria-label="Plans for this day"
          >
            {day.options.map((option) => {
              const label = optionLabel(option);
              const selected = option.id === currentOption?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                    selected
                      ? "bg-brand-muted/35 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-brand-muted/20 hover:text-foreground"
                  )}
                  onClick={() => {
                    if (!selected) onSelectOption(day.id, option.id);
                    setPlanMenuOpen(false);
                  }}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {selected ? (
                      <Check className="h-3.5 w-3.5 text-brand-strong" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border/60 p-1">
            {!addingPlan ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-brand-muted/25 hover:text-foreground"
                onClick={openAddFlow}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                Add plan
              </button>
            ) : (
              <div className="space-y-2 px-1 pb-1 pt-0.5">
                <Input
                  autoFocus
                  value={newPlanName}
                  placeholder="New plan name"
                  className="h-8 text-xs"
                  disabled={createOptionLoading}
                  onChange={(event) => {
                    const v = event.target.value;
                    newPlanNameRef.current = v;
                    setNewPlanName(v);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddPlan();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancelAdd();
                    }
                  }}
                />
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    disabled={createOptionLoading}
                    onPointerDown={(event) => {
                      // Avoid input blur → Popover focus-outside → clearing name before click.
                      event.preventDefault();
                    }}
                    onClick={() => void handleAddPlan()}
                  >
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={createOptionLoading}
                    onClick={handleCancelAdd}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {currentOption ? (
        <Popover
          open={settingsOpen}
          onOpenChange={(open) => {
            setSettingsOpen(open);
            if (!open) setRenamingOptionId(null);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-brand-muted/30 hover:text-foreground"
              aria-label={`Plan settings: ${currentLabel}`}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-52 p-1"
            onClick={(event) => event.stopPropagation()}
          >
            {renamingOptionId === currentOption.id ? (
              <div className="p-1.5">
                <label
                  className="sr-only"
                  htmlFor={`rename-${currentOption.id}`}
                >
                  Plan name
                </label>
                <Input
                  id={`rename-${currentOption.id}`}
                  autoFocus
                  defaultValue={currentOption.created_by ?? ""}
                  placeholder="Name this plan"
                  className="h-8 text-xs"
                  onBlur={(event) => {
                    const value = event.target.value.trim() || null;
                    onSaveOptionDetails(day.id, currentOption.id, {
                      created_by: value,
                    });
                    setRenamingOptionId(null);
                    setSettingsOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingOptionId(null);
                      setSettingsOpen(false);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-brand-muted/35"
                  onClick={() => setRenamingOptionId(currentOption.id)}
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  Rename
                </button>
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-primary-strong hover:bg-primary/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-80" />
                      Delete
                    </button>
                  }
                  title="Delete this plan?"
                  description={`"${currentLabel}" and all its locations will be removed.`}
                  confirmLabel="Delete"
                  variant="destructive"
                  onConfirm={() => {
                    onDeleteOption(day.id, currentOption.id);
                    setSettingsOpen(false);
                  }}
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}
