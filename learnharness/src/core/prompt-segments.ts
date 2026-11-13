/**
 * The pure prompt-segment grammar, ZERO fs. Discovery (reading the agent's
 * prompt tree) lives in the agent layer (src/agent/prompt-segments.ts).
 */

/** A prompt fragment: numeric order key + .md (e.g. 20-teaching.md). Nothing else loads. */
export const FRAGMENT_RE = /^\d+-[\w.-]+\.md$/;

/** Which agent's prompt directory to compose. */
/** Practice (2026-10-04): composes ONLY its own directory — no shared
 *  teaching base, no shared fragments (the doctrine contradicts the
 *  teaching philosophy; its 00-base.md plays the base role). */
export type PromptAgent = "prober" | "teacher" | "practice";
