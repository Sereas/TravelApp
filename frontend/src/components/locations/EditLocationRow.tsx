"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Location } from "@/lib/api";
import {
  REQUIRES_BOOKING_OPTIONS,
  CATEGORY_OPTIONS,
  selectClassName,
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

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-md border border-border px-4 py-3"
    >
      {error && <ErrorBanner message={error} />}
      <div className="space-y-2">
        <Label htmlFor="edit-location-name">Location name</Label>
        <Input
          id="edit-location-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Location name"
          aria-label="Location name"
          autoFocus
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-location-address">Address (optional)</Label>
        <Input
          id="edit-location-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
          aria-label="Address"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-location-city">City (optional)</Label>
        <Input
          id="edit-location-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Paris"
          aria-label="City"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-location-google-link">
          Google Maps link (optional)
        </Label>
        <Input
          id="edit-location-google-link"
          type="url"
          value={googleLink}
          onChange={(e) => setGoogleLink(e.target.value)}
          placeholder="https://maps.google.com/..."
          aria-label="Google Maps link"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-location-working-hours">
          Working hours (optional)
        </Label>
        <Input
          id="edit-location-working-hours"
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          placeholder="e.g. 9:00–18:00"
          aria-label="Working hours"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-location-requires-booking">
          Requires booking (optional)
        </Label>
        <select
          id="edit-location-requires-booking"
          className={selectClassName}
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
      <div className="space-y-2">
        <Label htmlFor="edit-location-category">Category (optional)</Label>
        <select
          id="edit-location-category"
          className={selectClassName}
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
      <div className="space-y-2">
        <Label htmlFor="edit-location-note">Note (optional)</Label>
        <Input
          id="edit-location-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Location note"
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
