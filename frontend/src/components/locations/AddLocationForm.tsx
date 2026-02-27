"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Location } from "@/lib/api";

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
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const location = await api.locations.add(tripId, {
        name,
        note: note || null,
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
