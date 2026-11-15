"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { claimEscape } from "@/components/ui/overlay"

/**
 * The styled tooltip (tooltip wave → subtlety round, owner 2026-09-25):
 * the popover surface, 12px, minimal padding, no arrow (nothing purely
 * decorative). Opens after
 * a 500ms rest, so tooltips appear when you pause on a control, never in
 * passing; disableHoverableContent means the chip is un-hoverable — the
 * instant the cursor leaves the trigger it's gone, even mid-move onto the
 * chip's own pixels.
 */

/** The rest delay (ms): shared by hover and focus opens. */
export const TOOLTIP_DELAY_MS = 500

function TooltipProvider({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // An open tooltip is the topmost Radix layer (a trigger refocused as
        // its popover closes shows one), so it takes that Esc like any layer
        // (overlay.md) instead of letting it abort the turn.
        onEscapeKeyDown={claimEscape(onEscapeKeyDown)}
        className={cn(
          "w-fit origin-(--radix-tooltip-content-transform-origin) animate-in text-balance fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          // The popover surface with a hairline edge, at z 80 so a hint inside
          // a menu or popover (z 70, overlay.ts) draws above it.
          "z-80 flex items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-callout system-current:text-label text-popover-foreground shadow-md",
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }