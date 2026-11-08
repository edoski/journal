/**
 * The UI parse seam — parse, don't cast (the rule born of the 2026-09-12
 * live crashes).
 *
 * WHY THIS EXISTS. Validation IS first at the model-facing boundary — pi
 * validates arguments against the tool's TypeBox schema before execute,
 * and the authoring refinements run in the execute seam; a failure
 * returns to the model as an error tool result, same turn. But the same bytes have two other consumers, and there they
 * exist UNVALIDATED BY DESIGN:
 *
 *   - the live wire streams raw tool-input deltas while the model is still
 *     typing the call (validation cannot run before the call is complete);
 *   - the transcript keeps the raw input of REJECTED calls too (transcript
 *     honesty + the replay invariant: every toolCall followed by a result).
 *
 * So invalid input is always observable, and part STATES carry the verdict
 * (input-streaming = partial, input-available = validated, output-error =
 * garbage). The flaw that made the crashes possible: consumers trusted
 * those shapes via TypeScript CASTS — `part.input as X` is a compile-time
 * lie the checker believes, with no runtime check behind it.
 *
 * THE RULE (mechanical, not vigilance): model-authored INPUT is consumed
 * only through these parsers, each running the SAME TypeBox schema the model
 * faced — boundary-valid ⇔ consumer-parseable, structurally. Server- and
 * learner-authored OUTPUT stays trusted (our own code authors it: the
 * execute acks, the learner's buildAnswer). A parse failure renders the
 * quiet fallback, never a crash.
 */

import { Value } from "typebox/value";
import { healEncodedArguments } from "./argument-heal.ts";
import type { TSchema } from "typebox";
import { askInputSchema, askOptionProblems, explainInputProblems, explainDisplayInputSchema, type AskToolInput, type ExplainToolInput } from "./question-core.ts";
import { probeDoneInputSchema, type ProbeDoneInput } from "./contracts/probe.ts";

/** The pi-boundary parse step, mirrored here (live-smoke fix, 2026-09-26):
 *  pi-ai's validateToolArguments runs TypeBox's Value.Convert on the model's
 *  raw arguments before Value.Check — a correctAnswer sent as the NUMBER 17
 *  (what the live smoke's model actually emitted) converts to "17" at the
 *  boundary, so the tool poses the question fine. But the persisted record keeps
 *  the RAW arguments, so a parse seam that skips Convert would reject the
 *  exact input the boundary accepted — an invisible pending question and a
 *  learner lockout. Every display parse converts first, exactly like the
 *  boundary; Convert mutates, so the input is cloned before touching. */
export function boundaryParse<T>(schema: TSchema, input: unknown): T | undefined {
	if (typeof input !== "object" || input === null) return undefined;
	// The record keeps raw arguments; the boundary healed them before
	// validation, so the display heals the same way.
	const converted = structuredClone(healEncodedArguments(input, schema as never));
	Value.Convert(schema, converted);
	if (!Value.Check(schema, converted)) return undefined;
	return Value.Clean(schema, converted) as T;
}

/**
 * Ask parse for DISPLAY: the full ask schema (options optional — free-text
 * mode is the options-less shape), plus the option-sanity refinement the
 * boundary enforced (askOptionProblems — duplicate values break the dock's
 * keying, so they parse to undefined exactly like the zod seam did).
 */
export function parseAskInput(input: unknown): AskToolInput | undefined {
	const cleaned = boundaryParse<AskToolInput>(askInputSchema, input);
	if (!cleaned) return undefined;
	if (askOptionProblems(cleaned.options ?? []).length > 0) return undefined;
	return cleaned;
}

/** Explain parse for DISPLAY: the display schema (base + OPTIONAL
 *  lenient `type` — teach explain calls carry the role since 2026-10-09;
 *  the commitment refinement (explainInputProblems) mirrors the boundary
 *  chain). Both explain variants share the same fields; the teacher's
 *  nodeId is an unknown key Value.Clean strips. */
export function parseExplainInput(input: unknown): ExplainToolInput | undefined {
	const cleaned = boundaryParse<ExplainToolInput>(explainDisplayInputSchema, input);
	if (!cleaned) return undefined;
	if (explainInputProblems(cleaned).length > 0) return undefined;
	return cleaned;
}

/** One display-validity decision for dock authority and recovery. Does not
 * mutate the recorded input or invent missing authoring fields. */
export function parseQuestionInput(tool: string, input: unknown): AskToolInput | ExplainToolInput | undefined {
	switch (tool) {
		case "explain": case "recall": return parseExplainInput(input);
		case "ask_user_question": return parseAskInput(input);
		default: return undefined;
	}
}

/** probe_done parse — the core-owned schema the tool itself declares. */
export function parseProbeDoneInput(input: unknown): ProbeDoneInput | undefined {
	return boundaryParse<ProbeDoneInput>(probeDoneInputSchema, input);
}