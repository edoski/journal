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

import { answeredQuestionsOf, finalSubmissionOf, HIS_MESSAGE, saveChanges, savedQuestionsOf, type LhMessage } from "./native-messages.ts";
import { practiceObservations, type PracticeConclusion } from "./practice-attempts.ts";
import type { AnswerSaves } from "./contracts/chat.ts";
import type { AnswerMark, MarkGrade, MarkRow } from "./contracts/marks.ts";
import { chosenSure, isMarkResult, markHow } from "./contracts/marks.ts";

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

/** Where each answer sits in the transcript: a question's call, or his
 *  message. */
function placesOf(messages: readonly LhMessage[]): Map<string, number> {
	const place = new Map<string, number>();
	messages.forEach((message, i) => {
		if (message.role === "user") place.set(message.id, i);
		else if (message.role === "assistant") for (const block of message.content) if (block.type === "toolCall") place.set(block.id, i);
	});
	return place;
}

/** Each answer's recorded attempt ids, keyed by the answer's tool call: a
 *  graded question's call, a practice problem's conclude, or his message.
 *  In transcript order. The record's kept save links (`answerSaves`) fill
 *  in only the attempts no save in the transcript links, so a save the
 *  transcript lost to a restart still marks its answer, and a link the
 *  transcript holds is never copied onto another answer. A kept link to an
 *  answer the lesson does not hold marks nothing, except while a turn runs
 *  (`running`): its calls, a problem's conclude among them, reach the
 *  transcript only when it ends, and the card shows as soon as the engine
 *  holds the attempts (round 15, 2 D2). Every reader of the links passes
 *  the whole record, so none leaves the kept ones out. */
export function markLinks(record: { readonly messages: readonly LhMessage[]; readonly answerSaves?: AnswerSaves }, { running = false }: { running?: boolean } = {}): Record<string, string[]> {
	const { messages, answerSaves: saves = {} } = record;
	const links = transcriptLinks(messages);
	const answered = answeredQuestionsOf(messages);
	const place = placesOf(messages);
	const linked = new Set(Object.values(links).flat());
	for (const [key, ids] of Object.entries(saves)) {
		if (!(answered.has(key) || messages.some((m) => m.role === "user" && m.id === key) || (running && !place.has(key)))) continue;
		const found = ids.filter((id) => typeof id === "string" && !linked.has(id));
		for (const id of found) linked.add(id);
		if (found.length) links[key] = [...(links[key] ?? []), ...found];
	}
	if (Object.keys(saves).length === 0) return links;
	const order = (key: string) => place.get(key) ?? Number.MAX_SAFE_INTEGER;
	return Object.fromEntries(Object.entries(links).sort(([a], [b]) => order(a) - order(b)));
}

/** The links the transcript's saves and concludes make. */
function transcriptLinks(messages: readonly LhMessage[]): Record<string, string[]> {
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

/** Every attempt this session's saves and problems recorded, its receipts
 *  and the saves kept with the lesson the moment the engine took them,
 *  since a restart can lose the transcript's receipt (round 8). Pure. */
export function savedOf(messages: readonly LhMessage[], kept?: AnswerSaves): Set<string> {
	const saved = new Set<string>(Object.values(kept ?? {}).flat());
	for (const message of messages) {
		if (message.role !== "toolResult" || message.isError) continue;
		if (message.toolName === "conclude") {
			const receipt = CONCLUDE_RECEIPT.exec(textOf(message.content));
			if (receipt) for (const id of savedIds(receipt[1]!)) saved.add(id);
		} else if (message.toolName === "course_save") {
			for (const id of savedIds(textOf(message.content))) saved.add(id);
		}
	}
	return saved;
}

/** The engine's grade of an attempt (learning/progress.py `grade`): solid
 *  when right, unaided, certain and no guess; missed when wrong; helped
 *  otherwise. Read only where the engine cannot be: `savedAttemptsOf`. */
function engineGrade(o: Record<string, unknown>): MarkGrade {
	if (o.result === "incorrect") return "missed";
	const unaided = o.kind === "exam" || o.help === "none";
	return o.result === "correct" && unaided && !("uncertain" in o) && o.sure !== "guess" ? "solid" : "helped";
}

/** A value the tool boundary may have sent as JSON text, parsed. */
function parsed(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function listOf(value: unknown): unknown[] {
	const list = parsed(value);
	return Array.isArray(list) ? list : [];
}

function objectOf(value: unknown): Record<string, unknown> | null {
	const object = parsed(value);
	return object && typeof object === "object" && !Array.isArray(object) ? (object as Record<string, unknown>) : null;
}

/** The attempts this session's own saves sent, by the id each receipt gave
 *  them, as `show` returns them: a lesson save's observations, and a
 *  concluded problem's first try and final answer (practice-attempts.ts
 *  `practiceObservations`), lined up with its receipt from the newest. A
 *  re-mark names the attempt it corrects (`corrected_by`). The marks of a
 *  lesson opened while its course's record can't be read come from here
 *  (round 20, M4: a practice lesson opened after its record became
 *  unreadable showed its answers unmarked). Pure. */
export function savedAttemptsOf(messages: readonly LhMessage[]): Record<string, Record<string, unknown>> {
	const calls = new Map<string, { name: string; args: unknown }>();
	const attempts: Record<string, Record<string, unknown>> = {};
	let pose: { id: string; statement: string; topics: string[] } | null = null;
	const keep = (ids: readonly string[], sent: readonly unknown[]) => {
		const from = sent.length - ids.length;
		ids.forEach((id, i) => {
			const o = objectOf(sent[from + i]);
			if (o) attempts[id] = { kind: "attempt", ...o };
		});
	};
	for (const [at, message] of messages.entries()) {
		if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				calls.set(block.id, { name: block.name, args: block.arguments });
				if (block.name !== "problem") continue;
				const args = objectOf(block.arguments);
				pose = { id: block.id, statement: typeof args?.statement === "string" ? args.statement : "", topics: ids(listOf(args?.topics)) };
			}
		} else if (message.role === "toolResult" && !message.isError) {
			const call = calls.get(message.toolCallId);
			if (message.toolName === "course_save") {
				const listed = saveChanges(objectOf(call?.args) ?? {})?.observations;
				keep(savedIds(textOf(message.content)), Array.isArray(listed) ? listed : []);
			} else if (message.toolName === "conclude" && pose) {
				const receipt = CONCLUDE_RECEIPT.exec(textOf(message.content));
				const conclusion = objectOf(call?.args) as PracticeConclusion | null;
				if (!receipt || !conclusion || conclusion.result === undefined) continue;
				const final = finalSubmissionOf(messages.slice(0, at), pose.id);
				keep(savedIds(receipt[1]!), practiceObservations(pose, conclusion, final?.kind === "work" ? final.confidence : undefined));
			}
		}
	}
	for (const [id, o] of Object.entries(attempts)) {
		o.grade = engineGrade(o);
		for (const target of ids(o.corrects)) {
			const corrected = attempts[target];
			if (corrected) corrected.corrected_by = [...ids(corrected.corrected_by), id];
		}
	}
	return attempts;
}

/** What a re-mark in this session may correct: every attempt a dispute of
 *  his named, which only a ruling on that dispute re-marks (Edo, round 14
 *  m12: never re-mark unasked). Pure. */
export function remarkableOf(messages: readonly LhMessage[]): { disputed: Set<string> } {
	const disputed = new Set<string>();
	for (const message of messages) {
		if (message.role === "custom" && message.customType === "dispute") {
			for (const id of ids((message.details as { observations?: unknown } | null)?.observations)) disputed.add(id);
		}
	}
	return { disputed };
}

/** The answer whose mark ⌘⇧M disputes: the newest one with a mark. */
export function latestMarkedAnswer(messages: readonly LhMessage[], marks: Readonly<Record<string, AnswerMark>>): string | null {
	const place = placesOf(messages);
	let latest: string | null = null;
	for (const key of Object.keys(marks)) {
		const at = place.get(key);
		if (at !== undefined && (latest === null || at >= place.get(latest)!)) latest = key;
	}
	return latest;
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
		const disputed = [...new Set(found.flatMap((f) => f.chain))].some((id) => typeof item(observations, id)?.disputed === "string");
		const changed = disputed && ids.some((id, i) => {
			const before = rowOf(observations, id);
			return before !== null && found[i]!.leaves.some((leaf) => {
				const after = rowOf(observations, leaf);
				return after !== null && (after.result !== before.result || markHow(after) !== markHow(before) || after.sure !== before.sure);
			});
		});
		marks[key] = { rows: labelled(rows, titles), disputed, changed };
	}
	return marks;
}
