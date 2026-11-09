"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { CONFIDENCE_CHOICES, type Confidence } from "@/src/core";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
	variant = "current",
}: {
	value: Confidence;
	onChange: (state: Confidence) => void;
	disabled?: boolean;
	/** "proposed": the shared segmented toggle group (ui/toggle-group.md),
	 *  sentence case, one item always on. */
	variant?: "current" | "proposed";
}) {
	if (variant === "proposed") {
		// ←/→ move the choice, not only the focus, as in the radio group.
		const step = (e: React.KeyboardEvent<HTMLButtonElement>) => {
			if (e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
			e.preventDefault();
			e.stopPropagation();
			const i = CONFIDENCE_CHOICES.findIndex((c) => c.state === value);
			const next = CONFIDENCE_CHOICES[Math.min(CONFIDENCE_CHOICES.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))]!;
			onChange(next.state);
			e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-confidence="${next.state}"]`)?.focus();
		};
		return (
			<ToggleGroup
				type="single"
				variant="segmented"
				size="segment"
				aria-label="Confidence"
				data-testid="confidence-choice"
				value={value}
				disabled={disabled}
				onValueChange={(next) => {
					if (next) onChange(next as Confidence);
				}}
				className="shrink-0"
			>
				{CONFIDENCE_CHOICES.map(({ state, label }) => (
					<ToggleGroupItem key={state} value={state} data-confidence={state} onKeyDown={step}>
						{label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		);
	}
	return <ConfidenceRadios value={value} onChange={onChange} disabled={disabled} />;
}

function ConfidenceRadios({
	value,
	onChange,
	disabled,
}: {
	value: Confidence;
	onChange: (state: Confidence) => void;
	disabled: boolean;
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
