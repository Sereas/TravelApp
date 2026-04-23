"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Camera, ImageOff, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImageCropData } from "@/lib/api/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const RESIZE_MAX_WIDTH = 1600; // Full image for lightbox (higher than old 800 since no crop)
const RESIZE_QUALITY = 0.82;
const CROP_ASPECT = 16 / 10; // Matches LocationCard aspect-[16/10]

// ---------------------------------------------------------------------------
// Image utilities
// ---------------------------------------------------------------------------

/** Resize the full image to max width — no cropping. Cropping is CSS-only on display. */
async function resizeOnly(imageSrc: string): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      if (img.width > RESIZE_MAX_WIDTH) {
        const scale = RESIZE_MAX_WIDTH / img.width;
        canvas.width = RESIZE_MAX_WIDTH;
        canvas.height = Math.round(img.height * scale);
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], "photo.webp", { type: "image/webp" }));
            return;
          }
          canvas.toBlob(
            (jpegBlob) => {
              if (jpegBlob) {
                resolve(
                  new File([jpegBlob], "photo.jpg", { type: "image/jpeg" })
                );
              } else {
                reject(new Error("Failed to export image"));
              }
            },
            "image/jpeg",
            RESIZE_QUALITY
          );
        },
        "image/webp",
        RESIZE_QUALITY
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PhotoUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentImageUrl: string | null;
  hasUserOverride: boolean;
  /** Receives the full resized image and the crop region percentages. */
  onUpload: (file: File, cropData: ImageCropData) => Promise<void>;
  onReset: () => Promise<void>;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Only JPEG, PNG, and WebP images are allowed.";
  }
  if (file.size > MAX_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 5 MB.`;
  }
  return null;
}

export function PhotoUploadDialog({
  open,
  onOpenChange,
  currentImageUrl,
  hasUserOverride,
  onUpload,
  onReset,
}: PhotoUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Crop state — capture percentage-based area for CSS background-position
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPct, setCroppedAreaPct] = useState<Area | null>(null);

  const onCropComplete = useCallback((areaPct: Area, _areaPixels: Area) => {
    setCroppedAreaPct(areaPct);
  }, []);

  // Clean up preview URL on unmount or file change
  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setError(null);
      setUploading(false);
      setResetting(false);
      setDragOver(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPct(null);
    }
  }, [open]);

  const handleFileSelected = useCallback((file: File) => {
    const err = validateFile(file);
    if (err) {
      setError(err);
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPct(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelected(file);
    },
    [handleFileSelected]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (!open) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFileSelected(file);
            return;
          }
        }
      }
    },
    [open, handleFileSelected]
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  async function handleUpload() {
    if (!selectedFile || !preview || !croppedAreaPct) return;
    setUploading(true);
    setError(null);
    try {
      const resized = await resizeOnly(preview);
      const cropData: ImageCropData = {
        x: croppedAreaPct.x,
        y: croppedAreaPct.y,
        width: croppedAreaPct.width,
        height: croppedAreaPct.height,
      };
      await onUpload(resized, cropData);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      await onReset();
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Reset failed. Please try again."
      );
    } finally {
      setResetting(false);
    }
  }

  const busy = uploading || resetting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Location Photo</DialogTitle>
        </DialogHeader>

        {/* Crop area — shown when a file is selected */}
        {preview ? (
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
            <Cropper
              image={preview}
              crop={crop}
              zoom={zoom}
              aspect={CROP_ASPECT}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
              showGrid={false}
              style={{
                containerStyle: {
                  borderRadius: "0.5rem",
                },
                cropAreaStyle: {
                  border: "2px solid rgba(255,255,255,0.6)",
                  borderRadius: "0.5rem",
                },
              }}
            />
            <p className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80 backdrop-blur-sm">
              Drag to reposition &middot; Scroll to zoom
            </p>
          </div>
        ) : (
          /* Current image preview (no file selected yet) */
          currentImageUrl && (
            <div className="overflow-hidden rounded-lg">
              <img
                src={currentImageUrl}
                alt="Current location photo"
                className="aspect-[16/10] w-full object-cover"
              />
            </div>
          )
        )}

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragOver
              ? "border-brand bg-brand-muted"
              : "border-border hover:border-brand hover:bg-brand-muted/50"
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          data-testid="drop-zone"
        >
          <Upload size={24} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop an image here, click to browse, or{" "}
            <span className="font-medium text-foreground">
              paste from clipboard
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            JPEG, PNG, or WebP &middot; Max 5 MB &middot; Auto-resized for fast
            loading
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
            data-testid="file-input"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {hasUserOverride && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={busy}
              className="mr-auto"
            >
              {resetting ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <ImageOff size={14} className="mr-1.5" />
              )}
              Reset to Google photo
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || !croppedAreaPct || busy}
          >
            {uploading ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Camera size={14} className="mr-1.5" />
            )}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
