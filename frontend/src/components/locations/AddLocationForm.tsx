"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Location } from "@/lib/api";

const REQUIRES_BOOKING_OPTIONS = [
  { value: "", label: "—" },
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "yes_done", label: "Yes (done)" },
] as const;

const CATEGORY_OPTIONS = [
  "Museum",
  "Restaurant",
  "Café",
  "Bar",
  "Walking around",
  "Excursion",
  "Accommodation",
  "Transport",
  "Shopping",
  "Park / nature",
  "Beach",
  "Viewpoint",
  "Event",
  "Other",
] as const;

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

interface AddLocationFormProps {
  tripId: string;
  onAdded: (location: Location) => void;
  onCancel: () => void;
}

export function AddLocationForm({
  tripId,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const location = await api.locations.add(tripId, {
        name,
        address: address || null,
        google_link: googleLink || null,
        note: note || null,
        city: city || null,
        working_hours: workingHours || null,
        requires_booking: requiresBooking || null,
        category: category || null,
      });
      onAdded(location);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add location");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <ErrorBanner message={error} />}

      <div className="space-y-2">
        <Label htmlFor="add-location-name">Location name</Label>
        <Input
          id="add-location-name"
          placeholder="e.g. Eiffel Tower"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-address">Address (optional)</Label>
        <Input
          id="add-location-address"
          placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-city">City (optional)</Label>
        <Input
          id="add-location-city"
          placeholder="e.g. Paris"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-google-link">Google Maps link (optional)</Label>
        <Input
          id="add-location-google-link"
          type="url"
          placeholder="https://maps.google.com/..."
          value={googleLink}
          onChange={(e) => setGoogleLink(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-working-hours">Working hours (optional)</Label>
        <Input
          id="add-location-working-hours"
          placeholder="e.g. 9:00–18:00"
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-requires-booking">Requires booking (optional)</Label>
        <select
          id="add-location-requires-booking"
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
        <Label htmlFor="add-location-category">Category (optional)</Label>
        <select
          id="add-location-category"
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
        <Label htmlFor="add-location-note">Note (optional)</Label>
        <Input
          id="add-location-note"
          placeholder="e.g. Visit at sunset"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add location"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
