import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva("", {
  variants: {
    variant: {
      default: [
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-body system-current:text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
      ],
      // A borderless field that sits in a list like a row: 32px, radius 8,
      // the 13px row text, a hover fill and the 2px focus ring.
      quiet:
        "h-8 w-full min-w-0 rounded-md border-0 bg-transparent px-2 text-body system-current:text-row text-foreground outline-none transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
      // The settings rows' field (settings.md): 28px, radius 8, the input
      // edge, 13px, the 2px focus ring.
      sm:
        "h-7 min-w-0 rounded-md border border-input bg-transparent px-2 text-body system-current:text-row text-foreground outline-none transition-colors selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
    },
  },
  defaultVariants: { variant: "default" },
})

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
