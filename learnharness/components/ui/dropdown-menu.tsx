"use client"

import * as React from "react"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { OVERLAY_ATTRS, OVERLAY_LAYER, OVERLAY_MOTION, claimEscape } from "@/components/ui/overlay"

/** shadcn dropdown menu drawing the menu anatomy (spec: menu.md,
 *  dropdown-menu.md): radius 12 surface, 32px radius 8 items, fill steps for
 *  the highlighted and chosen items, the check at the right. */

/** The menu surface, shared with context-menu.tsx. */
export const MENU_CONTENT =
  "min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-xl border bg-popover p-1 text-body system-current:text-row text-popover-foreground shadow-lg outline-none"

/** One 32px row, shared with context-menu.tsx. Radix marks the pointer's or
 *  the arrow keys' row `data-highlighted`; both take the same fill step. */
export const MENU_ROW =
  "relative flex h-8 min-w-0 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none transition-colors data-[highlighted]:bg-fill-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

/** A destructive row reads in the danger ink, its icon too. */
export const MENU_ROW_DESTRUCTIVE =
  "data-[variant=destructive]:text-danger data-[variant=destructive]:*:[svg]:text-danger!"

/** The chosen row of a radio or checkbox group: the selected fill, which
 *  holds under the pointer, and room for the check at the right. */
export const MENU_ROW_CHECKED =
  "pr-8 data-[state=checked]:bg-fill-selected data-[state=checked]:data-[highlighted]:bg-fill-selected"

export const MENU_LABEL = "px-2 py-1.5 text-callout system-current:text-label system-current:font-medium text-muted-foreground data-[inset]:pl-8"
export const MENU_SEPARATOR = "-mx-1 my-1 h-px bg-border"
export const MENU_SHORTCUT = "ml-auto text-callout system-current:text-label text-muted-foreground tabular-nums"
export const MENU_INDICATOR = "pointer-events-none absolute right-2 flex size-3.5 items-center justify-center"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

/** How close a menu may come to the window's edge: never flush against it. */
const WINDOW_GUTTER = 8

function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = WINDOW_GUTTER,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        {...OVERLAY_ATTRS}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        onEscapeKeyDown={claimEscape(onEscapeKeyDown)}
        className={cn(
          OVERLAY_LAYER,
          OVERLAY_MOTION,
          MENU_CONTENT,
          "max-h-(--radix-dropdown-menu-content-available-height) origin-(--radix-dropdown-menu-content-transform-origin)",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(MENU_ROW, MENU_ROW_DESTRUCTIVE, className)}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(MENU_ROW, MENU_ROW_CHECKED, className)}
      checked={checked}
      {...props}
    >
      {children}
      <span className={MENU_INDICATOR}>
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5 text-foreground" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

/** A radio row. `indicator={false}` drops the check where the row already
 *  carries trailing text (a due count, a price): the fill alone marks it. */
function DropdownMenuRadioItem({
  className,
  children,
  indicator = true,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  indicator?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(MENU_ROW, MENU_ROW_CHECKED, !indicator && "pr-2", className)}
      {...props}
    >
      {children}
      {indicator && (
        <span className={MENU_INDICATOR}>
          <DropdownMenuPrimitive.ItemIndicator>
            <CheckIcon className="size-3.5 text-foreground" />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
      )}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(MENU_LABEL, className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  )
}

/** Trailing secondary text: a shortcut, a count, a price. */
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(MENU_SHORTCUT, className)}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(MENU_ROW, "data-[state=open]:bg-fill-hover", className)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        {...OVERLAY_ATTRS}
        className={cn(
          OVERLAY_LAYER,
          OVERLAY_MOTION,
          MENU_CONTENT,
          "origin-(--radix-dropdown-menu-content-transform-origin)",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
