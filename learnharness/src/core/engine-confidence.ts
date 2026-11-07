/**
 * The one place the app's confidence state meets the learning engine: an
 * attempt's `sure` field (journal PR #6). The app asks all three states, so
 * neutral is sent too. The engine grades a guess as never solid and counts
 * a confident wrong answer as a confident error.
 */

const SURE: Record<string, "guess" | "neutral" | "confident"> = {
	guessing: "guess",
	neutral: "neutral",
	confident: "confident",
};

/** The observation fields for one answer's confidence state. */
export function engineConfidence(state: string | undefined): { sure?: "guess" | "neutral" | "confident" } {
	const sure = state ? SURE[state] : undefined;
	return sure ? { sure } : {};
}
