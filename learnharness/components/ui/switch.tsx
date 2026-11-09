"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** shadcn switch on the Proposed tokens (spec: switch.md): a 32 × 20 track
 *  with a 16px disc inset 2. On is the grey track with the white disc (owner,
 *  2026-09-20: never a bright track); off is the input track with a muted disc. */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-5 w-8 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-muted-foreground data-[state=unchecked]:bg-input motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-foreground data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-muted-foreground motion-reduce:transition-none"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
