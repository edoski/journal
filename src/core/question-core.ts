/**
 * question-core — the question contract and the answer records. No
 * framework imports, no UI: everything here is deterministic and
 * unit-testable.
 *
 * The TypeBox schemas below are the tool INPUT contracts (agent/tools
 * declares the tools against them). A graded question is free response:
 *   1. The model calls `explain` (teacher) or `recall` (prober) with the
 *      question and its committed correct answer. No server execute — the
 *      call lands in the UI as a typed tool part in `input-available` state.
 *   2. The learner answers in his own words in the dock, with one of three
 *      confidence states.
 *   3. addToolOutput sends his answer back; the model grades it against
 *      its commitment in its next reply. The client never grades.
 *
 * Because the pending question IS a persisted message part, a session can be
 * exited and resumed mid-question for free.
 */

import { Type, type Static } from "typebox";
import { stripModelValueDebris } from "./value-debris.ts";
import { DEFAULT_CONFIDENCE, type Confidence } from "./contracts/course.ts";

// ─── shared types ───────────────────────────────────────────────────────────

export interface QuestionOption {
	label: string;
	value: string;
	description?: string;
}

// ─── tool input schemas (the question contract) ─────────────────────────────
// Parameter names mirror the prompt docs exactly — keep them in sync.

/** One ask answer option. */
const askOptionProps = {
	label: Type.String({ description: "Display label for the answer option" }),
	value: Type.Optional(
		Type.String({
			description: "Optional machine-readable value returned for the option. Defaults to the label.",
		}),
	),
	description: Type.Optional(
		Type.String({ description: "Optional extra detail shown below the option" }),
	),
};

/** GLM wobble guard (owner-approved, 2026-09-26): models sometimes emit
 *  `options` as a JSON-ENCODED STRING instead of an array. Parse it before
 *  use. Shared by the tools' prepareArguments (server, pre-validation) and
 *  normalizeOptions (client — the persisted call keeps the raw string, so
 *  the dock must coerce again). Returns the input untouched when it isn't
 *  a parseable array — validation then reports honestly. */
export function parseOptionsIfString<T>(options: string | T[] | undefined): unknown {
	if (typeof options !== "string") return options;
	try {
		const parsed: unknown = JSON.parse(options);
		if (Array.isArray(parsed)) return parsed;
	} catch {
		/* not JSON — fall through untouched */
	}
	return options;
}

// ─── ask option sanity (enforced at the tool-call boundary) ───────────────

/** Labels non-empty, resolved values (trimmed `value`, falling back to the
 *  trimmed label — exactly how normalizeOptions keys them) distinct: ask
 *  is not graded, but duplicate values break the dock's value keying. */
export function askOptionProblems(options: Array<{ label: string; value?: string }>): string[] {
	const problems: string[] = [];
	const keys: string[] = [];
	options.forEach((option, i) => {
		const label = option.label.trim();
		if (label.length === 0) {
			problems.push(`options[${i}].label is empty — every option needs a label.`);
			return;
		}
		const key = option.value?.trim() || label;
		if (keys.includes(key)) {
			problems.push(`Two options resolve to the same value "${key}" — options must be distinct.`);
		}
		keys.push(key);
	});
	return problems;
}

// The teaching-cycle role (owner design 2026-10-03, "two questions per
// teaching unit"): `type` declares the teach question's role. The ROLE
// DOCTRINE lives in the system prompt; tool descriptions stay mechanical.
export type QuestionType = "predict" | "check";

/** Normalize a persisted `type` (display seam): old records carry none,
 *  and unhealable wobble degrades to undefined — callers render the
 *  check-style card. The debris strip (whitehead, 2026-10-09) heals the
 *  recorded `"\"predict\""` wobble. */
export function normalizeQuestionType(raw: unknown): QuestionType | undefined {
	if (typeof raw !== "string") return undefined;
	const v = stripModelValueDebris(raw);
	return v === "predict" ? "predict" : v === "check" ? "check" : undefined;
}

/** The reveal law as a pure predicate (owner 2026-10-03): a teach-phase
 *  CHECK collapses behind the "Check your understanding" reveal — a
 *  prediction NEVER does (it precedes the teaching and gates it), and
 *  neither do probe/plan questions or ask. chat.tsx calls this for its
 *  pending question; the reading-thinking field mounts on the same truth.
 *  Records that predate the `type` field render as checks. */
export function questionNeedsReveal(tool: string, rawInput: unknown, phase: string): boolean {
	if (tool !== "explain" || phase !== "teach") return false;
	return normalizeQuestionType((rawInput as { type?: unknown } | null)?.type) !== "predict";
}

/** The teaching-cycle role field of the teach explain. Bare words, never
 *  quoted (the quote-copy wobble — see tests/tool-heal.test.ts). */
const predictCheckType = Type.Union([Type.Literal("predict"), Type.Literal("check")], {
	description:
		"REQUIRED — the question's role in the teaching cycle, as a bare word (no quotes): predict = posed BEFORE " +
		"you teach the step (its own turn; the learner answers, then your teaching resolves it — arrives open, never " +
		"collapsed); check = posed AFTER the step's teaching is complete (arrives collapsed behind the Check your " +
		"understanding reveal). ONE question per turn either way.",
});

// ─── the explain tool (free response, owner 2026-09-27) ────────────────────
//
// The learner answers in his own words. The SYCOPHANCY MITIGATION is
// structural — the model commits to the full correct answer BEFORE posing
// (the commitment rides the persisted call args, is revealed to the learner
// on submit, and is restated in the answer result the model grades against;
// the client never grades free text).

export const explainInputBase = Type.Object({
	question: Type.String({
		description:
			"The single question to ask. ONE question per turn: ask, then end your turn — the answer determines the next.",
	}),
	correctAnswer: Type.String({
		description:
			"REQUIRED. The full correct answer in your own words, reasoning included — COMMITTED before the learner " +
			"ever sees the question. The commitment is immutable: when his answer returns, grade it strictly against this " +
			"text — never revise the commitment after seeing his words, and never mark a wrong answer right to be kind. " +
			"It is shown to him on submit; your next reply grades the nuance of what he wrote.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
});

/** The TEACH-side explain object: base + the teaching-cycle role field
 *  and the plan-position field. The required pair leads the property
 *  order (owner, 2026-10-09): glm-5.3 dropped `type`/`nodeId` on long
 *  calls BECAUSE they trailed every content field — fields generated
 *  first get dropped least. nodeId means "this question is ABOUT this
 *  node" — a position signal, never a completion signal; it is validated
 *  against the live plan tree in the tool's execute (tools.ts). */
export const explainInputObject = Type.Object({
	type: predictCheckType,
	nodeId: Type.String({
		description:
			"REQUIRED plan-tree node id this question is about — must EXACTLY match one of this session's " +
			"plan_init node slugs (validated at call time; a mismatched id is rejected back to you). " +
			"The lesson's position on the map derives from these tags (the node the latest tagged question is about is " +
			"where the map stands; earlier ones count as visited). A node takes as many questions as it deserves: stay on " +
			"one node for as many turns as the understanding needs — one reasoning step at a time, never rush forward. " +
			"For off-map checks use ask_user_question.",
	}),
	...explainInputBase.properties,
});

/** The DISPLAY parse for persisted explain calls (tool-parts.ts): the
 *  base + `type` as an OPTIONAL plain string. Old records carry none;
 *  questionNeedsReveal treats them as checks (the standing default).
 *  nodeId stays stripped (unknown key). */
export const explainDisplayInputSchema = Type.Object({
	...explainInputBase.properties,
	type: Type.Optional(Type.String()),
});

/** The explain authoring contract: the commitment must exist. Empty
 *  result = an explain the dock can arm and the model can grade against. */
export function explainInputProblems(input: { correctAnswer: string }): string[] {
	if (input.correctAnswer.trim().length === 0) {
		return ["correctAnswer is required — commit to the full correct answer BEFORE posing the question."];
	}
	return [];
}

/** The tool names whose `nodeId` tags the lesson's position on the plan
 *  map (phases, the plan-status fold). `quiz` is the removed
 *  multiple-choice teach tool (7 Nov 2026): older transcripts still tag
 *  position with it, so their phases and plan statuses read as they did. */
export const POSITION_QUESTION_TOOLS: readonly string[] = ["explain", "quiz"];

export const askInputSchema = Type.Object({
	// No `mode` param — the pi original has none: the mode is inferred from
	// whether options are present (the dock does exactly this). One less
	// knob for the model to misuse.
	question: Type.String({
		description:
			"The single question to ask the learner. ONE question per turn: ask, then end your turn — the answer determines the next question.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Optional(
		Type.Array(Type.Object(askOptionProps), {
			minItems: 2,
			description:
				"Optional multiple-choice options. Omit for free-form text input. " +
				"The learner can always choose 'Other' and type a custom answer when options are provided.",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true to allow multiple answers to the same question." }),
	),
});
// Ask's option sanity (labels non-empty, values distinct — ask is not
// graded, but duplicate values break the dock's value keying) runs at the
// call boundary in execute (askOptionProblems, above).

export type AskToolInput = Static<typeof askInputSchema>;
export type ExplainToolInput = Static<typeof explainInputObject>;

/** A real selected answer, in the order the options were displayed. */
export interface OptionAnswer {
	label: string;
	value: string;
	index: number; // 1-based display index
}

export type QuestionKind = "ask" | "explain";
export type SelectMode = "single-select" | "multi-select";
export type QuestionMode = SelectMode | "text";

/** Full question data, built by the dock per question. */
export interface QuestionData {
	id: string;
	kind: QuestionKind;
	question: string;
	context?: string;
	mode: QuestionMode;
	options: QuestionOption[];
	// explain only. NEVER send to the client before answering:
	committedAnswer?: string;
	createdAt: string;
}

/** The learner's answer — full structured record, stored as the question
 *  call's tool result `details`. NO questionId (owner, tool-result diet
 *  2026-10-02): the toolResult message already carries the call id.
 *  Persisted records from before 7 Nov 2026 may also carry the removed
 *  multiple-choice fields (`kind: "quiz"`, `correct`, `dontKnow`, a
 *  numeric `confidence`); readers ignore them. */
export interface QuestionAnswerData {
	kind: QuestionKind;
	/** The persisted call's tool NAME (owner, 2026-10-09): probe-phase
	 *  calls are `recall`, teach calls `explain` — the cards label by it,
	 *  so the phase boundary is visible in the transcript. */
	tool?: string;
	questionText: string;
	options?: { index: number; label: string }[]; // ask: snapshot for rendering
	answers: OptionAnswer[];
	other?: string; // ask: "Other" free text
	text?: string; // ask/explain: text-mode answer
	/** The learner's reasoning on the QUESTION (renamed from `note`, owner
	 *  2026-10-03 — "that's what it is"). */
	thinking?: string;
	/** @deprecated the pre-rename key — never written again; old records
	 *  replay through the same types, so it stays declared. Read via
	 *  `thinking ?? note`. */
	note?: string;
	/** The learner's thinking WHILE READING the teaching prose (owner
	 *  2026-10-03) — a separate channel from `thinking`, captured by the
	 *  reading field and riding the check answer. Absent when empty. */
	readingThinking?: string;
	/** explain: set on every answer buildAnswer makes. Absent on dismissals
	 *  and on explain answers recorded before 7 Nov 2026. */
	confidence?: Confidence;
	committed?: string; // explain only (rendering): the model's committed answer
	dismissed?: boolean;
	answeredAt: string;
}

/** What the dock passes to buildAnswer when the learner answers. */
export interface AnswerRequest {
	values?: string[]; // option values
	other?: string; // ask "Other"
	text?: string; // ask/explain text-mode
	thinking?: string; // the reasoning-on-the-question channel (was `note`)
	readingThinking?: string; // the thinking-while-reading channel (check answers)
	confidence?: Confidence; // explain only; defaults to neutral
}

// ─── dock selection (the client state machine, pure for tests) ─────────────

/** The question dock's selection state (0-based indices in display order). */
export interface DockSelection {
	selected: Set<number>;
	otherSelected: boolean;
}

export const emptyDockSelection = (): DockSelection => ({ selected: new Set(), otherSelected: false });

/** In-memory submission snapshot: survives the question form's optimistic
 * unmount, never written to storage. */
export interface QuestionFormDraft {
	selection: DockSelection;
	thinking: string;
	other: string;
	text: string;
	confidence: Confidence;
}

export interface QuestionDraft {
	form?: QuestionFormDraft;
	readingThinking?: string;
}

/**
 * Toggling a listed option. Single-select: the option becomes THE answer and
 * displaces "Other". Multi-select: the option toggles alongside its siblings
 * AND "Other" — selections are independent (picking options must never clear
 * a custom answer, and picking the custom row must never clear them).
 */
export function toggleOption(mode: SelectMode, sel: DockSelection, idx: number): DockSelection {
	if (mode === "multi-select") {
		const selected = new Set(sel.selected);
		if (selected.has(idx)) selected.delete(idx);
		else selected.add(idx);
		return { selected, otherSelected: sel.otherSelected };
	}
	return { selected: new Set([idx]), otherSelected: false };
}

/**
 * Toggling the ask "Other…" row. Single-select: picking it makes it THE
 * answer, displacing the listed options (the typed text always survives).
 * Multi-select: it toggles alongside the listed selections and clears
 * nothing.
 */
export function toggleOther(mode: SelectMode, sel: DockSelection): DockSelection {
	if (mode === "multi-select") return { ...sel, otherSelected: !sel.otherSelected };
	return { selected: new Set(), otherSelected: true };
}

// ─── options ────────────────────────────────────────────────────────────────

export function normalizeOptions(
	options: string | Array<{ label: string; value?: string; description?: string }> | undefined,
): QuestionOption[] {
	const seen = new Set<string>();
	// The persisted tool call can carry GLM's string-encoded options —
	// parseOptionsIfString is the same coercion the server's
	// prepareArguments runs pre-validation (see parseOptionsIfString).
	const coerced = parseOptionsIfString(options);
	const list = Array.isArray(coerced)
		? (coerced as Array<{ label: string; value?: string; description?: string }>)
		: [];
	return list
		.map((option) => ({
			label: option.label.trim(),
			value: option.value?.trim() || option.label.trim(),
			description: option.description?.trim() || undefined,
		}))
		.filter((option) => {
			if (option.label.length === 0) return false;
			if (seen.has(option.value)) throw new Error(`duplicate option value "${option.value}"`);
			seen.add(option.value);
			return true;
		});
}

// ─── answering ──────────────────────────────────────────────────────────────

/**
 * Turn an AnswerRequest into the full answer record. Nothing is graded
 * here: explain answers are graded by the model against its commitment,
 * and ask answers have no correct answer.
 */
export function buildAnswer(qd: QuestionData, req: AnswerRequest, tool?: string): QuestionAnswerData {
	const base: QuestionAnswerData = {
		kind: qd.kind,
		...(tool ? { tool } : {}),
		questionText: qd.question,
		options: qd.options.map((o, i) => ({ index: i + 1, label: o.label })),
		answers: [],
		thinking: req.thinking?.trim() || undefined,
		readingThinking: req.readingThinking?.trim() || undefined,
		answeredAt: new Date().toISOString(),
	};
	// resolve selected option values → OptionAnswer (in display order)
	if (req.values && req.values.length > 0) {
		const byValue = new Map(qd.options.map((o, i) => [o.value, { ...o, index: i + 1 }]));
		for (const v of req.values) {
			const opt = byValue.get(v);
			if (!opt) continue; // unknown value — ignore
			base.answers.push({ label: opt.label, value: opt.value, index: opt.index });
		}
		base.answers.sort((a, b) => a.index - b.index);
	}
	if (req.other?.trim()) base.other = req.other.trim();
	if (req.text?.trim()) base.text = req.text.trim();
	if (qd.kind === "explain") {
		// The commitment snapshots for the reveal + rendering.
		base.committed = qd.committedAnswer;
		base.confidence = req.confidence ?? DEFAULT_CONFIDENCE;
	}
	return base;
}

/** The dismissal record (ESC-abort from a pending question, owner
 *  2026-10-02): the minimum honest answer. The model sees
 *  {kind, dismissed:true} via compactAnswerForModel; the answered card
 *  renders the question text + "skipped". Rides the same answer path —
 *  the teacher acknowledges the skip in its next turn, exactly like any
 *  answer. */
export function dismissedAnswer(kind: QuestionKind, questionText: string): QuestionAnswerData {
	return {
		kind,
		questionText,
		answers: [],
		dismissed: true,
		answeredAt: new Date().toISOString(),
	};
}

/**
 * The MODEL-VISIBLE answer record (owner, tool-result diet 2026-10-02):
 * the tool call already carries everything the model itself authored —
 * the question, every option, the explain commitment — so the result
 * returns ONLY what the learner added: his selection or words, his
 * confidence (as the word), his thinking. The full QuestionAnswerData
 * rides `details` for the record and the UI; this is the JSON the agent
 * actually reads.
 */
export function compactAnswerForModel(ad: QuestionAnswerData): Record<string, unknown> {
	if (ad.dismissed) return { kind: ad.kind, dismissed: true };
	const out: Record<string, unknown> = { kind: ad.kind };
	// Array.isArray: the seam is called with `unknown` answers (test
	// fixtures, foreign records) — degrade to omission, never crash.
	if (Array.isArray(ad.answers) && ad.answers.length > 0)
		out.answers = ad.answers.map((a) => ({ index: a.index, label: a.label }));
	if (ad.text) out.text = ad.text;
	if (ad.other) out.other = ad.other;
	if (ad.confidence !== undefined) out.confidence = ad.confidence;
	// Two DISTINCT thinking channels, clearly keyed so the model never
	// conflates them (owner 2026-10-03): reasoning on the question vs
	// thinking while reading the teaching. `note` is the pre-rename key —
	// old records replay through here too, so both feed `thinking`.
	const thinking = ad.thinking ?? ad.note;
	if (thinking) out.thinking = thinking;
	if (ad.readingThinking) out.thinkingWhileReading = ad.readingThinking;
	return out;
}
