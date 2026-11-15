"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DIALOG_LAYER, claimEscape, openerReturn } from "@/components/ui/overlay";

/** shadcn's Radix sheet on the Proposed tokens (spec: sheet.md): a panel
 *  that slides in from the window's right edge over the page, for work
 *  done beside it. Radix owns the focus trap, Esc and the click outside,
 *  as for the dialog (dialog.md); on close focus goes back to what opened
 *  it (`openerReturn`), since its openers are plain buttons, not a
 *  SheetTrigger. */

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;

/** The dimmed layer under the panel: black 40%, lighter than a dialog's,
 *  so the page it works on stays readable. */
function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				DIALOG_LAYER,
				"fixed inset-0 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
				className,
			)}
			{...props}
		/>
	);
}

/** The panel: full height at the right edge, the raised popover fill, a
 *  hairline on its left, a 200ms slide in and 150ms out. */
function SheetContent({ className, children, onEscapeKeyDown, onOpenAutoFocus, onCloseAutoFocus, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
	const [focusReturn] = React.useState(() => openerReturn());
	return (
		<SheetPrimitive.Portal>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
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
					"fixed inset-y-0 right-0 flex h-full w-full max-w-md flex-col border-l bg-popover text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-200 data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150 data-[state=closed]:ease-in",
					className,
				)}
				{...props}
			>
				{children}
				<SheetPrimitive.Close asChild>
					<Button type="button" variant="quiet" size="icon-row" data-slot="sheet-close" aria-label="Close" className="absolute top-4 right-4">
						<XIcon />
					</Button>
				</SheetPrimitive.Close>
			</SheetPrimitive.Content>
		</SheetPrimitive.Portal>
	);
}

/** Title over description, 8 apart, padding 24 with room for the close. */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="sheet-header" className={cn("flex flex-col gap-2 p-6 pr-14", className)} {...props} />;
}

/** 18/24 at 600, as a dialog's. */
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-title-1 system-current:text-subheading system-current:font-semibold text-foreground", className)} {...props} />;
}

/** 14/20, muted. */
function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-body system-current:text-control text-muted-foreground", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription };
