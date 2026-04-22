"use client";

import { CategoryIcon } from "@/components/locations/CategoryIcon";
import {
  CATEGORY_OPTIONS,
  CATEGORY_META,
  type CategoryKey,
} from "@/lib/location-constants";

// Inject keyframe once — markers render inside imperatively-created React
// roots outside the normal DOM tree, so Tailwind @keyframes won't reach them.
if (
  typeof document !== "undefined" &&
  !document.getElementById("marker-pulse-keyframes")
) {
  const style = document.createElement("style");
  style.id = "marker-pulse-keyframes";
  style.textContent = [
    `@keyframes marker-breathe{0%,100%{transform:scale(1.06)}50%{transform:scale(1.14)}}`,
    `@media(prefers-reduced-motion:reduce){.marker-breathe{animation:none!important;transform:scale(1.1)!important}}`,
  ].join("");
  document.head.appendChild(style);
}

function getCategoryColors(category: string | null | undefined): {
  text: string;
} {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const meta = CATEGORY_META[categoryKey];
  return { text: meta.hexText };
}

export interface MapMarkerContentProps {
  category: string | null | undefined;
  name: string;
  isOpen?: boolean;
  isSelected?: boolean;
  isHovered?: boolean;
}

export function MapMarker({
  category,
  name,
  isOpen,
  isSelected,
  isHovered,
}: MapMarkerContentProps) {
  const categoryKey: CategoryKey =
    category && CATEGORY_OPTIONS.includes(category as CategoryKey)
      ? (category as CategoryKey)
      : "Other";
  const colors = getCategoryColors(category);
  // Show label on hover only — hide when popup card is open to avoid overlap
  const showLabel = isHovered && !isOpen;
  const active = isOpen || isSelected;

  const highlighted = isHovered && !active;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        // Outer wrapper is transparent to pointer events; only the pin body
        // below catches them. This keeps the hit area small and stable when
        // pins are close together, so hover switches feel responsive.
        pointerEvents: "none",
        filter:
          active || highlighted
            ? "drop-shadow(0 2px 8px rgba(0,0,0,.3))"
            : "drop-shadow(0 1px 4px rgba(0,0,0,.18))",
        transition: "filter 200ms ease-out",
      }}
      title={name}
    >
      {/* Label pill — absolutely positioned so it never inflates the hit
          area or blocks hover on neighbouring pins. */}
      {showLabel && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: "white",
            border: `1.5px solid ${colors.text}`,
            whiteSpace: "nowrap",
          }}
        >
          <CategoryIcon
            category={categoryKey}
            size={12}
            className="shrink-0"
            style={{ color: colors.text }}
          />
          <span
            className="max-w-[120px] truncate text-[11px] font-semibold leading-none"
            style={{ color: colors.text }}
          >
            {name}
          </span>
        </div>
      )}
      {/* Pin body — teardrop with category icon. Only element that captures
          pointer events (cursor + clicks). */}
      <div
        className={
          highlighted
            ? "marker-breathe relative flex cursor-pointer items-center justify-center"
            : "relative flex cursor-pointer items-center justify-center"
        }
        style={{
          width: 34,
          height: 40,
          pointerEvents: "auto",
          ...(highlighted
            ? { animation: "marker-breathe 1.5s ease-in-out infinite" }
            : {
                transform: active ? "scale(1.2)" : "scale(1)",
                transition: "transform 150ms cubic-bezier(0.25, 1, 0.5, 1)",
              }),
        }}
      >
        <svg
          viewBox="0 0 34 40"
          width="34"
          height="40"
          className="absolute inset-0"
        >
          <path
            d="M17 39C17 39 32 23.5 32 14.5C32 6.492 25.284 0.5 17 0.5C8.716 0.5 2 6.492 2 14.5C2 23.5 17 39 17 39Z"
            fill={active || highlighted ? colors.text : "white"}
            stroke={colors.text}
            strokeWidth={active || highlighted ? "0" : "1.5"}
          />
        </svg>
        <div
          className="relative z-10 flex items-center justify-center"
          style={{ marginBottom: 8 }}
        >
          <CategoryIcon
            category={categoryKey}
            size={16}
            className="shrink-0"
            style={{ color: active || highlighted ? "white" : colors.text }}
          />
        </div>
      </div>
    </div>
  );
}
