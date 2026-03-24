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
} from "@/lib/location-constants";

interface EditLocationRowProps {
  tripId: string;
  location: Location;
  onUpdated: (location: Location) => void;
  onCancel: () => void;
}

export function EditLocationRow({
  tripId,
  location,
  onUpdated,
  onCancel,
}: EditLocationRowProps) {
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address ?? "");
  const [googleLink, setGoogleLink] = useState(location.google_link ?? "");
  const [note, setNote] = useState(location.note ?? "");
  const [city, setCity] = useState(location.city ?? "");
  const [workingHours, setWorkingHours] = useState(
    location.working_hours ?? ""
  );
  const [requiresBooking, setRequiresBooking] = useState(
    location.requires_booking ?? ""
  );
  const [category, setCategory] = useState(location.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const updated = await api.locations.update(tripId, location.id, {
        name,
        address: address || null,
        google_link: googleLink || null,
        note: note || null,
        city: city || null,
        working_hours: workingHours || null,
        requires_booking: requiresBooking || null,
        category: category || null,
      });
      onUpdated(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update location"
      );
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
          <DialogTitle>Edit Location</DialogTitle>
          <DialogDescription className="sr-only">
            Edit location details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="px-5 pt-1">
              <ErrorBanner message={error} />
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-5 pt-3">
            {/* Name — required, full width */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="edit-location-name" className={labelClass}>
                Location name
              </Label>
              <input
                id="edit-location-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Eiffel Tower"
                aria-label="Location name"
                autoFocus
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* City */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-location-city" className={labelClass}>
                City {optionalMark}
              </Label>
              <input
                id="edit-location-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Paris"
                aria-label="City"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="edit-location-category" className={labelClass}>
                Category {optionalMark}
              </Label>
              <select
                id="edit-location-category"
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
              <Label htmlFor="edit-location-address" className={labelClass}>
                Address {optionalMark}
              </Label>
              <input
                id="edit-location-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
                aria-label="Address"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Google Maps link — full width */}
            <div className="col-span-2 flex flex-col gap-1">
              <Label htmlFor="edit-location-google-link" className={labelClass}>
                Google Maps link {optionalMark}
              </Label>
              <input
                id="edit-location-google-link"
                type="url"
                value={googleLink}
                onChange={(e) => setGoogleLink(e.target.value)}
                placeholder="https://maps.google.com/..."
                aria-label="Google Maps link"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Working hours */}
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="edit-location-working-hours"
                className={labelClass}
              >
                Hours {optionalMark}
              </Label>
              <input
                id="edit-location-working-hours"
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                placeholder="e.g. 9:00–18:00"
                aria-label="Working hours"
                autoComplete="off"
                className={inputClass}
              />
            </div>

            {/* Requires booking */}
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="edit-location-requires-booking"
                className={labelClass}
              >
                Booking {optionalMark}
              </Label>
              <select
                id="edit-location-requires-booking"
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
              <Label htmlFor="edit-location-note" className={labelClass}>
                Note {optionalMark}
              </Label>
              <input
                id="edit-location-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Visit at sunset"
                aria-label="Location note"
                autoComplete="off"
                className={inputClass}
              />
            </div>
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
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
