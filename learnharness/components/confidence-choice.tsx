import { CONFIDENCE_CHOICES, type Confidence } from "@/src/core";

/** One step along the choices, Guessing to Confident, held at the ends.
 *  The composer's confidence icon steps with it on ⌥↑ and ⌥↓
 *  (prose-composer.tsx `ConfidenceIcon`). */
export function stepConfidence(state: Confidence, delta: 1 | -1): Confidence {
	const i = CONFIDENCE_CHOICES.findIndex((c) => c.state === state);
	return CONFIDENCE_CHOICES[Math.min(CONFIDENCE_CHOICES.length - 1, Math.max(0, i + delta))]!.state;
}
