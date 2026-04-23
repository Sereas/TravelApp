import type { CSSProperties } from "react";
import type { ImageCropData } from "@/lib/api/types";

/**
 * Convert crop metadata (percentages 0-100 of the natural image) into
 * CSS `background-size` + `background-position` for a container that
 * shows only the cropped region.
 *
 * Uses a `<div>` with `background-image` instead of `<img>` to avoid
 * Tailwind preflight's `img { max-width: 100% }` clamping the scale.
 */
export function cropToBgStyle(
  imageUrl: string,
  crop: ImageCropData
): CSSProperties {
  const posX = crop.width >= 100 ? 0 : (crop.x / (100 - crop.width)) * 100;
  const posY = crop.height >= 100 ? 0 : (crop.y / (100 - crop.height)) * 100;

  return {
    backgroundImage: `url("${imageUrl.replace(/["\\]/g, "\\$&")}")`,
    backgroundSize: `${(100 / crop.width) * 100}% ${(100 / crop.height) * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat: "no-repeat",
  };
}
