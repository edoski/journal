"use client";

import type { ReactNode } from "react";
import { DumbbellIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Home and the draft share one wrapping action row. The course and picker
 * controls lead; setup is centered only when it is the sole action. */
export function ComposerActions({ course, picker, setup }: { course?: ReactNode; picker?: ReactNode; setup?: ReactNode }) {
	if (!course && !picker && !setup) return null;
	return (
		<div
			data-testid="composer-actions"
			className={`pointer-events-auto mb-2 flex flex-wrap items-center gap-2 ${course || picker ? "justify-start" : "justify-center"}`}
		>
			{course}
			{picker}
			{setup}
		</div>
	);
}

/** Count and Clear stay together if the setup action wraps onto another line.
 * These are node counts, even when a whole chain supplied the selection. */
export function NodePickerControl({ count, onOpen, onClear, variant = "current" }: {
	count: number;
	onOpen?: () => void;
	onClear?: () => void;
	/** "proposed": a quiet pill in the composer toolbar, Clear as a 24px ×. */
	variant?: "current" | "proposed";
}) {
	if (variant === "proposed") {
		return (
			<div className="flex items-center">
				<button
					type="button"
					data-testid="practice-props-chip"
					data-slot="composer-chip"
					onClick={onOpen}
					className={cn(
						"flex h-8 items-center gap-1.5 rounded-full px-3 text-row outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
						count > 0 ? "text-foreground" : "text-muted-foreground",
					)}
				>
					<DumbbellIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					{count > 0 ? `${count} ${count === 1 ? "node" : "nodes"}` : "Pick nodes"}
				</button>
				{count > 0 && (
					<button
						type="button"
						data-testid="practice-props-clear"
						aria-label="Clear picked nodes"
						onClick={onClear}
						className="flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-fill-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<XIcon className="size-4" />
					</button>
				)}
			</div>
		);
	}
	return (
		<div className="flex items-center gap-1.5">
			<button
				type="button"
				data-testid="practice-props-chip"
				onClick={onOpen}
				className={
					"flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-xs transition-colors " +
					(count > 0
						? "border-border bg-card text-foreground hover:bg-accent"
						: "border-dashed border-border/80 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground")
				}
			>
				<DumbbellIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
				{count > 0 ? `${count} ${count === 1 ? "node" : "nodes"} selected` : "Pick nodes"}
			</button>
			{count > 0 && (
				<button
					type="button"
					data-testid="practice-props-clear"
					onClick={onClear}
					className="cursor-pointer rounded-full px-2 py-1 font-ui text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					Clear
				</button>
			)}
		</div>
	);
}
