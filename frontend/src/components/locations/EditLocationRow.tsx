"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import { api, type Location } from "@/lib/api";

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
  const [note, setNote] = useState(location.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const updated = await api.locations.update(tripId, location.id, {
        name,
        note: note || null,
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
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Location name"
        aria-label="Location name"
        autoFocus
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label="Location note"
      />
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
