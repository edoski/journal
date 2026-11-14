/**
 * An answer's mark, as the engine recorded it (Edo, 14 Nov 2026: "show
 * each answer's mark, with a dispute button"). The app never judges an
 * answer: every field here is read from the engine's saved attempt, the
 * one that stands after any re-mark that corrects it.
 */

/** The engine's `result` on an attempt. */
export const MARK_RESULTS = ["correct", "partial", "incorrect"] as const;
export type MarkResult = (typeof MARK_RESULTS)[number];

export function isMarkResult(value: unknown): value is MarkResult {
	return typeof value === "string" && (MARK_RESULTS as readonly string[]).includes(value);
}

/** The engine's grade of an attempt (`show`'s `grade`): `solid` counted as
 *  his own, `helped` counted as helped, `missed` not right. */
export type MarkGrade = "solid" | "helped" | "missed";

/** The engine's `sure`: the confidence it recorded with the attempt. */
export type MarkSure = "guess" | "neutral" | "confident";

/** The confidence a mark shows: the one he chose. `neutral` is the meter
 *  left alone, never a choice he made (round 5), so it shows as none. */
export function chosenSure(value: unknown): Exclude<MarkSure, "neutral"> | null {
	return value === "guess" || value === "confident" ? value : null;
}

/** How an attempt counted, the one rule the answer card and the topic
 *  page's Earlier both read (round 5: a prediction's card said "Counted as
 *  helped" where Earlier said it never counts, and a give-up's card said
 *  "With help" where Earlier said "Gave up"). */
export type MarkHow = "predicted" | "gaveUp" | "withHelp" | "countedHelped" | "ownWork";

export function markHow(attempt: { predicted: boolean; gaveUp: boolean; helped: boolean; grade: MarkGrade }): MarkHow {
	if (attempt.predicted) return "predicted";
	if (attempt.gaveUp) return "gaveUp";
	if (attempt.helped) return "withHelp";
	return attempt.grade === "helped" ? "countedHelped" : "ownWork";
}

/** One attempt that stands for an answer. An answer usually has one; a
 *  practice problem has two when his first unaided try differs from the
 *  final one, and one per result when its topics went differently. */
export interface MarkRow {
	/** The standing attempt's id (o12). */
	id: string;
	topics: string[];
	/** What tells this row from the others on the card ("First try" and
	 *  "Then", or a topic's title); null when the answer has one row. */
	label: string | null;
	result: MarkResult;
	grade: MarkGrade;
	/** True when the attempt records help (`help` other than "none"). */
	helped: boolean;
	/** A prediction before its step was taught: kept, never counted. */
	predicted: boolean;
	/** He gave up on it without an answer. */
	gaveUp: boolean;
	/** The confidence he chose (`chosenSure`). */
	sure: Exclude<MarkSure, "neutral"> | null;
}

export interface AnswerMark {
	rows: MarkRow[];
	/** He disputed this mark and the tutor re-judged it. */
	disputed: boolean;
	/** The tutor's ruling on the newest dispute, in its words. */
	ruling: string | null;
}

/** GET /api/chats/:id/marks: each marked answer's mark, keyed by the
 *  answer's tool call (a question's call, or a practice problem's
 *  conclude). An answer the engine holds no attempt for is absent. */
export type AnswerMarksResponse = { ok: true; marks: Record<string, AnswerMark> } | { ok: false; error: string };
