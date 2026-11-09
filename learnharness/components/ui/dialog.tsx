import * as React from "react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The dialog anatomy (spec: dialog.md): shadcn's dialog slots and
 *  classes, presentational only. Each dialog keeps its own portal,
 *  backdrop dismissal and Esc handling, so menus portalled out of a dialog
 *  still count as inside it and one Esc does one thing. */

/** The dimmed layer under a dialog; spread `useBackdropDismiss` onto it. */
export function DialogOverlay({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-overlay"
			className={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", className)}
			{...props}
		/>
	);
}

/** The panel: radius 12, the raised popover fill, padding 24, slots 16 apart. */
export function DialogContent({ className, onClick, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			role="dialog"
			aria-modal="true"
			data-slot="dialog-content"
			className={cn(
				"settings-dialog-pop relative flex w-full max-w-lg flex-col gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-2xl",
				className,
			)}
			onClick={(e) => {
				e.stopPropagation();
				onClick?.(e);
			}}
			{...props}
		/>
	);
}

export function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 pr-8", className)} {...props} />;
}

/** 18/24 at 600. */
export function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return <h2 data-slot="dialog-title" className={cn("text-subheading font-semibold text-foreground", className)} {...props} />;
}

/** 14/20, muted. */
export function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p data-slot="dialog-description" className={cn("text-control text-muted-foreground", className)} {...props} />;
}

/** Actions at the right, the primary one last. */
export function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="dialog-footer" className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props} />;
}

/** The quiet ✕ in the panel's top-right corner. */
export function DialogClose({ className, ...props }: React.ComponentProps<typeof Button>) {
	return (
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
	);
}
