"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { turnErrorText } from "./turn-error-text";

const ACTION = "h-8 px-2 text-body";

/** A failed reply under the Proposed design (spec: turn-error.md): one plain
 *  sentence in the danger colour, then Retry (a signed-out Claude's sign-in
 *  is the pill above the box, round 15 M2), Open Settings for a rejected
 *  key, Home for a lesson deleted elsewhere, and Details for the provider's
 *  own text. */
export function TurnError({ message, again = false, kept = false, onRetry, retryLabel = "Retry", onOpenSettings, children }: {
	message: string;
	/** The refused turn carried words he typed, now back in the box. */
	kept?: boolean;
	/** The press before failed the same way: the line says so and enters
	 *  again, so every press shows (round 9). */
	again?: boolean;
	/** Present while the failed turn can be retried. */
	onRetry?: () => void;
	/** The retry's words: Try again for a dropped connection, as the line
	 *  for a reply that never came says it. */
	retryLabel?: string;
	onOpenSettings: () => void;
	/** A provider-specific prompt shown beside the sentence (the Claude plan limit). */
	children?: ReactNode;
}) {
	const text = turnErrorText(message, again, kept);
	const [open, setOpen] = useState(false);
	const detailsId = useId();
	return (
		<div role="alert" data-testid="turn-error" data-kind={text.kind} className={cn("flex flex-wrap items-center gap-1 text-body", again && "lh-card-enter")}>
			<span data-testid="turn-error-sentence" className="mr-2 min-w-0 text-danger">
				{text.sentence}
				{text.then === "sign-in-retry" && (onRetry ? " Sign in, then press Retry." : " Sign in, then send again.")}
			</span>
			{children}
			{onRetry && text.kind !== "gone" && (
				<Button variant="quiet" size="sm" data-testid="retry-failed-turn" onClick={onRetry} className={cn(ACTION, "text-foreground")}>
					{retryLabel}
				</Button>
			)}
			{text.kind === "key" && (
				<Button variant="quiet" size="sm" data-testid="turn-error-settings" onClick={onOpenSettings} className={cn(ACTION, "text-muted-foreground")}>
					Open Settings
				</Button>
			)}
			{text.kind === "gone" && (
				<Button asChild variant="quiet" size="sm" data-testid="turn-error-home" className={cn(ACTION, "text-foreground")}>
					<Link href="/">Go to Home</Link>
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
