/**
 * GET /api/models' client-safe shape. Pure types; the server projection
 * lives in src/server/model-catalog.ts (the contract is defined here only
 * so client components never import from the server band).
 */

/** The one model every agent runs (CLAUDE_MODEL) and the account it runs on. */
export interface ModelStatus {
	/** The Claude account every agent runs on (a provider id). */
	account: string;
	/** That account's Claude Code is signed in to its Claude plan. */
	connected: boolean;
	/** CLAUDE_MODEL's context window;
	 *  null when the account is not set up in T3 Code. */
	contextWindow: number | null;
}
