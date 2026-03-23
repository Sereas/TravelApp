"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Resize an image to max width and compress as WebP (JPEG fallback).
 *  Falls back to the original file if resize fails (e.g. in test environments). */
async function resizeImage(file: File): Promise<File> {
  return new Promise<File>((resolve) => {
    const img = new Image();
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(file);
      return;
    }

    // Timeout fallback: if neither onload nor onerror fires (jsdom), resolve with original
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(file);
    }, 500);

    img.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      // Skip resize if already small enough
      if (img.width <= RESIZE_MAX_WIDTH) {
        resolve(file);
        return;
      }
      const scale = RESIZE_MAX_WIDTH / img.width;
      const width = RESIZE_MAX_WIDTH;
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Try WebP first, fallback to JPEG
      const outputType = "image/webp";
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            canvas.toBlob(
              (jpegBlob) => {
                if (!jpegBlob) {
                  resolve(file);
                  return;
                }
                resolve(
                  new File([jpegBlob], file.name.replace(/\.\w+$/, ".jpg"), {
                    type: "image/jpeg",
                  })
                );
              },
              "image/jpeg",
              RESIZE_QUALITY
            );
            return;
          }
          resolve(
            new File([blob], file.name.replace(/\.\w+$/, ".webp"), {
              type: outputType,
            })
          );
        },
        outputType,
        RESIZE_QUALITY
      );
    };
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

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
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const optimized = await resizeImage(selectedFile);
      await onUpload(optimized);
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

  const displayImage = preview ?? currentImageUrl;
  const busy = uploading || resetting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Location Photo</DialogTitle>
        </DialogHeader>

        {/* Current/preview image */}
        {displayImage && (
          <div className="overflow-hidden rounded-lg">
            <img
              src={displayImage}
              alt="Location photo preview"
              className="h-48 w-full object-cover"
            />
          </div>
        )}

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragOver
              ? "border-brand-green bg-brand-green-light"
              : "border-warm-border hover:border-brand-green hover:bg-brand-green-light/50"
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
          <Upload size={24} className="text-content-muted" />
          <p className="text-sm text-content-muted">
            Drop an image here, click to browse, or{" "}
            <span className="font-medium text-content-primary">
              paste from clipboard
            </span>
          </p>
          <p className="text-[11px] text-content-muted/60">
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
            disabled={!selectedFile || busy}
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
