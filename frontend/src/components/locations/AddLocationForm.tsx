"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api, type Location } from "@/lib/api";
import {
  formInputClass,
  formSelectClass,
  formLabelClass,
  OptionalMark,
} from "@/lib/form-styles";
import {
  REQUIRES_BOOKING_OPTIONS,
  CATEGORY_OPTIONS,
  type DayChoice,
} from "@/lib/location-constants";
import { CalendarPlus, ChevronDown, Link2, X } from "lucide-react";

interface AddLocationFormProps {
  tripId: string;
  existingLocations: Location[];
  availableDays?: DayChoice[];
  onAdded: (location: Location, scheduleDayId?: string | null) => void;
  onCancel: () => void;
}

export function AddLocationForm({
  tripId,
  existingLocations,
  availableDays,
  onAdded,
  onCancel,
}: AddLocationFormProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [googleLink, setGoogleLink] = useState("");
  const [note, setNote] = useState("");
  const [city, setCity] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [requiresBooking, setRequiresBooking] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [googleSourceType, setGoogleSourceType] = useState<string | null>(null);
  const [googleRaw, setGoogleRaw] = useState<Record<string, unknown> | null>(
    null
  );
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [scheduleDayId, setScheduleDayId] = useState("");

  async function handleGoogleLinkBlur() {
    const trimmed = googleLink.trim();
    if (!trimmed) {
      return;
    }
    if (previewed) {
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const preview = await api.google.previewLocationFromLink({
        google_link: trimmed,
      });
      setPreviewed(true);
      setGooglePlaceId(preview.google_place_id);
      setGoogleSourceType("manual_url");
      setGoogleRaw(preview.google_raw);

      const existing = existingLocations.find(
        (loc) => loc.google_place_id === preview.google_place_id
      );
      if (existing) {
        setDuplicateName(existing.name);
      } else {
        setDuplicateName(null);
      }
      if (!name) {
        setName(preview.name);
      }
      if (!address && preview.address) {
        setAddress(preview.address);
      }
      if (!city && preview.city) {
        setCity(preview.city);
      }
      if (!workingHours && preview.working_hours.length > 0) {
        setWorkingHours(preview.working_hours.join(" | "));
      }
      if (!category && preview.suggested_category) {
        setCategory(preview.suggested_category);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not fetch details from Google"
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const location = await api.locations.add(tripId, {
        name,
        address: address || null,
        google_link: googleLink || null,
        google_place_id: googlePlaceId,
        google_source_type: googleSourceType,
        google_raw: googleRaw,
        note: note || null,
        city: city || null,
        working_hours: workingHours || null,
        requires_booking: requiresBooking || null,
        category: category || null,
      });
      onAdded(location, scheduleDayId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add location");
      setSaving(false);
    }
  }

  const inputClass = formInputClass;
  const selectClass = formSelectClass;
  const labelClass = formLabelClass;
  const optionalMark = OptionalMark;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>Add Location</DialogTitle>
          <DialogDescription className="sr-only">
            Add a new location to your trip
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {/* Hero: Google Maps link */}
          <div className="mx-5 rounded-xl bg-brand-muted/40 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Link2 size={14} className="text-brand" />
              <Label
                htmlFor="add-location-google-link"
                className="text-sm font-semibold text-foreground"
              >
                Google Maps link
              </Label>
            </div>
            <Input
              id="add-location-google-link"
              type="url"
              placeholder="https://maps.google.com/..."
              value={googleLink}
              onChange={(e) => {
                setGoogleLink(e.target.value);
                setPreviewed(false);
                setDuplicateName(null);
              }}
              onBlur={() => void handleGoogleLinkBlur()}
              autoFocus
              autoComplete="off"
              className="h-9 rounded-lg border-brand/30 bg-white text-sm focus-visible:ring-brand"
            />
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-strong/70">
              Auto-fills details &amp; enables map pin. You can also fill in
              fields manually below.
            </p>
            {previewLoading && (
              <p className="mt-1 text-xs text-brand">Fetching details…</p>
            )}
            {duplicateName && (
              <p className="mt-1 text-xs font-medium text-amber-600">
                &quot;{duplicateName}&quot; already exists in this trip.
              </p>
            )}
          </div>

          {error && (
            <div className="px-5 pt-3">
              <ErrorBanner message={error} />
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-5 pt-4">
            {/* Name — required, full width */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="add-location-name" className={labelClass}>
                Location name
              </Label>
              <input
                id="add-location-name"
                placeholder="e.g. Eiffel Tower"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* City */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-location-city" className={labelClass}>
                City {optionalMark}
              </Label>
              <input
                id="add-location-city"
                placeholder="e.g. Paris"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="add-location-category" className={labelClass}>
                Category {optionalMark}
              </Label>
              <select
                id="add-location-category"
                className={selectClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">—</option>
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Address — full width */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="add-location-address" className={labelClass}>
                Address {optionalMark}
              </Label>
              <input
                id="add-location-address"
                placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Working hours */}
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="add-location-working-hours"
                className={labelClass}
              >
                Hours {optionalMark}
              </Label>
              <input
                id="add-location-working-hours"
                placeholder="e.g. 9:00–18:00"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Requires booking */}
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="add-location-requires-booking"
                className={labelClass}
              >
                Booking {optionalMark}
              </Label>
              <select
                id="add-location-requires-booking"
                className={selectClass}
                value={requiresBooking}
                onChange={(e) => setRequiresBooking(e.target.value)}
              >
                {REQUIRES_BOOKING_OPTIONS.map((opt) => (
                  <option key={opt.value || "_"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Note — full width */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="add-location-note" className={labelClass}>
                Note {optionalMark}
              </Label>
              <input
                id="add-location-note"
                placeholder="e.g. Visit at sunset"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Schedule to day — full width */}
            {availableDays && availableDays.length > 0 && (
              <div className="col-span-2 flex flex-col gap-1">
                <Label className={labelClass}>
                  Schedule to day {optionalMark}
                </Label>
                {scheduleDayId ? (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-muted px-2.5 py-1 text-xs font-medium text-brand-strong">
                      <CalendarPlus size={12} />
                      {availableDays.find((d) => d.id === scheduleDayId)?.label}
                    </span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                      onClick={() => setScheduleDayId("")}
                      aria-label="Clear day selection"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <Popover modal>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex h-8 w-full items-center justify-between rounded-lg border border-dashed border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand-muted/30"
                        aria-label="Schedule to day"
                      >
                        <span className="text-xs">Don&apos;t schedule yet</span>
                        <ChevronDown size={14} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-48 p-1"
                      align="start"
                      sideOffset={4}
                    >
                      <div className="flex max-h-44 flex-col overflow-y-auto">
                        {availableDays.map((day) => (
                          <button
                            key={day.id}
                            type="button"
                            className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-brand-muted"
                            onClick={() => setScheduleDayId(day.id)}
                          >
                            <CalendarPlus
                              size={13}
                              className="shrink-0 text-brand"
                            />
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="rounded-full px-4 text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              size="sm"
              className="rounded-full bg-primary px-5 font-semibold text-white hover:bg-primary-strong"
            >
              {saving ? "Adding…" : "Add Location"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
