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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);
  const [googleSourceType, setGoogleSourceType] = useState<string | null>(null);
  const [googleRaw, setGoogleRaw] = useState<Record<string, unknown> | null>(
    null
  );

  async function handleGoogleLinkBlur() {
    const trimmed = googleLink.trim();
    if (!trimmed) {
      return;
    }
    // Avoid repeated calls if the user tabs through fields without changing the link.
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
      if (!name) {
        setName(preview.name);
      }
      if (!address && preview.address) {
        setAddress(preview.address);
      }
      if (!city && preview.address) {
        const match = preview.address.match(/,\s*([^,]+),\s*[^,]+$/);
        if (match) {
          setCity(match[1]);
        }
      }
      if (!workingHours && preview.working_hours.length > 0) {
        setWorkingHours(preview.working_hours.join(" | "));
      }
      if (!category && preview.suggested_category) {
        setCategory(preview.suggested_category);
      }
      // latitude/longitude are kept only in backend; UI does not need them yet.
    } catch (err) {
      // Soft-fail: user can still fill everything manually.
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
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-address">Address (optional)</Label>
        <Input
          id="add-location-address"
          placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-city">City (optional)</Label>
        <Input
          id="add-location-city"
          placeholder="e.g. Paris"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-google-link">
          Google Maps link (optional)
        </Label>
        <Input
          id="add-location-google-link"
          type="url"
          placeholder="https://maps.google.com/..."
          value={googleLink}
          onChange={(e) => setGoogleLink(e.target.value)}
          onBlur={() => void handleGoogleLinkBlur()}
          autoComplete="off"
        />
        {previewLoading && (
          <p className="text-xs text-muted-foreground">Fetching from Google…</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-working-hours">
          Working hours (optional)
        </Label>
        <Input
          id="add-location-working-hours"
          placeholder="e.g. 9:00–18:00"
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-location-requires-booking">
          Requires booking (optional)
        </Label>
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
          autoComplete="off"
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
