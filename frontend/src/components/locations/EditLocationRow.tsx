"use client";

import { useState } from "react";
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
  REQUIRES_BOOKING_OPTIONS,
  CATEGORY_OPTIONS,
} from "@/lib/location-constants";
import {
  Building2,
  ChevronDown,
  Clock,
  Link2,
  MapPin,
  MessageSquare,
  Tag,
  Ticket,
} from "lucide-react";

/* ── Shared field styling (matches AddLocationForm) ─────────── */

const fieldLabel =
  "text-[10px] font-semibold uppercase tracking-wider text-primary";

const fieldInput =
  "h-10 w-full rounded-full bg-secondary/80 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20";

const fieldSelect =
  "h-10 w-full appearance-none rounded-full bg-secondary/80 pl-9 pr-8 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20";

const iconClass = "shrink-0 text-primary/50";

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
  const [usefulLink, setUsefulLink] = useState(location.useful_link ?? "");
  const [requiresBooking, setRequiresBooking] = useState(
    location.requires_booking || "no"
  );
  const [category, setCategory] = useState(location.category || "Other");
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
        useful_link: usefulLink || null,
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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-6 pb-0 pt-5">
          <DialogTitle className="text-xl font-bold tracking-tight">
            Edit Location
          </DialogTitle>
          <DialogDescription className="sr-only">
            Edit location details
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="px-6 pt-3">
              <ErrorBanner message={error} />
            </div>
          )}

          {/* Fields */}
          <div className="space-y-3 px-6 pt-3">
            {/* Row: Location Name + City */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3 min-w-0 space-y-1">
                <Label htmlFor="edit-location-name" className={fieldLabel}>
                  Location name
                </Label>
                <div className="relative">
                  <MapPin
                    size={14}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                  />
                  <input
                    id="edit-location-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Eiffel Tower"
                    aria-label="Location name"
                    autoFocus
                    autoComplete="off"
                    className={`${fieldInput} pl-9`}
                  />
                </div>
              </div>
              <div className="col-span-2 min-w-0 space-y-1">
                <Label htmlFor="edit-location-city" className={fieldLabel}>
                  City / Region
                </Label>
                <div className="relative">
                  <Building2
                    size={14}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                  />
                  <input
                    id="edit-location-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Paris"
                    aria-label="City"
                    autoComplete="off"
                    className={`${fieldInput} pl-9`}
                  />
                </div>
              </div>
            </div>

            {/* Address — full width */}
            <div className="space-y-1">
              <Label htmlFor="edit-location-address" className={fieldLabel}>
                Full address
              </Label>
              <div className="relative">
                <MapPin
                  size={14}
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${iconClass}`}
                />
                <input
                  id="edit-location-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 5 Avenue Anatole France, 75007 Paris"
                  aria-label="Address"
                  autoComplete="off"
                  className={`${fieldInput} pl-9`}
                />
              </div>
            </div>

            {/* Row: Category + Booking */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0 space-y-1">
                <Label htmlFor="edit-location-category" className={fieldLabel}>
                  Category
                </Label>
                <div className="relative">
                  <Tag
                    size={14}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                  />
                  <select
                    id="edit-location-category"
                    className={fieldSelect}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <Label
                  htmlFor="edit-location-requires-booking"
                  className={fieldLabel}
                >
                  Booking
                </Label>
                <div className="relative">
                  <Ticket
                    size={14}
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                  />
                  <select
                    id="edit-location-requires-booking"
                    className={fieldSelect}
                    value={requiresBooking}
                    onChange={(e) => setRequiresBooking(e.target.value)}
                  >
                    {REQUIRES_BOOKING_OPTIONS.map((opt) => (
                      <option key={opt.value || "_"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                  />
                </div>
              </div>
            </div>

            {/* Google Maps link — full width */}
            <div className="space-y-1">
              <Label htmlFor="edit-location-google-link" className={fieldLabel}>
                Google Maps URL
              </Label>
              <div className="relative">
                <Link2
                  size={14}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                />
                <input
                  id="edit-location-google-link"
                  type="url"
                  value={googleLink}
                  onChange={(e) => setGoogleLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  aria-label="Google Maps link"
                  autoComplete="off"
                  className={`${fieldInput} pl-9`}
                />
              </div>
            </div>

            {/* Useful link */}
            <div className="space-y-1">
              <Label htmlFor="edit-location-useful-link" className={fieldLabel}>
                Useful link
              </Label>
              <div className="relative">
                <Link2
                  size={14}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                />
                <input
                  id="edit-location-useful-link"
                  type="url"
                  value={usefulLink}
                  onChange={(e) => setUsefulLink(e.target.value)}
                  placeholder="https://booking.com/..."
                  aria-label="Useful link"
                  autoComplete="off"
                  className={`${fieldInput} pl-9`}
                />
              </div>
            </div>

            {/* Opening hours */}
            <div className="space-y-1">
              <Label
                htmlFor="edit-location-working-hours"
                className={fieldLabel}
              >
                Opening hours
              </Label>
              <div className="relative">
                <Clock
                  size={14}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                />
                <input
                  id="edit-location-working-hours"
                  value={workingHours}
                  onChange={(e) => setWorkingHours(e.target.value)}
                  placeholder="e.g. 9:00 AM - 6:00 PM"
                  aria-label="Working hours"
                  autoComplete="off"
                  className={`${fieldInput} pl-9`}
                />
              </div>
            </div>

            {/* Note — full width */}
            <div className="space-y-1">
              <Label htmlFor="edit-location-note" className={fieldLabel}>
                Personal notes
              </Label>
              <div className="relative">
                <MessageSquare
                  size={14}
                  className={`absolute left-3.5 top-3 ${iconClass}`}
                />
                <textarea
                  id="edit-location-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Visit at sunset"
                  aria-label="Location note"
                  className="w-full resize-none rounded-2xl bg-secondary/80 py-3 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-center gap-4 border-t border-border/60 bg-card px-6 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-5 py-2.5 text-sm font-medium text-foreground/70 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
