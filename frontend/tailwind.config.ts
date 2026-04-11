import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Semantic alias for the mobile↔desktop sidebar cutover.
      // Same value as Tailwind's default `lg` (1024px), but named so it's
      // obvious at call sites that this is the breakpoint at which the
      // sidebar flips from bottom-sheet (mobile) to sticky column (desktop).
      screens: {
        sidebar: "1024px",
      },
      spacing: {
        // Safe-area inset tokens. Compose with Tailwind utilities:
        //   `pt-safe-t` → padding-top: env(safe-area-inset-top)
        //   `pb-safe-b` → padding-bottom: env(safe-area-inset-bottom)
        //   `md:mt-safe-t` etc.
        // Variables are declared in `globals.css` at `:root`.
        "safe-t": "var(--safe-top)",
        "safe-b": "var(--safe-bottom)",
        "safe-l": "var(--safe-left)",
        "safe-r": "var(--safe-right)",
      },
      gridTemplateColumns: {
        // Named grid templates for the two trip-body sidebar layouts.
        // Use as `lg:grid-cols-trip-places` / `lg:grid-cols-trip-itinerary`.
        // Replaces the fragile arbitrary classes
        // `xl:grid-cols-[minmax(0,1fr)_480px]` / `[minmax(0,1fr)_320px]`
        // used by the pre-mobile layout — safer for JIT regeneration and
        // discoverable in one place when adjusting sidebar widths.
        "trip-places": "minmax(0, 1fr) 480px",
        "trip-itinerary": "minmax(0, 1fr) 320px",
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          strong: "hsl(var(--primary-strong) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "hsl(var(--brand) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
          muted: "hsl(var(--brand-muted) / <alpha-value>)",
          strong: "hsl(var(--brand-strong) / <alpha-value>)",
        },
        time: {
          morning: {
            bg: "hsl(var(--time-morning-bg) / <alpha-value>)",
            text: "hsl(var(--time-morning-text) / <alpha-value>)",
            border: "hsl(var(--time-morning-border) / <alpha-value>)",
          },
          afternoon: {
            bg: "hsl(var(--time-afternoon-bg) / <alpha-value>)",
            text: "hsl(var(--time-afternoon-text) / <alpha-value>)",
            border: "hsl(var(--time-afternoon-border) / <alpha-value>)",
          },
          evening: {
            bg: "hsl(var(--time-evening-bg) / <alpha-value>)",
            text: "hsl(var(--time-evening-text) / <alpha-value>)",
            border: "hsl(var(--time-evening-border) / <alpha-value>)",
          },
          night: {
            bg: "hsl(var(--time-night-bg) / <alpha-value>)",
            text: "hsl(var(--time-night-text) / <alpha-value>)",
            border: "hsl(var(--time-night-border) / <alpha-value>)",
          },
        },
        route: {
          1: "hsl(var(--route-1) / <alpha-value>)",
          2: "hsl(var(--route-2) / <alpha-value>)",
          3: "hsl(var(--route-3) / <alpha-value>)",
          4: "hsl(var(--route-4) / <alpha-value>)",
          5: "hsl(var(--route-5) / <alpha-value>)",
        },
        booking: {
          done: {
            bg: "hsl(var(--booking-done-bg) / <alpha-value>)",
            text: "hsl(var(--booking-done-text) / <alpha-value>)",
            border: "hsl(var(--booking-done-border) / <alpha-value>)",
          },
          pending: {
            bg: "hsl(var(--booking-pending-bg) / <alpha-value>)",
            text: "hsl(var(--booking-pending-text) / <alpha-value>)",
            border: "hsl(var(--booking-pending-border) / <alpha-value>)",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [
    // Hover-capability variants.
    //
    // `hover-none:`  → `@media (hover: none)`   (touch devices: phones, tablets)
    // `hover-hover:` → `@media (hover: hover)`  (mouse/trackpad devices: desktop)
    //
    // Usage: invert hover-only affordances so they're always visible on
    // touch, but hidden-until-hover on desktop. Example from Phase 2:
    //   opacity-0 hover-none:opacity-100 hover-hover:group-hover:opacity-100
    // means "invisible by default, visible on touch, revealed on desktop
    // hover". Pure CSS — no JS detection, no hydration mismatch.
    //
    // Trackpad-with-touch hybrids (modern iPads with Magic Keyboard,
    // Surface) correctly report `hover: hover` and get the desktop
    // treatment, which is what we want.
    plugin(({ addVariant }) => {
      addVariant("hover-none", "@media (hover: none)");
      addVariant("hover-hover", "@media (hover: hover)");
    }),
  ],
};

export default config;
