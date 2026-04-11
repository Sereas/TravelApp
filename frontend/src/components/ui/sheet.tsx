"use client";

/**
 * Bottom-sheet primitive.
 *
 * Built on top of Radix Dialog (already a dep) — NOT vaul. Radix handles
 * focus trap, Escape, scroll lock, portal, overlay, orientation change,
 * and controlled/uncontrolled state. The only thing we override is the
 * visual positioning: content is anchored to the bottom of the viewport,
 * full width, rounded on top, with a grab handle pill.
 *
 * Key options for the Phase 3 mobile sidebar map:
 *
 * - `keepMounted` — when `true`, forwards `forceMount` to Radix Content
 *   and uses `data-[state=closed]:hidden` to CSS-toggle visibility rather
 *   than unmounting. This is critical for MapLibre: remounting costs
 *   ~200–400ms on mid-range Android. With `keepMounted`, the map stays
 *   alive in the DOM across sheet open/close cycles.
 *
 * - `scrollLocked` — when `true`, applies `touch-none overflow-hidden` to
 *   the content so a child map's gesture handlers don't fight the sheet's
 *   own scroll. Used when the sheet body is the map itself.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;

const SheetTrigger = DialogPrimitive.Trigger;

const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /**
   * Keep the Radix Content mounted when the sheet is closed. Uses
   * `forceMount` under the hood and relies on
   * `data-[state=closed]:hidden` to toggle visibility without tearing
   * down children. Use for expensive children (MapLibre) where remount
   * cost is prohibitive.
   */
  keepMounted?: boolean;
  /**
   * Disable body scroll inside the sheet. Needed when the sheet body is
   * a map or other gesture-heavy child that should receive all touch
   * events itself (otherwise the sheet container's own scroll intercepts
   * vertical pans that the map wanted).
   */
  scrollLocked?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, keepMounted, scrollLocked, ...props }, ref) => (
  <SheetPortal forceMount={keepMounted ? true : undefined}>
    <SheetOverlay forceMount={keepMounted ? true : undefined} />
    <DialogPrimitive.Content
      ref={ref}
      forceMount={keepMounted ? true : undefined}
      className={cn(
        // Bottom-anchored, full-width, rounded-top sheet.
        // - `fixed bottom-0 left-0 right-0 w-full max-w-full` — pin to
        //   the viewport bottom, edge to edge.
        // - `max-h-[90dvh]` — cap at 90% of the dynamic viewport height.
        //   `dvh` correctly shrinks when the iOS Safari URL bar appears.
        // - `rounded-t-2xl` — top corners only (not bottom).
        // - `pb-safe-b` — absorb the home-indicator safe-area by default.
        //   Every sheet consumer is automatically safe-area correct.
        // - `data-[state=*]` — slide-from-bottom animations via Radix.
        "fixed bottom-0 left-0 right-0 z-50 flex w-full max-w-full flex-col gap-2 border-t border-border bg-card pb-safe-b shadow-xl duration-200 max-h-[90dvh] rounded-t-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        keepMounted && "data-[state=closed]:hidden",
        scrollLocked && "touch-none overflow-hidden",
        !scrollLocked && "overflow-y-auto",
        className
      )}
      {...props}
    >
      {/* Grab handle pill — visual affordance that this is a bottom sheet
       *  that can be dismissed. Non-interactive; dismiss via the X or
       *  overlay tap. Swipe-to-dismiss is not implemented in v1. */}
      <div
        aria-hidden="true"
        className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border"
      />
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 cursor-pointer rounded-full p-1 text-muted-foreground transition-colors duration-150 hover:bg-brand-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1.5 px-5 pt-5", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-bold tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
