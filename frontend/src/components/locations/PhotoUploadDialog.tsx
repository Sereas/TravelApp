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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const RESIZE_MAX_WIDTH = 800; // 2x retina for ~400px card width
const RESIZE_QUALITY = 0.82;
const CROP_ASPECT = 16 / 10; // Matches LocationCard aspect-[16/10]

// ---------------------------------------------------------------------------
// Image utilities
// ---------------------------------------------------------------------------

/** Crop an image to the given pixel area, then resize to max width. */
async function cropAndResize(imageSrc: string, cropArea: Area): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Step 1: Crop to selected area
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropArea.width;
      cropCanvas.height = cropArea.height;
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      cropCtx.drawImage(
        img,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height
      );

      // Step 2: Resize if wider than max
      let finalCanvas = cropCanvas;
      if (cropArea.width > RESIZE_MAX_WIDTH) {
        const scale = RESIZE_MAX_WIDTH / cropArea.width;
        const resizeCanvas = document.createElement("canvas");
        resizeCanvas.width = RESIZE_MAX_WIDTH;
        resizeCanvas.height = Math.round(cropArea.height * scale);
        const resizeCtx = resizeCanvas.getContext("2d");
        if (resizeCtx) {
          resizeCtx.drawImage(
            cropCanvas,
            0,
            0,
            resizeCanvas.width,
            resizeCanvas.height
          );
          finalCanvas = resizeCanvas;
        }
      }

      // Step 3: Export as WebP, fallback to JPEG
      finalCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], "photo.webp", { type: "image/webp" }));
            return;
          }
          finalCanvas.toBlob(
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
  onUpload: (file: File) => Promise<void>;
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

  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
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
      setCroppedAreaPixels(null);
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
    setCroppedAreaPixels(null);
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
    if (!selectedFile || !preview || !croppedAreaPixels) return;
    setUploading(true);
    setError(null);
    try {
      const cropped = await cropAndResize(preview, croppedAreaPixels);
      await onUpload(cropped);
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
            disabled={!selectedFile || !croppedAreaPixels || busy}
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
