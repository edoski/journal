"use client";

import { useEffect, useRef } from "react";
import { CONFIDENCE_CHOICES, type Confidence } from "@/src/core";
import { stepConfidence } from "@/components/confidence-choice";
import { cn } from "@/lib/utils";

/** ⌥↑ more sure, ⌥↓ less sure (keyboard registry: confidence-up/-down). */
const ALT_STEP: Record<string, 1 | -1> = { ArrowUp: 1, ArrowDown: -1 };

/** How sure he is, as three quiet words on the answer line (spec:
 *  answer-slot.md): the picked word in the foreground, the others muted,
 *  no track. ⌥↑ and ⌥↓ move it from anywhere while it is shown, ← and →
 *  while a word has focus, as the dock's toggle does. */
export function SlotConfidence({ value, onChange, disabled = false }: { value: Confidence; onChange: (state: Confidence) => void; disabled?: boolean }) {
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (disabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const delta = ALT_STEP[e.key];
			if (!delta || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
			if (!rootRef.current?.checkVisibility({ visibilityProperty: true })) return;
			e.preventDefault();
			onChange(stepConfidence(value, delta));
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [value, onChange, disabled]);
	return (
		<div ref={rootRef} role="radiogroup" aria-label="Confidence" data-testid="confidence-choice" data-slot="slot-confidence" className="flex shrink-0 items-center">
			{CONFIDENCE_CHOICES.map(({ state, label }) => {
				const on = state === value;
				return (
					<button
						key={state}
						type="button"
						role="radio"
						aria-checked={on}
						data-confidence={state}
						disabled={disabled}
						onClick={() => onChange(state)}
						onKeyDown={(e) => {
							if (e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
							e.preventDefault();
							e.stopPropagation();
							const next = stepConfidence(value, e.key === "ArrowRight" ? 1 : -1);
							onChange(next);
							e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-confidence="${next}"]`)?.focus();
						}}
						className={cn(
							"h-8 rounded-md px-1.5 text-row outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none",
							on ? "text-foreground underline decoration-muted-foreground underline-offset-[5px]" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{label}
					</button>
				);
			})}
		</div>
	);
}
