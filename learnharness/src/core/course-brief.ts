/**
 * The course brief: what a lesson's agent sees of the learner's course
 * record without asking. A field projection of the engine's `resume`, never
 * a rule: levels, due dates and gaps are the engine's verdicts, copied.
 * Everything else (evidence, whole topics, knowledge) is fetched on demand
 * with the course tools.
 *
 * The brief's key is the part that changes the lesson's opening move: the
 * study day, the due topics, the open tasks' steps and the current path
 * topic. A new brief enters the transcript only when the key changes, so
 * the cached prompt prefix holds between saves; level changes in between
 * reach the agent through the save receipts.
 */

export type BriefRole = "teach" | "practice";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayWithWeekday(day: string | undefined): string {
	if (!day) return "?";
	const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
	return weekday ? `${day} (${weekday})` : day;
}

const daysOverdue = (n: number): string => `${n} ${n === 1 ? "day" : "days"} overdue`;

/**
 * A due or weak entry with its topic's detail. The engine writes a topic's
 * `prompt`, `points`, `gap` and error counts once, under `resume.topics`, and
 * leaves them off the due and weak entries of those topics.
 */
function withDetail(item: unknown, topics: Json): Json {
	const entry = obj(item);
	const topic = obj(topics[str(entry.topic) ?? ""]);
	const review = obj(topic.review);
	const standing = obj(topic.standing);
	const detail: Json = {
		prompt: review.prompt,
		points: review.points,
		gap: topic.gap,
		choice_errors: standing.choice_errors,
		confident_errors: standing.confident_errors,
	};
	return { ...detail, ...entry };
}

function dueLine(d: Json, role: BriefRole): string {
	const facts = [str(d.level), typeof d.overdue === "number" && d.overdue > 0 ? daysOverdue(d.overdue) : undefined]
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

function weakLine(w: Json, role: BriefRole): string {
	const facts = [str(w.level), w.lapsed === true ? "lapsed" : undefined, w.stale === true ? "judgement older than the evidence" : undefined]
		.filter(Boolean)
		.join(", ");
	let line = `- ${str(w.topic) ?? "?"}${facts ? ` (${facts})` : ""}${str(w.gap) ? `: ${w.gap}` : ""}`;
	if (typeof w.confident_errors === "number" && w.confident_errors > 0) line += `; sure but wrong ×${w.confident_errors}`;
	const errors = obj(w.choice_errors);
	if (role === "practice" && Object.keys(errors).length > 0) {
		line += `; wrongly chose ${Object.entries(errors).map(([t, n]) => `${t} ×${String(n)}`).join(", ")}`;
	}
	return line;
}

function dueHeading(r: Json, shown: number): string {
	const more = typeof r.due_more === "number" && r.due_more > 0 ? r.due_more : 0;
	if (more === 0) return "Due today:";
	const oldest = obj(r.due_oldest);
	const tail =
		str(oldest.topic) && typeof oldest.overdue === "number" ? `, among them the most overdue, ${oldest.topic} (${daysOverdue(oldest.overdue)})` : "";
	return `Due today: ${shown + more} topics; the first ${shown} are below, ${more} more not listed${tail}:`;
}

function taskLines(r: Json): string[] {
	const others = list(r.tasks).map(obj);
	if (r.task) {
		const task = obj(r.task);
		const lines = [`Open task ${str(task.key) ?? ""}: ${str(task.title) ?? ""}`.trimEnd()];
		if (str(task.goal)) lines.push(`  goal: ${task.goal}`);
		if (str(task.step)) lines.push(`  next step: ${task.step}`);
		if (others.length > 0) lines.push(`Other open tasks: ${others.map((t) => str(t.key) ?? "?").join(", ")}`);
		return lines;
	}
	if (others.length === 0) return [];
	return [
		"Open tasks, none in focus:",
		...others.map((t) => {
			const head = `- ${str(t.key) ?? "?"}${str(t.title) ? `: ${t.title}` : ""}`;
			return str(t.step) ? `${head}\n  next step: ${t.step}` : head;
		}),
	];
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
	lines.push(`[Course record] ${str(course.title) ?? "Untitled course"} · today ${dayWithWeekday(str(r.today))}${examLine}`);
	const topics = list(path.topics)
		.map((t) => (Array.isArray(t) ? `${String(t[0])} (${String(t[1])})` : undefined))
		.filter(Boolean);
	if (topics.length > 0) lines.push(`Path${str(path.current) ? `, current ${path.current}` : ""}: ${topics.join(", ")}`);
	const detail = obj(r.topics);
	if (due.length > 0) {
		lines.push(dueHeading(r, due.length), ...due.map((d) => dueLine(withDetail(d, detail), role)));
	} else {
		lines.push("Due today: nothing.");
	}
	const weak = list(r.weak);
	if (weak.length > 0) lines.push("Weak:", ...weak.map((w) => weakLine(withDetail(w, detail), role)));
	lines.push(...taskLines(r));
	const prefs = Object.entries(obj(r.preferences)).filter(([, v]) => typeof v === "string");
	if (prefs.length > 0) lines.push("Preferences:", ...prefs.map(([k, v]) => `- ${k}: ${String(v)}`));
	const pinned = Object.entries(obj(r.knowledge)).filter(([, v]) => obj(v).pinned === true);
	if (pinned.length > 0) lines.push("Standing conventions:", ...pinned.map(([k, v]) => `- ${k}: ${String(obj(v).text ?? "")}`));
	lines.push("Read whole topics, evidence and knowledge with course_show or course_search.");

	const key = JSON.stringify([
		r.today ?? null,
		due.map((d) => obj(d).topic ?? null),
		task ? [task.key ?? null, task.step ?? null] : null,
		list(r.tasks).map((t) => [obj(t).key ?? null, obj(t).step ?? null]),
		path.current ?? null,
		role,
	]);
	return { key, text: lines.join("\n") };
}
