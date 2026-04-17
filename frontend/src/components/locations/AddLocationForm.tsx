"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/feedback/ErrorBanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api, type Location } from "@/lib/api";
import {
  REQUIRES_BOOKING_OPTIONS,
  CATEGORY_OPTIONS,
  type DayChoice,
} from "@/lib/location-constants";
import {
  CalendarPlus,
  ChevronDown,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  Building2,
  Tag,
  Ticket,
  X,
} from "lucide-react";

/* ── Shared field styling ────────────────────────────────────── */

const fieldLabel =
  "text-[10px] font-semibold uppercase tracking-wider text-primary";

const fieldInput =
  "h-10 w-full rounded-full bg-secondary/80 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20";

const fieldSelect =
  "h-10 w-full appearance-none rounded-full bg-secondary/80 pl-9 pr-8 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20";

const fieldTextarea =
  "w-full resize-none rounded-2xl bg-secondary/80 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 border border-transparent focus-visible:border-primary/20";

const iconClass = "shrink-0 text-primary/50";

/* ── Component ───────────────────────────────────────────────── */

/**
 * Response shape shared by `api.google.previewLocationFromLink` and
 * `api.google.resolvePlace`. Keeping this as an exported type lets
 * `SmartLocationInput` pass a typeahead-resolved payload directly into
 * `initialPrefill` below without a second `/preview` fetch.
 */
export interface LocationPreviewPayload {
  name: string;
  address: string | null;
  city?: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  suggested_category: string | null;
  photo_resource_name: string | null;
}

interface AddLocationFormProps {
  tripId: string;
  existingLocations: Location[];
  availableDays?: DayChoice[];
  initialGoogleLink?: string;
  initialName?: string;
  /**
   * When provided, the form uses this payload to prefill itself directly
   * and skips the `api.google.previewLocationFromLink` fetch entirely.
   * Supplied by the typeahead flow after `api.google.resolvePlace` — this
   * is what prevents a duplicate Place Details Pro call (~$17/1k saved per
   * typeahead pick).
   */
  initialPrefill?: LocationPreviewPayload;
  /** When true, show only a link input first; reveal full form after preview. */
  linkEntryMode?: boolean;
  onAdded: (location: Location, scheduleDayId?: string | null) => void;
  onCancel: () => void;
}

export function AddLocationForm({
  tripId,
  existingLocations,
  availableDays,
  initialGoogleLink,
  initialName,
  initialPrefill,
  linkEntryMode,
  onAdded,
  onCancel,
}: AddLocationFormProps) {
  const [name, setName] = useState(initialPrefill?.name ?? initialName ?? "");
  const [address, setAddress] = useState(initialPrefill?.address ?? "");
  const [googleLink, setGoogleLink] = useState(
    initialPrefill?.google_place_id
      ? `https://www.google.com/maps/place/?q=place_id:${initialPrefill.google_place_id}`
      : (initialGoogleLink ?? "")
  );
  const [note, setNote] = useState("");
  const [city, setCity] = useState(initialPrefill?.city ?? "");
  const [workingHours, setWorkingHours] = useState("");
  const [requiresBooking, setRequiresBooking] = useState("no");
  const [category, setCategory] = useState(
    initialPrefill?.suggested_category ?? "Other"
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  // When we have a prefill payload, treat the form as already previewed —
  // the data was resolved server-side via /resolve.
  const [previewed, setPreviewed] = useState(Boolean(initialPrefill));

  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(
    initialPrefill?.google_place_id ?? null
  );
  const [photoResourceName, setPhotoResourceName] = useState<string | null>(
    initialPrefill?.photo_resource_name ?? null
  );
  const [previewLat, setPreviewLat] = useState<number | null>(
    initialPrefill?.latitude ?? null
  );
  const [previewLng, setPreviewLng] = useState<number | null>(
    initialPrefill?.longitude ?? null
  );
  const [duplicateName, setDuplicateName] = useState<string | null>(() => {
    if (!initialPrefill) return null;
    const existing = existingLocations.find(
      (loc) => loc.google_place_id === initialPrefill.google_place_id
    );
    return existing?.name ?? null;
  });
  const [scheduleDayId, setScheduleDayId] = useState("");

  // Link-entry phase: when linkEntryMode, start in "link" phase until preview completes.
  // When initialPrefill is supplied we're already past the link phase.
  const [linkPhase, setLinkPhase] = useState<"link" | "form">(
    linkEntryMode && !initialGoogleLink && !initialPrefill ? "link" : "form"
  );
  const [linkInput, setLinkInput] = useState("");

  const hasInitialLink = Boolean(initialGoogleLink);

  // Guard against concurrent preview calls for the same URL. React 18 Strict
  // Mode in dev invokes the mount effect twice; without this, we fire two
  // identical /preview requests, and a slow-loser's error can overwrite the
  // winner's success state. Synchronous ref > state so the second call sees
  // the in-flight flag even before React flushes setPreviewLoading.
  const inFlightUrlRef = useRef<string | null>(null);

  async function triggerPreview(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (inFlightUrlRef.current === trimmed) return;
    inFlightUrlRef.current = trimmed;
    setPreviewLoading(true);
    setError(null);
    try {
      const preview = await api.google.previewLocationFromLink({
        google_link: trimmed,
      });
      setPreviewed(true);
      setGooglePlaceId(preview.google_place_id);
      setPhotoResourceName(preview.photo_resource_name);
      setPreviewLat(preview.latitude);
      setPreviewLng(preview.longitude);

      const existing = existingLocations.find(
        (loc) => loc.google_place_id === preview.google_place_id
      );
      if (existing) {
        setDuplicateName(existing.name);
      } else {
        setDuplicateName(null);
      }
      setName((prev) => prev || preview.name);
      if (preview.address) setAddress((prev) => prev || preview.address || "");
      if (preview.city) setCity((prev) => prev || preview.city || "");
      if (preview.suggested_category)
        setCategory((prev) => prev || preview.suggested_category || "");
      // Transition to full form after successful preview in link-entry mode
      if (linkPhase === "link") setLinkPhase("form");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not fetch details from Google"
      );
    } finally {
      setPreviewLoading(false);
      inFlightUrlRef.current = null;
    }
  }

  function handleLinkSubmit() {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    setGoogleLink(trimmed);
    void triggerPreview(trimmed);
  }

  function handleGoogleLinkBlur() {
    if (previewed) return;
    void triggerPreview(googleLink);
  }

  useEffect(() => {
    // Skip the preview fetch when we already have a typeahead-resolved
    // payload — that would be a second Place Details Pro call for the
    // same place_id.
    if (initialPrefill) return;
    if (initialGoogleLink) {
      void triggerPreview(initialGoogleLink);
    }
    // Run once on mount — initialGoogleLink / initialPrefill are stable props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        google_source_type: googlePlaceId ? "manual_url" : null,
        latitude: previewLat,
        longitude: previewLng,
        photo_resource_name: photoResourceName,
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

  const showFieldsReady =
    !hasInitialLink || previewed || (!!error && !previewLoading);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-w-lg gap-0 p-0 focus:outline-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Link-entry phase ── */}
        {linkPhase === "link" && (
          <>
            <DialogHeader className="px-6 pb-0 pt-5">
              <DialogTitle className="text-xl font-bold tracking-tight">
                Paste a Google Maps Link
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                We&#39;ll fetch the details and fill everything in for you.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-5 pt-4">
              {!previewLoading ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2
                      size={14}
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${iconClass}`}
                    />
                    <input
                      type="url"
                      autoFocus
                      placeholder="https://maps.app.goo.gl/..."
                      value={linkInput}
                      onChange={(e) => {
                        setLinkInput(e.target.value);
                        setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleLinkSubmit();
                        }
                      }}
                      autoComplete="off"
                      className={`${fieldInput} pl-9`}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!linkInput.trim()}
                    onClick={handleLinkSubmit}
                    className="shrink-0 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary-strong hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Fetch
                  </button>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-3 py-8"
                >
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                    <Link2 size={18} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Looking up location details…
                  </p>
                  <p className="max-w-xs truncate text-xs text-muted-foreground/60">
                    {linkInput}
                  </p>
                </motion.div>
              )}

              {error && (
                <div className="mt-3">
                  <ErrorBanner message={error} />
                </div>
              )}

              <button
                type="button"
                onClick={() => setLinkPhase("form")}
                className="mt-3 text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                or fill in manually instead →
              </button>
            </div>
          </>
        )}

        {/* ── Full form phase ── */}
        {linkPhase === "form" && (
          <>
            <DialogHeader className="px-6 pb-0 pt-5">
              <DialogTitle className="text-xl font-bold tracking-tight">
                Add Location
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Add a new destination to your curated journey.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="min-w-0 overflow-hidden">
              {/* Pre-filled Google link chip (when opened via link or from link-entry) */}
              {(hasInitialLink || (linkEntryMode && googleLink)) && (
                <div className="mx-6 mt-3 flex items-center gap-2 rounded-full bg-secondary px-3.5 py-2">
                  <Link2 size={14} className={iconClass} />
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {googleLink}
                  </span>
                  <a
                    href={googleLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-full p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    aria-label="Open Google Maps link in new tab"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}

              {duplicateName && (
                <p className="mx-6 mt-2 text-xs font-medium text-amber-600">
                  &quot;{duplicateName}&quot; already exists in this trip.
                </p>
              )}

              {error && (
                <div className="px-6 pt-3">
                  <ErrorBanner message={error} />
                </div>
              )}

              {/* Loading state for Google link preview */}
              {hasInitialLink && previewLoading && (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Looking up location details…
                  </p>
                </div>
              )}

              {/* Fields */}
              {showFieldsReady && (
                <motion.div
                  key="fields"
                  initial={hasInitialLink ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 px-6 pt-3"
                >
                  {/* Row: Location Name + City/Region */}
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-3 min-w-0 space-y-1">
                      <Label htmlFor="add-location-name" className={fieldLabel}>
                        Location name
                      </Label>
                      <div className="relative">
                        <MapPin
                          size={14}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                        />
                        <input
                          id="add-location-name"
                          placeholder="e.g. Fushimi Inari-taisha"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          autoComplete="off"
                          className={`${fieldInput} pl-9`}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 min-w-0 space-y-1">
                      <Label htmlFor="add-location-city" className={fieldLabel}>
                        City / Region
                      </Label>
                      <div className="relative">
                        <Building2
                          size={14}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                        />
                        <input
                          id="add-location-city"
                          placeholder="e.g. Kyoto"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          autoComplete="off"
                          className={`${fieldInput} pl-9`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Full Address */}
                  <div className="space-y-1">
                    <Label
                      htmlFor="add-location-address"
                      className={fieldLabel}
                    >
                      Full address
                    </Label>
                    <div className="relative">
                      <MapPin
                        size={14}
                        className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${iconClass}`}
                      />
                      <input
                        id="add-location-address"
                        placeholder="e.g. 68 Fukakusa Yabunouchicho, Fushimi Ward..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        autoComplete="off"
                        className={`${fieldInput} pl-9`}
                      />
                    </div>
                  </div>

                  {/* Row: Category + Booking */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor="add-location-category"
                        className={fieldLabel}
                      >
                        Category
                      </Label>
                      <div className="relative">
                        <Tag
                          size={14}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                        />
                        <select
                          id="add-location-category"
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
                        htmlFor="add-location-requires-booking"
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
                          id="add-location-requires-booking"
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

                  {/* Google Maps URL (manual entry only) */}
                  {!hasInitialLink && !linkEntryMode && (
                    <div className="space-y-1">
                      <Label
                        htmlFor="add-location-google-link"
                        className={fieldLabel}
                      >
                        Google Maps URL
                      </Label>
                      <div className="relative">
                        <Link2
                          size={14}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${iconClass}`}
                        />
                        <input
                          id="add-location-google-link"
                          type="url"
                          placeholder="Paste link here"
                          value={googleLink}
                          onChange={(e) => {
                            setGoogleLink(e.target.value);
                            setPreviewed(false);
                            setDuplicateName(null);
                          }}
                          onBlur={() => void handleGoogleLinkBlur()}
                          autoComplete="off"
                          className={`${fieldInput} pl-9`}
                        />
                      </div>
                      {previewLoading && (
                        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Loader2 size={10} className="animate-spin" />
                          Fetching details…
                        </p>
                      )}
                    </div>
                  )}

                  {/* Opening Hours */}
                  <div className="space-y-1">
                    <Label
                      htmlFor="add-location-working-hours"
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
                        id="add-location-working-hours"
                        placeholder="e.g. 9:00 AM - 6:00 PM"
                        value={workingHours}
                        onChange={(e) => setWorkingHours(e.target.value)}
                        autoComplete="off"
                        className={`${fieldInput} pl-9`}
                      />
                    </div>
                  </div>

                  {/* Personal Notes */}
                  <div className="space-y-1">
                    <Label htmlFor="add-location-note" className={fieldLabel}>
                      Personal notes
                    </Label>
                    <textarea
                      id="add-location-note"
                      rows={3}
                      placeholder="Mention specific things to see, photo spots, or food recommendations..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={fieldTextarea}
                    />
                  </div>

                  {/* Schedule to day */}
                  {availableDays && availableDays.length > 0 && (
                    <div className="space-y-1">
                      <Label className={fieldLabel}>Schedule to day</Label>
                      {scheduleDayId ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-muted px-2.5 py-1 text-xs font-medium text-brand-strong">
                            <CalendarPlus size={12} />
                            {
                              availableDays.find((d) => d.id === scheduleDayId)
                                ?.label
                            }
                          </span>
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                              className="flex h-9 w-full items-center justify-between rounded-full border border-dashed border-border bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:border-brand/30 hover:bg-brand-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              aria-label="Schedule to day"
                            >
                              <span className="text-xs">
                                Don&apos;t schedule yet
                              </span>
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
                                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                </motion.div>
              )}

              {/* Footer — sticky so buttons stay visible when dialog scrolls */}
              <div className="sticky bottom-0 z-10 mt-3 flex items-center justify-center gap-4 border-t border-border/60 bg-card px-6 py-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-full px-5 py-2.5 text-sm font-medium text-foreground/70 outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Cancel
                </button>
                {showFieldsReady && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-primary px-7 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save Location"}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
