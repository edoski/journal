/**
 * The one place the app's confidence state meets the learning engine: an
 * attempt's `sure` field (journal PR #6). Only a confidence he chose is
 * recorded (`chosenConfidence`); the meter left alone is unmarked, which
 * the engine's doctrine stores by leaving `sure` out. The engine grades a
 * guess as never solid and counts a confident wrong answer as a confident
 * error.
 */

import { chosenConfidence } from "./contracts/course.ts";

const SURE = { guessing: "guess", confident: "confident" } as const;

/** The observation fields for one answer's confidence state. */
export function engineConfidence(state: string | undefined): { sure?: "guess" | "confident" } {
	const chosen = chosenConfidence(state);
	return chosen ? { sure: SURE[chosen] } : {};
}
