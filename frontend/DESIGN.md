# Design System — shtabtravel

This document is the single reference for UI/UX decisions in shtabtravel. It describes the _what_ and _why_ of visual choices, and points to source files for the _how_. No color codes, font sizes, or pixel values live here — those live in code. This file tells you where to find them and when to use which.

## Visual Identity

### Core Philosophy

The interface must feel effortless, anticipatory, and alive.

Not static. Not mechanical. Every interaction should feel like a natural continuation of the user’s intent — with subtle motion, clear guidance, and zero friction.

**This is not a dashboard. This is a living planning surface.**

### Aesthetic

A warm, minimal travel journal with refined motion and crafted details.

- Modern and clean at first glance
- Rich and tactile on interaction
- Never static, never cluttered

The UI should feel like:

- A premium product (Apple-level polish)
- With personality (travel journal warmth)
- And intelligence (predictive, helpful behavior)

### Key Principles

#### 1. Expressive Simplicity

Simplicity does not mean plain. Avoid generic UI patterns (basic tables, rigid cards, default lists). Every component should feel designed, not assembled.

Use:

- Layered layouts instead of flat containers
- Soft transitions instead of hard state changes
- Visual grouping instead of boxed segmentation

**If something looks like a default component, it’s wrong.**

#### 2. Motion as Guidance (Not Decoration)

Animation is functional, not decorative. It should:

- Guide attention
- Explain state changes
- Reduce cognitive load

Examples:

- Items smoothly reposition instead of jumping
- Selections expand gently instead of switching abruptly
- Routes draw progressively on the map

Motion should feel: fast but not sharp, smooth but not floaty, subtle but noticeable.

#### 3. Anticipation > Control

The UI suggests the next action instead of waiting for input. Reduce visible options — surface the right option.

Examples:

- After adding a place — suggest assigning it to a day inline
- When viewing a day — show nearby saved places immediately
- When building a route — auto-calculate and display results

The system should feel one step ahead — but never intrusive.

#### 4. Fluid Interaction Model

Avoid hard boundaries between sections (places / itinerary / map). Everything should feel connected.

Use:

- Inline editing where possible; reserve modals for confirmations and destructive actions (see [Dialog vs. Sheet](#dialog-vs-sheet))
- Drag, reorder, and adjust directly
- Hover and focus states that reveal depth

The user should feel like they are shaping the plan, not navigating screens.

#### 5. Clear Hierarchy Through Feel, Not Frames

Prefer spacing, scale, and contrast over heavy borders and containers. Structure comes from:

- Spacing
- Scale
- Motion
- Contrast

At any moment: one thing is primary, everything else supports it. **If everything competes, the design failed.**

#### 6. Tactile but Controlled

Texture is subtle and intentional. Never noisy or decorative for its own sake.

Use sparingly:

- Soft grain overlays
- Stamp-like states (e.g., Booked, Planned)
- Light dividers instead of borders

The UI should feel crafted, not styled.

#### 7. Dense Where Needed, Minimal by Default

Default state: calm and focused. On interaction: rich and informative.

Use progressive disclosure:

- Details appear only when relevant
- Complexity is revealed, not shown upfront

#### 8. Speed = Perceived Intelligence

The interface must feel instant. Feedback is immediate:

- Optimistic updates
- Inline results
- No waiting states when avoidable

**Slow UI feels dumb. Fast UI feels like it understands the user.**

### Interaction Model

| State       | Behavior                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| **Default** | Clean, minimal, and suggestive. System highlights the next logical action.                           |
| **Active**  | Context expands smoothly. Details appear inline, not in separate flows.                              |
| **Flow**    | Actions chain naturally: Add → Place → Assign → Route → Done. No forced tab switching. No dead ends. |

### What It Should Feel Like

- Like the UI is responding to you, not waiting
- Like everything is exactly where you expect it
- Like planning is happening in real time

### What It Should NOT Feel Like

- Static lists of cards
- Data tables with filters
- Rigid dashboards
- Click-heavy workflows
- Visually generic SaaS UI

### Product North Star

> _”Planning a trip should feel like arranging ideas in your head — fluid, visual, and effortless.”_

---

## Source of Truth: Where Things Live

All values are defined in code. Never hardcode colors, spacing, or font sizes — use the tokens.

| Concern                                 | Source File                                              | Notes                                                                            |
| --------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Color tokens** (light + dark)         | `src/app/globals.css` `:root` and `.dark`                | HSL CSS variables. All semantic.                                                 |
| **Tailwind color aliases**              | `tailwind.config.ts` → `theme.extend.colors`             | Maps CSS vars to Tailwind classes.                                               |
| **Category colors** (per location type) | `src/lib/location-constants.ts` → `CATEGORY_META`        | 23 categories with bg/text/gradient/hex.                                         |
| **Font**                                | `src/app/layout.tsx`                                     | Inter via `next/font/google`.                                                    |
| **Border radius base**                  | `globals.css` → `--radius`                               | Consumed via `rounded-lg/md/sm`.                                                 |
| **Breakpoints**                         | `tailwind.config.ts` → `screens`                         | Custom: `sidebar: 1024px`. Rest: Tailwind defaults.                              |
| **Grid layouts**                        | `tailwind.config.ts` → `gridTemplateColumns`             | `trip-places` and `trip-itinerary`.                                              |
| **Safe-area insets**                    | `globals.css` `:root` + `tailwind.config.ts` → `spacing` | `pt-safe-t`, `pb-safe-b`, etc.                                                   |
| **Custom animations**                   | `globals.css` `@layer utilities`                         | `page-flip`, `location-highlight`, `topoFloat`.                                  |
| **Shimmer animation**                   | `tailwind.config.ts` → `keyframes` + `animation`         | Loading placeholder.                                                             |
| **Custom CSS classes**                  | `globals.css` `@layer utilities`                         | `ticket-card`, `stamp-badge`, `grain-overlay`, `touch-target`, `scrollbar-hide`. |
| **Button variants**                     | `src/components/ui/button.tsx`                           | CVA: default, destructive, outline, secondary, ghost, link.                      |
| **shadcn/ui components**                | `src/components/ui/`                                     | 11 components (see inventory below).                                             |
| **Hover capability variants**           | `tailwind.config.ts` → `plugins`                         | `hover-none:` (touch) / `hover-hover:` (mouse).                                  |

---

## Color System

### Semantic Tokens

Colors are defined as HSL CSS variables in `globals.css` with light and dark mode variants. Every UI element should use semantic token classes (`bg-background`, `text-foreground`, `bg-card`, `border-border`, etc.), never raw hex/RGB.

**Core palette intent:**

| Token                                    | Role                    | When to Use                                                          |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `background`                             | Page canvas             | Page-level background only.                                          |
| `foreground`                             | Primary text            | Body text, headings.                                                 |
| `card` / `card-foreground`               | Elevated surfaces       | Cards, panels, popover bodies.                                       |
| `primary` / `primary-strong`             | CTA / main action       | Buttons, active states, primary links. Brown tone.                   |
| `brand` / `brand-muted` / `brand-strong` | Secondary accent        | Active tabs, focus rings, selected states, highlights. Forest green. |
| `secondary`                              | Low-emphasis action     | Secondary buttons, toggle backgrounds.                               |
| `muted` / `muted-foreground`             | De-emphasized           | Disabled states, helper text, empty state text.                      |
| `accent`                                 | Tertiary highlight      | Badges, decorative accents. Warm tone.                               |
| `destructive`                            | Danger / error          | Delete buttons, error messages, validation.                          |
| `border` / `input`                       | Borders and form fields | Dividers, card borders, input outlines.                              |
| `ring`                                   | Focus indicator         | Keyboard focus rings. Same hue as `brand`.                           |

**Never** use `primary` where `brand` is intended or vice versa. Primary (brown) is for CTAs and action elements. Brand (green) is for selection states, active indicators, and the app's identity color.

### Specialized Palettes

These are domain-specific and live alongside the core tokens in `globals.css`:

| Palette            | Purpose                                             | Tokens                                       |
| ------------------ | --------------------------------------------------- | -------------------------------------------- |
| **Time periods**   | Morning/afternoon/evening/night badges in itinerary | `time-{period}-{bg\|text\|border}`           |
| **Routes**         | Distinguish up to 5 routes on the map               | `route-{1-5}`                                |
| **Booking status** | Done vs. pending badges                             | `booking-{done\|pending}-{bg\|text\|border}` |

### Category Colors

Location categories (Museum, Restaurant, Beach, etc.) each have their own color defined in `CATEGORY_META` in `location-constants.ts`. These use **Tailwind utility classes** (e.g., `bg-slate-100 text-slate-700`) rather than CSS variables, because they map to the 23 fixed category types and don't need light/dark switching at the variable level.

---

## Typography

**Font:** Inter (Google Fonts), loaded via `next/font` with `--font-sans` CSS variable.

**Scale:** Tailwind defaults. No custom typography scale — rely on `text-xs` through `text-2xl` as needed. General conventions:

- Body text: `text-sm` on desktop, responsive up to `text-base` on mobile inputs (prevents iOS zoom on focus)
- Page headings: `text-lg` or `text-xl`, `font-semibold`
- Section labels: `text-sm font-medium text-muted-foreground`
- Card titles: `text-sm font-medium` or `text-base font-semibold`
- Tiny metadata: `text-xs text-muted-foreground`

**Line length:** No explicit `max-w-prose` is enforced globally, but card-based layout naturally constrains line length. For any full-width text blocks, aim for 65-75 characters per line.

---

## Component Inventory

### shadcn/ui Primitives (`src/components/ui/`)

| Component        | Customizations                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `button`         | CVA variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon. |
| `card`           | CardHeader, CardContent subcomponents.                                                             |
| `dialog`         | Safe-area aware, `100dvh` dynamic viewport, animated overlay/content.                              |
| `sheet`          | Bottom-sheet drawer with `keepMounted` (for MapLibre), `scrollLocked` for gesture children.        |
| `popover`        | Responsive width `w-[min(18rem,calc(100vw-2rem))]`.                                                |
| `input`          | Ring states, responsive text sizing.                                                               |
| `label`          | Radix label wrapper.                                                                               |
| `confirm-dialog` | Preset confirmation variant of dialog.                                                             |
| `date-picker`    | Calendar-based date selection.                                                                     |
| `calendar`       | Calendar grid component.                                                                           |
| `progress`       | Linear bar with brand color, 500ms ease-out fill animation.                                        |

### Custom Visual Classes (defined in `globals.css`)

| Class                              | What It Does                                                            | When to Use                                       |
| ---------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `ticket-card`                      | Plane ticket visual: dashed left border, circular perforation on right. | Itinerary day cards in the timeline rail.         |
| `ticket-card[aria-current="date"]` | Active day: brand-muted background, brand ring + glow.                  | The currently selected day in `ItineraryDayRail`. |
| `stamp-badge`                      | Rotated circle badge with uppercase text and border.                    | Decorative labels (day numbers, status badges).   |
| `grain-overlay`                    | Film grain texture via SVG noise, `::before` pseudo.                    | Cards or surfaces that need analog texture.       |
| `touch-target`                     | Invisible 44x44 hit area via `::after` pseudo.                          | Any button visually smaller than 44px.            |
| `scrollbar-hide`                   | Hides scrollbars cross-browser.                                         | Horizontal scroll rails, overflow containers.     |
| `date-input-branded`               | Brand-colored accent for native date pickers.                           | `InlineDateInput` component.                      |

---

## Layout Patterns

### Responsive Strategy

- **Breakpoint:** The primary layout shift happens at `sidebar: 1024px` (aliased in Tailwind config).
- **Below sidebar:** Single column. Maps and detail panels become bottom sheets (`Sheet` component).
- **Above sidebar:** Two-column grid. Sidebar is a sticky column. Uses named grid templates (`grid-cols-trip-places`, `grid-cols-trip-itinerary`).

### Mobile-First Conventions

- Safe-area insets handled via CSS env variables + Tailwind utilities (`pt-safe-t`, `pb-safe-b`).
- Dialogs use `100dvh` (dynamic viewport height) to account for mobile browser chrome.
- Touch targets enforced at 44x44 via the `touch-target` utility class.
- Hover affordances gated behind `hover-hover:` variant. Touch devices show them always via `hover-none:`.

### Dialog vs. Sheet

| Use Case                              | Component                  | Why                                               |
| ------------------------------------- | -------------------------- | ------------------------------------------------- |
| Confirmation, simple form, alert      | `Dialog`                   | Centered overlay. Brief interaction.              |
| Map, scrollable list, multi-step form | `Sheet`                    | Bottom drawer. Supports gestures, scroll locking. |
| Detail panel with map child           | `Sheet` with `keepMounted` | MapLibre GL instances must not unmount.           |

---

## Animation Conventions

Full animation philosophy is in `.claude/skills/animations-skill/SKILL.md`. This section pins down what applies to shtabtravel specifically.

### Decision Framework

Before adding any animation, answer: **how often will the user see this?**

| Frequency                                         | Rule                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| 100+ times/day (keyboard shortcuts, tab switches) | No animation.                                  |
| Tens of times/day (hover states, list navigation) | Minimal: color/opacity transition only, 150ms. |
| Occasional (modals, drawers, toasts)              | Standard: 200-300ms, ease-out.                 |
| Rare/first-time (onboarding, empty states)        | Can add delight (stagger, spring).             |

### Standard Durations (established in codebase)

| Element                   | Duration | Easing                       | Example                                      |
| ------------------------- | -------- | ---------------------------- | -------------------------------------------- |
| Hover/focus color changes | `150ms`  | `ease` / `transition-colors` | Button hover, link underline.                |
| Page entrance             | `250ms`  | `ease-out`                   | `animate-page-flip` (4px translateY + fade). |
| Progress bar fill         | `500ms`  | `ease-out`                   | Route calculation progress.                  |
| Location highlight pulse  | `2s`     | `ease-out`                   | Map pin → card highlight.                    |
| Shimmer loading           | `1.5s`   | `ease-in-out infinite`       | Skeleton placeholders.                       |

### Rules

1. **Never `transition: all`.** Specify exact properties: `transition-colors`, `transition-transform`, `transition-opacity`.
2. **Never `scale(0)`.** Start from `scale(0.95)` with `opacity: 0`.
3. **Never `ease-in` on UI elements.** Use `ease-out` for enter, `ease-in-out` for on-screen movement.
4. **Respect `prefers-reduced-motion`.** The global safety net in `globals.css` flattens all durations. Individual animations should also have their own overrides for graceful degradation.
5. **Popovers scale from trigger.** Use `transform-origin: var(--radix-popover-content-transform-origin)`. Modals stay centered.
6. **Gate hover animations** behind `@media (hover: hover) and (pointer: fine)` or the Tailwind `hover-hover:` variant.

### Motion Library

`motion` (Framer Motion successor) is available for spring animations and gesture handling. Use it for:

- Drag interactions with momentum
- Interruptible animations
- Layout animations

Prefer CSS transitions for simple state changes. Use `motion` only when CSS can't handle the interaction (drag, spring physics, shared layout).

---

## Accessibility

### Non-Negotiable

- **Touch targets:** 44x44 minimum. Use `touch-target` class for visually small buttons.
- **Color contrast:** 4.5:1 for normal text, 3:1 for large text. The warm palette was chosen with this in mind.
- **Focus rings:** Visible on all interactive elements. Ring color = `brand` hue.
- **Keyboard navigation:** Tab order matches visual order. Map pins are `role="button" tabindex="0"` with `.map-pin-focusable:focus-visible` styling.
- **Reduced motion:** Global safety net + per-animation overrides. Never rely on animation to convey information.
- **No `userScalable: false`:** Viewport allows zoom up to 5x.
- **Form labels:** Every input has a `<label>` via Radix Label.

### Icon-Only Buttons

Must have `aria-label`. Use `lucide-react` icons exclusively — no emojis as UI icons, no mixing icon libraries.

---

## Do's and Don'ts

### Do

- Use semantic color tokens (`bg-primary`, `text-muted-foreground`) — never raw hex.
- Use `cn()` (from `lib/utils.ts`) for all className composition — it handles Tailwind merge.
- Apply `touch-target` to any interactive element smaller than 44px.
- Test both light and dark mode.
- Test at 375px, 768px, and 1024px+ widths.
- Use the `hover-none:` / `hover-hover:` variants for hover affordances.

### Don't

- Don't show the same icon twice (e.g., category icon circle + category badge icon in the same row).
- Don't use `z-index` without checking the existing scale. Current usage: MapLibre popups at `z-index: 20`.
- Don't animate keyboard-triggered actions.
- Don't add new color variables — use existing tokens. If a new semantic color is truly needed, add it to `globals.css` with both light and dark variants.
- Don't use `position: fixed` without accounting for safe-area insets.
- Don't bypass the `Sheet` component for mobile overlays — it handles scroll locking and gesture dismissal.

---

## Pre-Delivery Checklist

Before delivering any UI change:

- [ ] Uses semantic color tokens, not hardcoded values
- [ ] Works in both light and dark mode
- [ ] Responsive at mobile (375px), tablet (768px), and desktop (1024px+)
- [ ] Touch targets are 44x44 minimum (use `touch-target` class)
- [ ] Hover states gated behind `hover-hover:` variant
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Icon-only buttons have `aria-label`
- [ ] No duplicate icons in the same visual context
- [ ] No `transition: all` — exact properties specified
- [ ] `cn()` used for className composition
