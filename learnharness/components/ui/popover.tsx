"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { OVERLAY_ATTRS, OVERLAY_LAYER, OVERLAY_MOTION, claimEscape } from "@/components/ui/overlay"

/** shadcn popover on the Proposed tokens (spec: popover.md). */

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/** The raised surface: popover fill, 1px edge, radius 12, padding 16, 13px.
 *  A picker (Command inside) passes `p-1` and its own width. */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        {...OVERLAY_ATTRS}
        align={align}
        sideOffset={sideOffset}
        onEscapeKeyDown={claimEscape(onEscapeKeyDown)}
        className={cn(
          OVERLAY_LAYER,
          OVERLAY_MOTION,
          "w-72 origin-(--radix-popover-content-transform-origin) rounded-xl border bg-popover p-4 text-row text-popover-foreground shadow-lg outline-none",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
}

/** 13/18 at 600. */
function PopoverTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("text-row font-semibold text-foreground", className)}
      {...props}
    />
  )
}

/** 12/16, muted. */
function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-label text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
