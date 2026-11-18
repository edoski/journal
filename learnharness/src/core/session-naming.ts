import { opensTurn, sessionTaskTitleOf, type LhMessage } from "./native-messages.ts";

/**
 * The course topics a session's first turn looked at, in the order it
 * looked: the topics it showed from the record (`course_show`), posed a
 * problem on, or saved an attempt or a note on. When the tutor's first
 * reply did not name the session (`name_session`), the first of them that
 * is on the course's map names it instead, so a direct answer is never
 * listed by his raw message (round 3, 14 Nov 2026). Pure.
 */
export function firstTurnTopics(messages: readonly LhMessage[]): string[] {
	const end = messages.findIndex((m) => m.role === "assistant" && m.stopReason === "stop");
	const turn = end < 0 ? messages : messages.slice(0, end + 1);
	const seen: string[] = [];
	const add = (value: unknown) => {
		for (const handle of handles(value)) if (!seen.includes(handle)) seen.push(handle);
	};
	for (const m of turn) {
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall") continue;
			const args = (block.arguments ?? {}) as Record<string, unknown>;
			if (block.name === "course_show") add(args.handles);
			else if (block.name === "problem") add(args.topics);
			else if (block.name === "course_save") {
				const changes = typeof args.changes === "string" ? parse(args.changes) : args.changes;
				const observations = (changes as { observations?: unknown } | null)?.observations;
				for (const o of Array.isArray(observations) ? observations : []) add((o as { topics?: unknown } | null)?.topics);
			}
		}
	}
	return seen;
}

/** Handles given as a list, a JSON-encoded list, or one handle. */
function handles(value: unknown): string[] {
	const list = typeof value === "string" ? (value.trim().startsWith("[") ? parse(value) : [value]) : value;
	return Array.isArray(list) ? list.filter((h): h is string => typeof h === "string" && h.length > 0) : [];
}

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Whether the session is still on its first turn, the one turn that may
 *  name it (round 4, 14 Nov 2026): no reply has come yet, or none of his
 *  input (an answer, a message, a handoff) has followed the first reply.
 *  Later turns, the first plan's included, keep the name it has, so a
 *  session he left is found under the same name. Pure. */
export function onFirstTurn(messages: readonly LhMessage[]): boolean {
	const reply = messages.findIndex((m) => m.role === "assistant" && m.stopReason !== "aborted" && m.stopReason !== "error");
	return reply < 0 || !messages.slice(reply + 1).some(opensTurn);
}

/** A session's one name on every surface, the chat's head included: the
 *  title its saves gave the task it took up (`sessionTaskTitleOf`), else
 *  the name it was created or named with; a name he gave it himself always
 *  (round 15, m5: "Problem sheet 4" in Sessions and on the calendar,
 *  "Problem sheet 4: rank and nullity" on Home; "Invertible matrices lesson"
 *  on the live card, "Invertible matrices" elsewhere). Pure. */
export function sessionTitleOf(record: { title: string; renamed?: true; messages: readonly LhMessage[] }): string {
	return record.renamed ? record.title : (sessionTaskTitleOf(record.messages) ?? record.title);
}
