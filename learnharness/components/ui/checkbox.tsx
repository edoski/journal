"use client"

import * as React from "react"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** shadcn checkbox on the Proposed tokens (spec: checkbox.md): a 16px box at
 *  radius 4, a muted ring when clear, the accent with a white check when
 *  checked, a dash when indeterminate. */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox flex size-4 shrink-0 items-center justify-center rounded-[4px] text-primary-foreground ring-1 ring-muted-foreground ring-inset outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-danger data-[state=checked]:bg-primary data-[state=checked]:ring-0 data-[state=indeterminate]:bg-primary data-[state=indeterminate]:ring-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
      >
        <CheckIcon strokeWidth={3} className="size-3 group-data-[state=indeterminate]/checkbox:hidden" />
        <MinusIcon strokeWidth={3} className="hidden size-3 group-data-[state=indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
