/**
 * Which recorded attempts mark which answer, and the mark that stands for
 * each (Edo, 14 Nov 2026). Pure.
 *
 * The link is the transcript's own order, never a guess at the text: the
 * attempts a save records after an answer, before the next question,
 * problem, dispute or message of his, mark that answer. A practice
 * problem's are the receipt its `conclude` carries, and any save that
 * re-sends them. The mark itself is the engine's: `answerMarksOf` reads
 * the attempts `show` returned and follows `corrected_by` to the ones
 * that stand.
 */

import type { LhMessage } from "./native-messages.ts";
import { QUESTION_TOOLS } from "./pending.ts";
import type { AnswerMark, MarkGrade, MarkRow, MarkSure } from "./contracts/marks.ts";
import { isMarkResult } from "./contracts/marks.ts";

/** The graded question tools: their answers get marks. */
const GRADED_TOOLS: readonly string[] = ["explain", "recall"];
const GRADES: readonly MarkGrade[] = ["solid", "helped", "missed"];
const SURES: readonly MarkSure[] = ["guess", "neutral", "confident"];
/** The conclude result's receipt line (tools/practice.ts). */
const CONCLUDE_RECEIPT = /Course record: (\{[\s\S]*\})\s*$/;

function textOf(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content.map((part) => (part && typeof part === "object" && (part as { type?: unknown }).type === "text" ? String((part as { text?: unknown }).text ?? "") : "")).join("");
}

/** The new observation ids a save receipt names. */
function receiptIds(json: string): string[] {
	try {
		const ids = (JSON.parse(json) as { observations?: unknown }).observations;
		return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
	} catch {
		return [];
	}
}

function realAnswer(details: unknown): boolean {
	const d = details as { dismissed?: unknown; hintRequested?: unknown } | null;
	return !!d && typeof d === "object" && d.dismissed !== true && d.hintRequested !== true;
}

/** Each answer's recorded attempt ids, keyed by the answer's tool call: a
 *  graded question's call, or a practice problem's conclude. In
 *  transcript order. */
export function markLinks(messages: readonly LhMessage[]): Record<string, string[]> {
	const links: Record<string, string[]> = {};
	const saveOwner = new Map<string, string>();
	let current: string | null = null;
	const add = (key: string, ids: readonly string[]) => {
		if (ids.length === 0) return;
		const seen = links[key] ?? [];
		links[key] = [...seen, ...ids.filter((id) => !seen.includes(id))];
	};
	for (const message of messages) {
		if (message.role === "user") current = null;
		else if (message.role === "custom") {
			if (message.customType === "dispute") current = null;
		} else if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				if (block.name === "course_save" && current) saveOwner.set(block.id, current);
				else if ((QUESTION_TOOLS as readonly string[]).includes(block.name) || block.name === "problem") current = null;
			}
		} else if (message.role === "toolResult") {
			if (GRADED_TOOLS.includes(message.toolName)) {
				current = !message.isError && realAnswer(message.details) ? message.toolCallId : null;
			} else if (message.toolName === "conclude" && !message.isError) {
				const receipt = CONCLUDE_RECEIPT.exec(textOf(message.content));
				current = message.toolCallId;
				if (receipt) add(current, receiptIds(receipt[1]!));
			} else if (message.toolName === "course_save" && !message.isError) {
				const owner = saveOwner.get(message.toolCallId);
				if (owner) add(owner, receiptIds(textOf(message.content)));
			}
		}
	}
	return links;
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
		sure: SURES.find((s) => s === o.sure) ?? null,
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
