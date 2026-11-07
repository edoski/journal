/**
 * The course brief: what a lesson's agent sees of the learner's course
 * record without asking. A field projection of the engine's `resume`, never
 * a rule: levels, due dates and gaps are the engine's verdicts, copied.
 * Everything else (evidence, whole topics, knowledge) is fetched on demand
 * with the course tools.
 *
 * The brief's key is the part that changes the lesson's opening move: the
 * study day, the due topics, the open task's step and the current path
 * topic. A new brief enters the transcript only when the key changes, so
 * the cached prompt prefix holds between saves; level changes in between
 * reach the agent through the save receipts.
 */

export type BriefRole = "teach" | "practice";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

function dueLine(item: unknown, role: BriefRole): string {
	const d = obj(item);
	const facts = [str(d.level), typeof d.overdue === "number" && d.overdue > 0 ? `${d.overdue} days overdue` : undefined]
		.filter(Boolean)
		.join(", ");
	let line = `- ${str(d.topic) ?? "?"}${facts ? ` (${facts})` : ""}`;
	if (role === "practice") {
		if (str(d.prompt)) line += `\n  prompt: ${d.prompt}`;
		const points = list(d.points).filter((p): p is string => typeof p === "string");
		if (points.length > 0) line += `\n  points: ${points.join("; ")}`;
		if (str(d.gap)) line += `\n  gap: ${d.gap}`;
	}
	return line;
}

function weakLine(item: unknown, role: BriefRole): string {
	const w = obj(item);
	const facts = [str(w.level), w.lapsed === true ? "lapsed" : undefined, w.stale === true ? "judgement older than the evidence" : undefined]
		.filter(Boolean)
		.join(", ");
	let line = `- ${str(w.topic) ?? "?"}${facts ? ` (${facts})` : ""}${str(w.gap) ? `: ${w.gap}` : ""}`;
	const errors = obj(w.choice_errors);
	if (role === "practice" && Object.keys(errors).length > 0) {
		line += `; wrongly chose ${Object.entries(errors).map(([t, n]) => `${t} ×${String(n)}`).join(", ")}`;
	}
	return line;
}

/** The brief for one role, and the key that decides when it is re-sent. */
export function projectCourseBrief(resume: unknown, role: BriefRole): { key: string; text: string } {
	const r = obj(resume);
	const course = obj(r.course);
	const exam = obj(course.exam);
	const path = obj(r.path);
	const task = r.task ? obj(r.task) : null;
	const due = list(r.due);

	const lines: string[] = [];
	const examLine = typeof exam.days_left === "number" ? ` · exam in ${exam.days_left} days` : "";
	lines.push(`[Course record] ${str(course.title) ?? "Untitled course"} · today ${str(r.today) ?? "?"}${examLine}`);
	const topics = list(path.topics)
		.map((t) => (Array.isArray(t) ? `${String(t[0])} (${String(t[1])})` : undefined))
		.filter(Boolean);
	if (topics.length > 0) lines.push(`Path${str(path.current) ? `, current ${path.current}` : ""}: ${topics.join(", ")}`);
	if (due.length > 0) {
		const more = typeof r.due_more === "number" && r.due_more > 0 ? ` (and ${r.due_more} more)` : "";
		lines.push(`Due today${more}:`, ...due.map((d) => dueLine(d, role)));
	} else {
		lines.push("Due today: nothing.");
	}
	const weak = list(r.weak);
	if (weak.length > 0) lines.push("Weak:", ...weak.map((w) => weakLine(w, role)));
	if (task) {
		lines.push(`Open task ${str(task.key) ?? ""}: ${str(task.title) ?? ""}`.trimEnd());
		if (str(task.goal)) lines.push(`  goal: ${task.goal}`);
		if (str(task.step)) lines.push(`  next step: ${task.step}`);
	}
	const prefs = Object.entries(obj(r.preferences)).filter(([, v]) => typeof v === "string");
	if (prefs.length > 0) lines.push("Preferences:", ...prefs.map(([k, v]) => `- ${k}: ${String(v)}`));
	const pinned = Object.entries(obj(r.knowledge)).filter(([, v]) => obj(v).pinned === true);
	if (pinned.length > 0) lines.push("Standing conventions:", ...pinned.map(([k, v]) => `- ${k}: ${String(obj(v).text ?? "")}`));
	lines.push("Read whole topics, evidence and knowledge with course_show or course_search.");

	const key = JSON.stringify([
		r.today ?? null,
		due.map((d) => obj(d).topic ?? null),
		task ? [task.key ?? null, task.step ?? null] : null,
		path.current ?? null,
		role,
	]);
	return { key, text: lines.join("\n") };
}
