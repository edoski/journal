import * as React from "react"

import { cn } from "@/lib/utils"

/** shadcn textarea on the Proposed tokens (only Proposed code imports it):
 *  radius 8, the input edge, 13px, the 2px focus ring. It grows with its
 *  text unless the caller fixes a height. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-body system-current:text-row text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
