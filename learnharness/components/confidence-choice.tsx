"use client";

import { useEffect, useRef } from "react";
import { CONFIDENCE_CHOICES, type Confidence } from "@/src/core";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** One step along the choices, Guessing to Confident, held at the ends. */
export function stepConfidence(state: Confidence, delta: 1 | -1): Confidence {
	const i = CONFIDENCE_CHOICES.findIndex((c) => c.state === state);
	return CONFIDENCE_CHOICES[Math.min(CONFIDENCE_CHOICES.length - 1, Math.max(0, i + delta))]!.state;
}

/** ⌥↑ more sure, ⌥↓ less sure (keyboard registry: confidence-up/-down). */
const ALT_STEP: Record<string, 1 | -1> = { ArrowUp: 1, ArrowDown: -1 };

/**
 * The learner's one-tap confidence read (Edoardo, 7 Nov 2026): three
 * states, no slider and no percentage. The shared segmented toggle group
 * (ui/toggle-group.md), sentence case, one item always on. ←/→ move the
 * choice when it has focus; ⌥↑/⌥↓ move it from anywhere in the lesson,
 * the answer field included, while it is shown.
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
	useEffect(() => {
		if (disabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const delta = ALT_STEP[e.key];
			if (!delta || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.defaultPrevented) return;
			// Two docks may hold a toggle; the one on screen takes the key.
			if (!groupRef.current?.checkVisibility({ visibilityProperty: true })) return;
			e.preventDefault();
			onChange(stepConfidence(value, delta));
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [value, onChange, disabled]);

	// ←/→ move the choice, not only the focus, as in a radio group.
	const step = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
		e.preventDefault();
		e.stopPropagation();
		const next = stepConfidence(value, e.key === "ArrowRight" ? 1 : -1);
		onChange(next);
		e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-confidence="${next}"]`)?.focus();
	};
	return (
		<ToggleGroup
			ref={groupRef}
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
