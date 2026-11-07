/**
 * The one place the app's confidence state meets the learning engine.
 * The engine is gaining an optional three-state field on attempts; until
 * its name and values are final, an attempt carries no confidence field,
 * and the tutor's existing rules (a guess is `partial`, a confident error
 * rewrites the topic's gap) carry the meaning. When the engine's field
 * lands, only `engineConfidence` changes.
 */

/** The observation fields for one answer's confidence state. */
export function engineConfidence(_state: string | undefined): Record<string, unknown> {
	return {};
}
