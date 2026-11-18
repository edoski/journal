"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { MENU_SEPARATOR } from "@/components/ui/dropdown-menu"

/** shadcn command (cmdk) on the menu anatomy (spec: command.md): the
 *  searchable list inside a picker popover. Focus stays in the search; the
 *  arrow keys walk the rows and Enter picks. shadcn's CommandDialog is left
 *  out: the app has no command palette. */

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden bg-transparent text-body text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

/** The search line: a 32px borderless field with a 14px glass over a hairline. */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="mb-1 flex h-8 shrink-0 items-center gap-2 border-b px-2"
    >
      <SearchIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "h-full w-full min-w-0 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

/** The empty and loading line: 12/16 muted. */
function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-2 py-1.5 text-callout text-muted-foreground", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-label **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn(MENU_SEPARATOR, className)}
      {...props}
    />
  )
}

/** A 32px row, or a two-line one (`size="tall"`: name over details). cmdk
 *  marks the walked row `data-selected`; `checked` marks the current value
 *  with the selected fill, which holds under the walk. */
function CommandItem({
  className,
  checked = false,
  size = "default",
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> & {
  checked?: boolean
  size?: "default" | "tall"
}) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      data-checked={checked || undefined}
      data-size={size}
      className={cn(
        "relative flex min-w-0 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none transition-colors data-[selected=true]:bg-fill-hover data-[checked]:bg-fill-selected data-[checked]:data-[selected=true]:bg-fill-selected data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[size=default]:h-8 data-[size=tall]:flex-col data-[size=tall]:items-stretch data-[size=tall]:gap-0.5 data-[size=tall]:py-1.5 motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/** Trailing secondary text: a price, a context size, an env var. */
function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("ml-auto text-callout text-muted-foreground tabular-nums", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
