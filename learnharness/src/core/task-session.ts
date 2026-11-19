import { cleanToolCallIds, saveChanges, type LhMessage } from "./native-messages.ts";

/** Where a task he picked up with Continue stands in the session (round
 *  18, m22: a problem sheet's strip read "A worked example", the lesson
 *  plan written before his Continue, then "Every step taught" after part
 *  (c), with parts (d) and (e) still to do). */
export interface TaskSession {
	title: string;
	/** The part he picked it up at, as the record named it then. */
	step: string | null;
	/** The part the session's newest save named next, if one did. */
	next: string | null;
	/** A save since the Continue closed the task. */
	closed: boolean;
	/** The tutor planned the task since the Continue: a plan written before
	 *  it was another lesson's, not this task's. */
	planned: boolean;
}

/** The task his newest Continue picked up, and what the session did with
 *  it since; null when the session holds no Continue on a task. Pure. */
export function taskSessionOf(messages: readonly LhMessage[]): TaskSession | null {
	let at = -1;
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role === "custom" && m.customType === "task-continue") {
			at = i;
			break;
		}
	}
	if (at < 0) return null;
	const details = (messages[at] as { details?: { tasks?: unknown; title?: unknown; step?: unknown } }).details ?? {};
	const keys = Array.isArray(details.tasks) ? details.tasks.filter((k): k is string => typeof k === "string") : [];
	if (typeof details.title !== "string") return null;
	const session: TaskSession = { title: details.title, step: typeof details.step === "string" ? details.step : null, next: null, closed: false, planned: false };
	const clean = cleanToolCallIds(messages);
	for (const m of messages.slice(at + 1)) {
		if (m.role === "toolResult" && m.toolName.startsWith("plan_") && !m.isError && (m.details as { tree?: unknown } | null)?.tree) session.planned = true;
		if (m.role !== "assistant") continue;
		for (const block of m.content) {
			if (block.type !== "toolCall" || block.name !== "course_save" || !clean.has(block.id)) continue;
			const tasks = saveChanges(block.arguments as Record<string, unknown>)?.tasks;
			if (typeof tasks !== "object" || tasks === null) continue;
			for (const [key, patch] of Object.entries(tasks)) {
				if (!keys.includes(key)) continue;
				if (patch === null) session.closed = true;
				const step = (patch as { step?: unknown } | null)?.step;
				if (typeof step === "string" && step.trim()) session.next = step.trim();
			}
		}
	}
	return session;
}
