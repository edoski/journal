"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DIALOG_LAYER, claimEscape, openerReturn } from "@/components/ui/overlay";

/** shadcn's Radix dialog on the Proposed tokens (spec: dialog.md). Only
 *  Proposed code imports it. Esc and a click on the dimmed layer close it;
 *  the menus, selects and popovers inside are Radix layers too, so they
 *  count as inside and take the first Esc (overlay.md). */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

/** The dimmed layer under a dialog: black 50%. */
function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				DIALOG_LAYER,
				"fixed inset-0 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	);
}

/** The panel, portalled over the overlay: centred, radius 12, the raised
 *  popover fill, padding 24, slots 16 apart, 150ms fade and zoom in. */
function DialogContent({ className, onEscapeKeyDown, onOpenAutoFocus, onCloseAutoFocus, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
	const [focusReturn] = React.useState(() => openerReturn());
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				onEscapeKeyDown={claimEscape(onEscapeKeyDown)}
				onOpenAutoFocus={(e) => {
					focusReturn.onOpenAutoFocus();
					onOpenAutoFocus?.(e);
				}}
				onCloseAutoFocus={(e) => {
					onCloseAutoFocus?.(e);
					if (!e.defaultPrevented) focusReturn.onCloseAutoFocus(e);
				}}
				className={cn(
					DIALOG_LAYER,
					"fixed top-1/2 left-1/2 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
					className,
				)}
				{...props}
			/>
		</DialogPrimitive.Portal>
	);
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 pr-8", className)} {...props} />;
}

/** 18/24 at 600. */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-subheading font-semibold text-foreground", className)} {...props} />;
}

/** 14/20, muted. */
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-body system-current:text-control text-muted-foreground", className)} {...props} />;
}

/** Actions at the right, the primary one last. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-footer" className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

/** The quiet ✕ in the panel's top-right corner. */
function DialogClose({ className, ...props }: React.ComponentProps<typeof Button>) {
	return (
		<DialogPrimitive.Close asChild>
			<Button
				type="button"
				variant="quiet"
				size="icon-row"
				data-slot="dialog-close"
				className={cn("absolute right-4 top-4", className)}
				{...props}
			>
				<XIcon />
			</Button>
		</DialogPrimitive.Close>
	);
}

export { Dialog, DialogTrigger, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose };
