"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { turnErrorText } from "./turn-error-text";

const ACTION = "h-8 px-2 text-row";

/** A failed reply under the Proposed design (spec: turn-error.md): one plain
 *  sentence in the danger colour, then Retry, Open Settings for a rejected
 *  key, and Details for the provider's own text. */
export function TurnError({ message, onRetry, onOpenSettings, children }: {
	message: string;
	/** Present while the failed turn can be retried. */
	onRetry?: () => void;
	onOpenSettings: () => void;
	/** A provider-specific prompt shown beside the sentence (the Claude plan limit). */
	children?: ReactNode;
}) {
	const text = turnErrorText(message);
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	return (
		<div role="alert" data-testid="turn-error" data-kind={text.kind} className="flex flex-wrap items-center gap-1 text-row">
			<span data-testid="turn-error-sentence" className="mr-2 min-w-0 text-danger">{text.sentence}</span>
			{children}
			{onRetry && (
				<Button variant="quiet" size="sm" data-testid="retry-failed-turn" onClick={onRetry} className={cn(ACTION, "font-medium text-foreground")}>
					Retry
				</Button>
			)}
			{text.kind === "key" && (
				<Button variant="quiet" size="sm" data-testid="turn-error-settings" onClick={onOpenSettings} className={cn(ACTION, "text-muted-foreground")}>
					Open Settings
				</Button>
			)}
			{text.details !== null && (
				<Button
					variant="quiet"
					size="sm"
					aria-expanded={open}
					aria-controls={detailsId}
					data-testid="turn-error-details-toggle"
					onClick={() => setOpen((o) => !o)}
					className={cn(ACTION, "text-muted-foreground")}
				>
					Details
				</Button>
			)}
			{text.details !== null && open && (
				<pre id={detailsId} data-testid="turn-error-details" className="mt-1 w-full whitespace-pre-wrap break-all font-mono text-label text-muted-foreground">
					{text.details}
				</pre>
			)}
		</div>
	);
}
