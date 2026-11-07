"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { CONFIDENCE_CHOICES, type Confidence } from "@/src/core";

/**
 * The learner's one-tap confidence read (Edoardo, 7 Nov 2026): three
 * states, no slider and no percentage. A radio group in the register of the
 * settings' segmented controls, sized for the dock's submit row. Tab
 * reaches the chosen state; ←/→ move the choice, as in any radio group.
 */
export function ConfidenceChoice({
	value,
	onChange,
	disabled = false,
}: {
	value: Confidence;
	onChange: (state: Confidence) => void;
	disabled?: boolean;
}) {
	const groupRef = useRef<HTMLDivElement>(null);
	const step = (delta: number) => {
		const i = CONFIDENCE_CHOICES.findIndex((c) => c.state === value);
		const next = CONFIDENCE_CHOICES[Math.min(CONFIDENCE_CHOICES.length - 1, Math.max(0, i + delta))]!;
		onChange(next.state);
		groupRef.current?.querySelector<HTMLButtonElement>(`[data-state="${next.state}"]`)?.focus();
	};
	return (
		<div
			ref={groupRef}
			role="radiogroup"
			aria-label="Confidence"
			data-testid="confidence-choice"
			className="flex shrink-0 rounded-[6px] border border-border/60 bg-muted/30 p-0.5"
			onKeyDown={(e) => {
				if (e.altKey || e.metaKey || e.ctrlKey) return;
				if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
					e.preventDefault();
					e.stopPropagation();
					step(e.key === "ArrowRight" ? 1 : -1);
				}
			}}
		>
			{CONFIDENCE_CHOICES.map(({ state, label }) => {
				const active = state === value;
				return (
					<button
						key={state}
						type="button"
						role="radio"
						aria-checked={active}
						tabIndex={active ? 0 : -1}
						disabled={disabled}
						data-state={state}
						onClick={() => onChange(state)}
						className={cn(
							"h-7 rounded-[4px] px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
							active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{label}
					</button>
				);
			})}
		</div>
	);
}
