"use client"

import * as React from "react"
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { bindingForAction, formatBinding, type KeyAction } from "@/src/core"

/**
 * The tooltip composition for icon and pill controls (tooltip wave, owner
 * 2026-09-25; subtlety round same day). The styled Radix tooltip carries
 * the label, then the control's shortcut as muted key glyphs when it has one.
 *
 * The binding is override-aware: pass `action` for registry shortcuts (a
 * user rebind in Settings → Keyboard changes the suffix live), or
 * `binding` for surface-owned keys with no registry entry ("escape" for a
 * dialog close, "enter" for a form submit).
 *
 * children must be a single element able to take a ref (TooltipTrigger
 * asChild merges onto it — no wrapper DOM, no layout shift).
 */

interface HintProps {
	label: string
	/** Registry action whose LIVE binding is shown (override-aware). */
	action?: KeyAction
	/** Surface-owned binding ("escape", "enter") — keys the registry
	 *  deliberately doesn't dispatch (Esc closes the dialog itself; Enter
	 *  submits the form the button belongs to). */
	binding?: string
	side?: "top" | "bottom" | "left" | "right"
	children: React.ReactElement
}

/** The live shortcut glyphs for a hint, "" when it has none. */
export function hintBinding(action?: KeyAction, binding?: string): string {
	return action ? formatBinding(bindingForAction(action)) : binding ? formatBinding(binding) : ""
}

export function Hint({ label, action, binding, side = "top", children }: HintProps) {
	// The label, then the shortcut as muted glyphs (kbd.md), not in parentheses.
	const live = hintBinding(action, binding)
	return (
		<TooltipProvider>
			<Tooltip>
				{/* Hover only. Tab is dead app-wide, so focus lands on a
				    control only programmatically (a dialog's autofocus, a closed
				    menu's return), and a tooltip opened then would take the next
				    Esc meant for the dialog (overlay.md). */}
				<TooltipTrigger asChild onFocus={(e) => e.preventDefault()}>{children}</TooltipTrigger>
				<TooltipContent side={side}>
					<span>{label}</span>
					{live && <Kbd>{live}</Kbd>}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
