"use client"

import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** One colour to pick: its name, read aloud, and the CSS colour it paints. */
export interface Swatch {
  name: string
  color: string
}

/** A grid of colour swatches to pick one from (spec: swatch-grid.md),
 *  Radix's single toggle group: one swatch is the tab stop, ← → walk the
 *  row, ↑ ↓ move a row by `columns`, and Enter, Space or a click picks.
 *  Moving never picks. `value` matching no swatch shows none picked. */
function SwatchGrid({
  swatches,
  value,
  onValueChange,
  columns,
  className,
  ...props
}: {
  swatches: readonly Swatch[]
  value: string | null
  onValueChange: (color: string) => void
  columns: number
  "aria-label": string
  className?: string
}) {
  const grid = React.useRef<HTMLDivElement>(null)
  // Radix walks a horizontal group on ← → only; ↑ ↓ jump a row here.
  const moveRow = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowDown" ? columns : event.key === "ArrowUp" ? -columns : 0
    if (step === 0 || !grid.current) return
    event.preventDefault()
    const items = Array.from(grid.current.querySelectorAll<HTMLButtonElement>('[data-slot="swatch"]'))
    items[items.indexOf(event.currentTarget) + step]?.focus()
  }
  return (
    <ToggleGroupPrimitive.Root
      ref={grid}
      type="single"
      orientation="horizontal"
      loop={false}
      value={value ?? ""}
      // A press on the picked swatch would clear a single group; a colour stays picked.
      onValueChange={(next) => next && onValueChange(next)}
      data-slot="swatch-grid"
      data-columns={columns}
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      {...props}
    >
      {swatches.map((swatch) => (
        <ToggleGroupPrimitive.Item
          key={swatch.color}
          value={swatch.color}
          aria-label={swatch.name}
          data-slot="swatch"
          onKeyDown={moveRow}
          className="group/swatch flex size-8 items-center justify-center rounded-full outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className="flex size-5 items-center justify-center rounded-full ring-1 ring-white/15"
            style={{ background: swatch.color }}
          >
            <CheckIcon className="size-3.5 text-black/80 opacity-0 group-data-[state=on]/swatch:opacity-100" />
          </span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

export { SwatchGrid }
