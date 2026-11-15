/**
 * Which recorded attempts mark which answer, and the mark that stands for
 * each (Edo, 14 Nov 2026). Pure.
 *
 * The link is exact, never the transcript's order (round 4: a late save of
 * an earlier check showed its mark on the next card). Each saved attempt
 * names the answer it records: `question`, the id the answer carried to the
 * tutor, beside the observation in the save, and the receipt's `saved` gives
 * each observation's id in the save's order. A practice problem's attempts
 * are the receipt its `conclude` carries; a save that re-sends them names
 * the conclude. An answer he gave in words is his message: the save names
 * `HIS_MESSAGE`, the newest message of his before it. An attempt that
 * names no answer marks no card. The mark
 * itself is the engine's: `answerMarksOf` reads the attempts `show`
 * returned and follows `corrected_by` to the ones that stand.
 */

import { answeredQuestionsOf, HIS_MESSAGE, savedQuestionsOf, type LhMessage } from "./native-messages.ts";
import type { AnswerMark, MarkGrade, MarkRow } from "./contracts/marks.ts";
import { chosenSure, isMarkResult } from "./contracts/marks.ts";

const GRADES: readonly MarkGrade[] = ["solid", "helped", "missed"];
/** The conclude result's receipt line (tools/practice.ts). */
const CONCLUDE_RECEIPT = /Course record: (\{[\s\S]*\})\s*$/;

function textOf(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content.map((part) => (part && typeof part === "object" && (part as { type?: unknown }).type === "text" ? String((part as { text?: unknown }).text ?? "") : "")).join("");
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

/** A receipt's observation ids, one per observation of the save in its
 *  order (`saved`). A receipt from before `saved` lines up only when it
 *  repeated nothing. */
function savedIds(json: string): string[] {
	try {
		const receipt = JSON.parse(json) as { observations?: unknown; duplicates?: unknown; saved?: unknown };
		if (Array.isArray(receipt.saved)) return ids(receipt.saved);
		return ids(receipt.duplicates).length === 0 ? ids(receipt.observations) : [];
	} catch {
		return [];
	}
}

/** Each answer's recorded attempt ids, keyed by the answer's tool call: a
 *  graded question's call, or a practice problem's conclude. In
 *  transcript order. */
export function markLinks(messages: readonly LhMessage[]): Record<string, string[]> {
	const links: Record<string, string[]> = {};
	const answered = answeredQuestionsOf(messages);
	const named = new Map<string, (string | null)[]>();
	const add = (key: string, found: readonly string[]) => {
		if (found.length === 0) return;
		const seen = links[key] ?? [];
		links[key] = [...seen, ...found.filter((id) => !seen.includes(id))];
	};
	// An answer in words names his message (`HIS_MESSAGE`): the newest one
	// before the save, the message that turn answered.
	const theirs = new Set(messages.flatMap((m) => (m.role === "user" ? [m.id] : [])));
	let said: string | null = null;
	for (const message of messages) {
		if (message.role === "user") said = message.id;
		else if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type !== "toolCall" || block.name !== "course_save") continue;
				named.set(block.id, savedQuestionsOf(block.arguments).map((question) => (question === HIS_MESSAGE ? said : question)));
			}
		} else if (message.role === "toolResult" && !message.isError) {
			if (message.toolName === "conclude") {
				const receipt = CONCLUDE_RECEIPT.exec(textOf(message.content));
				if (receipt) add(message.toolCallId, savedIds(receipt[1]!));
			} else if (message.toolName === "course_save") {
				const questions = named.get(message.toolCallId) ?? [];
				const saved = savedIds(textOf(message.content));
				questions.forEach((question, i) => {
					if (question && (answered.has(question) || theirs.has(question)) && saved[i]) add(question, [saved[i]!]);
				});
			}
		}
	}
	return links;
}

/** What a re-mark in this session may correct (round 8, 2 m1: the tutor
 *  silently re-marked an older answer to a different question): `saved`,
 *  every attempt this session's saves and problems recorded, which it may
 *  set right on its own; `disputed`, every attempt a dispute of his named,
 *  which only a ruling on that dispute re-marks. Pure. */
export function remarkableOf(messages: readonly LhMessage[]): { saved: Set<string>; disputed: Set<string> } {
	const saved = new Set<string>();
	const disputed = new Set<string>();
	for (const message of messages) {
		if (message.role === "custom" && message.customType === "dispute") {
			for (const id of ids((message.details as { observations?: unknown } | null)?.observations)) disputed.add(id);
		} else if (message.role === "toolResult" && !message.isError) {
			if (message.toolName === "conclude") {
				const receipt = CONCLUDE_RECEIPT.exec(textOf(message.content));
				if (receipt) for (const id of savedIds(receipt[1]!)) saved.add(id);
			} else if (message.toolName === "course_save") {
				for (const id of savedIds(textOf(message.content))) saved.add(id);
			}
		}
	}
	return { saved, disputed };
}

/** The answer whose mark ⌘⇧M disputes: the newest one with a mark. */
export function latestMarkedAnswer(messages: readonly LhMessage[], marks: Readonly<Record<string, AnswerMark>>): string | null {
	const keys = Object.keys(markLinks(messages)).filter((key) => marks[key]);
	return keys[keys.length - 1] ?? null;
}

type Shown = Record<string, unknown>;

function item(observations: Shown, id: string): Record<string, unknown> | null {
	const value = observations[id];
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Every observation id a mark needs read: the linked ones and, once read,
 *  the ones that correct them. */
export function correctorsToRead(observations: Shown, ids: readonly string[]): string[] {
	return [...new Set(ids.flatMap((id) => strings(item(observations, id)?.corrected_by)))].filter((id) => !(id in observations));
}

/** The attempts that stand for one linked id, and the chain that led
 *  there, oldest first. */
function standing(observations: Shown, id: string, chain: string[] = []): { leaves: string[]; chain: string[] } {
	if (chain.includes(id) || chain.length > 32) return { leaves: [], chain };
	const path = [...chain, id];
	const correctors = strings(item(observations, id)?.corrected_by);
	if (correctors.length === 0) return { leaves: [id], chain: path };
	const found = correctors.map((next) => standing(observations, next, path));
	return { leaves: found.flatMap((f) => f.leaves), chain: [...new Set(found.flatMap((f) => f.chain))] };
}

function rowOf(observations: Shown, id: string): MarkRow | null {
	const o = item(observations, id);
	if (!o || (o.kind !== "attempt" && o.kind !== "exam") || !isMarkResult(o.result)) return null;
	const grade = GRADES.find((g) => g === o.grade);
	if (!grade) return null;
	return {
		id,
		topics: strings(o.topics),
		label: null,
		result: o.result,
		grade,
		helped: o.kind === "attempt" && typeof o.help === "string" && o.help !== "none",
		predicted: o.predicted === true,
		gaveUp: o.gave_up === true,
		uncertain: typeof o.uncertain === "string",
		sure: chosenSure(o.sure),
	};
}

function labelled(rows: MarkRow[], titles: Readonly<Record<string, string>>): MarkRow[] {
	if (rows.length < 2) return rows;
	const shares = (a: MarkRow, b: MarkRow) => a.topics.some((t) => b.topics.includes(t));
	return rows.map((row, i) => {
		const label = rows.slice(i + 1).some((later) => shares(later, row))
			? "First try"
			: rows.slice(0, i).some((earlier) => shares(earlier, row))
				? "Then"
				: row.topics.map((t) => titles[t] ?? t).join(", ");
		return { ...row, label: label || null };
	});
}

/** Each linked answer's mark, from the observations `show` returned (the
 *  linked ones and every one that corrects them). An answer with no
 *  attempt left standing is absent. */
export function answerMarksOf(
	links: Readonly<Record<string, readonly string[]>>,
	observations: Shown,
	titles: Readonly<Record<string, string>> = {},
): Record<string, AnswerMark> {
	const marks: Record<string, AnswerMark> = {};
	for (const [key, ids] of Object.entries(links)) {
		const found = ids.map((id) => standing(observations, id));
		const leaves = [...new Set(found.flatMap((f) => f.leaves))];
		const rows = leaves.flatMap((id) => rowOf(observations, id) ?? []);
		if (rows.length === 0) continue;
		const disputes = [...new Set(found.flatMap((f) => f.chain))].map((id) => item(observations, id)).filter((o) => typeof o?.disputed === "string");
		const ruling = disputes.map((o) => o?.ruling).filter((r): r is string => typeof r === "string").at(-1) ?? null;
		marks[key] = { rows: labelled(rows, titles), disputed: disputes.length > 0, ruling };
	}
	return marks;
}
