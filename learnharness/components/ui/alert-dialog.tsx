"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DIALOG_LAYER, claimEscape, openerReturn } from "@/components/ui/overlay"

/** shadcn alert dialog on the dialog anatomy (spec: alert-dialog.md,
 *  dialog.md): a confirmation that only its buttons or Esc close. The
 *  footer holds a quiet Cancel and one action, `destructive` when it deletes. */

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        DIALOG_LAYER,
        "fixed inset-0 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

const FOOTER_BUTTONS = '[data-slot="alert-dialog-footer"] button:not(:disabled)'

/** The keyboard contract every confirmation shares (round 3, 14 Nov
 *  2026), since Tab is dead: focus opens on Cancel, ← and → move between
 *  the footer's buttons, Enter presses the focused one, and ⌘↵ presses
 *  the action, the footer's last button. Exported for pins. */
export function alertDialogKeys(e: React.KeyboardEvent<HTMLElement>) {
  if (e.defaultPrevented) return
  const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>(FOOTER_BUTTONS)]
  if (buttons.length === 0) return
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    buttons.at(-1)!.click()
    return
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
  const target = e.target as HTMLElement
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
  e.preventDefault()
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = e.key === "ArrowRight" ? (at < 0 ? buttons.length - 1 : Math.min(at + 1, buttons.length - 1)) : Math.max(at - 1, 0)
  buttons[next]!.focus()
}

/** Opening focus when the footer has no `AlertDialogCancel` for Radix to
 *  focus: its first button, so focus never stays behind the modal. */
function focusFooter(e: Event) {
  const content = e.currentTarget as HTMLElement | null
  if (!content || content.querySelector('[data-slot="alert-dialog-cancel"]')) return
  const first = content.querySelector<HTMLButtonElement>(FOOTER_BUTTONS)
  if (!first) return
  e.preventDefault()
  first.focus({ preventScroll: true })
}

/** The panel: radius 12, the raised popover fill, padding 24, slots 16 apart. */
function AlertDialogContent({
  className,
  onEscapeKeyDown,
  onKeyDown,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const [focusReturn] = React.useState(() => openerReturn())
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        onEscapeKeyDown={claimEscape(onEscapeKeyDown)}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          alertDialogKeys(e)
        }}
        onOpenAutoFocus={(e) => {
          focusReturn.onOpenAutoFocus()
          onOpenAutoFocus?.(e)
          if (!e.defaultPrevented) focusFooter(e)
        }}
        onCloseAutoFocus={(e) => {
          onCloseAutoFocus?.(e)
          if (!e.defaultPrevented) focusReturn.onCloseAutoFocus(e)
        }}
        className={cn(
          DIALOG_LAYER,
          "fixed top-1/2 left-1/2 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/** Actions at the right, the primary one last. */
function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-wrap items-center justify-end gap-2", className)}
      {...props}
    />
  )
}

/** 18/24 at 600. */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-title-1 text-foreground", className)}
      {...props}
    />
  )
}

/** 14/20, muted. */
function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = "quiet",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
