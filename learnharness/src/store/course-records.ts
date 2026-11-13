/**
 * The CourseRecords adapter: runs the `learning` engine's agent CLI
 * (`python -m learning [--workspace DIR] VERB`), one verb in, one JSON
 * object out. The engine is the only writer of course records; this module
 * only spawns it and maps its exit status, stdout and stderr onto the port's
 * result union.
 *
 * The CLI fits the app better than the engine's MCP server: every turn
 * rebuilds its agent from the record, so a stateless child per verb needs
 * no long-lived process, lifecycle or reconnect logic, and the CLI already
 * prints the exact error JSON the MCP server would wrap.
 */

import { spawn } from "node:child_process";
import { courseLabel, type CourseResult, type CourseSummary, type CourseVerb, type DueReview } from "../core/contracts/course.ts";
import { isTopicLevel, type CourseMap, type CourseMapEdge, type CourseMapTopic, type TopicHandle } from "../core/contracts/course-map.ts";
import type { CourseRecords } from "../core/ports.ts";

export interface EngineCommand {
	/** The interpreter that has the engine's dependencies. */
	python: string;
	/** The engine repository: `PYTHONPATH` and the working directory. */
	root: string;
	/** Per-verb limit; a save that times out may still have landed. */
	timeoutMs?: number;
	/** The child's environment (defaults to this process's). */
	env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 20_000;

interface Exit {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	spawnError?: string;
}

function exec(engine: EngineCommand, args: string[], stdin: string): Promise<Exit> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;
		const finish = (exit: Exit) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(exit);
		};
		const child = spawn(engine.python, ["-m", "learning", ...args], {
			cwd: engine.root,
			env: { ...(engine.env ?? process.env), PYTHONPATH: engine.root, PYTHONIOENCODING: "utf-8" },
			stdio: ["pipe", "pipe", "pipe"],
		});
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, engine.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		child.stdout.setEncoding("utf-8").on("data", (chunk: string) => (stdout += chunk));
		child.stderr.setEncoding("utf-8").on("data", (chunk: string) => (stderr += chunk));
		child.on("error", (error) => finish({ code: null, stdout, stderr, timedOut, spawnError: error.message }));
		child.on("close", (code) => finish({ code, stdout, stderr, timedOut }));
		child.stdin.on("error", () => {});
		child.stdin.end(stdin);
	});
}

function argsFor(verb: CourseVerb): { args: string[]; stdin: string } {
	switch (verb.verb) {
		case "resume":
			return { args: ["resume", ...(verb.task ? ["--task", verb.task] : [])], stdin: "" };
		case "show":
			return { args: verb.handles === "all" ? ["show", "--all"] : ["show", "--", ...verb.handles], stdin: "" };
		case "search":
			return { args: ["search", "--", verb.query], stdin: "" };
		case "save":
			return { args: ["save"], stdin: JSON.stringify(verb.changes) };
		case "plan":
			return { args: ["plan", "--days", String(verb.days ?? 1)], stdin: "" };
		case "sources":
			return { args: ["sources", "--add", ...verb.add], stdin: "" };
		case "forget-course":
			return { args: ["forget", "--course"], stdin: "" };
	}
}

function engineError(text: string): { kind: "validation" | "io"; message: string } | null {
	try {
		const parsed = JSON.parse(text) as { error?: { kind?: unknown; message?: unknown } };
		const { kind, message } = parsed.error ?? {};
		if (typeof message !== "string") return null;
		return { kind: kind === "validation" ? "validation" : "io", message };
	} catch {
		return null;
	}
}

function toResult(exit: Exit, verbName: string): CourseResult {
	if (exit.spawnError) {
		return { ok: false, kind: "unavailable", message: `The learning engine could not start: ${exit.spawnError}` };
	}
	if (exit.timedOut) {
		return {
			ok: false,
			kind: "io",
			message: `${verbName} did not finish in time; a write may have completed, and repeating the identical save is safe`,
		};
	}
	if (exit.code === 0) {
		try {
			return { ok: true, json: JSON.parse(exit.stdout) };
		} catch {
			return { ok: false, kind: "io", message: `${verbName} printed output that is not JSON` };
		}
	}
	const reported = engineError(exit.stderr.trim()) ?? engineError(exit.stdout.trim());
	// A missing or moved workspace is reported as a validation error, but no
	// patch can repair it.
	if (reported && /No study workspace|Study directory does not exist/.test(reported.message)) {
		return { ok: false, kind: "unavailable", message: reported.message };
	}
	if (reported) return { ok: false, ...reported };
	const tail = (exit.stderr.trim() || exit.stdout.trim()).split("\n").slice(-3).join("\n");
	return { ok: false, kind: "io", message: `${verbName} failed${tail ? `: ${tail}` : ""}` };
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** The chooser's view of one `plan --all` course entry. `plan --all` lists
 *  registered workspaces that have a course record, so a course appears
 *  here from its first save on. */
function summaryOf(entry: unknown): CourseSummary | null {
	if (typeof entry !== "object" || entry === null) return null;
	const e = entry as Record<string, unknown>;
	const workspace = str(e.workspace);
	// An entry with `error` is a record the engine could not read: not linkable.
	if (!workspace || "error" in e) return null;
	const dueMore = typeof e.due_more === "number" ? e.due_more : 0;
	const due = Array.isArray(e.due) ? (e.due as unknown[]) : [];
	const task = typeof e.task === "object" && e.task !== null ? (e.task as Record<string, unknown>) : {};
	return {
		workspace,
		title: str(e.title),
		due: due.length + dueMore,
		reviews: due.map(reviewOf).filter((r): r is DueReview => r !== null),
		current: str(e.current),
		currentTitle: str(e.current_title),
		task: str(task.title),
		step: str(task.step),
		exam: examOf(e.exam),
		lastActiveDaysAgo: daysAgoOf(e.last_activity),
	};
}

/** `plan`'s `exam: {date, days_left}`, or null when it has no date. */
function examOf(value: unknown): CourseSummary["exam"] {
	if (typeof value !== "object" || value === null) return null;
	const { date, days_left: daysLeft } = value as Record<string, unknown>;
	return typeof date === "string" && typeof daysLeft === "number" ? { date, daysLeft } : null;
}

/** One `due` entry, `{topic, title?, overdue, gap?}`; null when it names no topic. */
function reviewOf(entry: unknown): DueReview | null {
	if (typeof entry !== "object" || entry === null) return null;
	const { title, topic, overdue, gap } = entry as Record<string, unknown>;
	const name = str(title) ?? str(topic);
	return name ? { title: name, overdue: typeof overdue === "number" ? overdue : 0, gap: str(gap) } : null;
}

/** `last_activity: {date, days_ago}`, or null when the record was never saved. */
function daysAgoOf(value: unknown): number | null {
	if (typeof value !== "object" || value === null) return null;
	const { days_ago: daysAgo } = value as Record<string, unknown>;
	return typeof daysAgo === "number" ? daysAgo : null;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

/** One `map` topic; null when it lacks a handle or an engine level. */
function mapTopicOf(entry: unknown): (CourseMapTopic & { needs: string[]; contrasts: string[] }) | null {
	const e = record(entry);
	const handle = str(e?.topic);
	if (!e || !handle || !isTopicLevel(e.level)) return null;
	const reviewDate = str(e.review);
	const choiceErrors: Record<string, number> = {};
	for (const [method, times] of Object.entries(record(e.choice_errors) ?? {})) if (count(times)) choiceErrors[method] = count(times);
	return {
		handle: handle as TopicHandle,
		title: str(e.title) ?? handle,
		level: e.level,
		introduced: str(e.introduced),
		review: reviewDate
			? typeof e.overdue === "number"
				? { kind: "due", date: reviewDate, overdue: count(e.overdue) }
				: { kind: "scheduled", date: reviewDate }
			: null,
		weak: e.weak === true,
		signals: {
			gap: str(e.gap),
			lapsed: e.lapsed === true,
			stale: e.stale === true,
			choiceErrors,
			confidentErrors: count(e.confident_errors),
		},
		tasks: strings(e.tasks),
		needs: strings(e.needs),
		contrasts: strings(e.contrasts),
	};
}

/** The engine's `map` output as a CourseMap: field renaming, and the
 *  per-topic `needs` and symmetric `contrasts` lists flattened into edges
 *  (one per unordered contrast pair). Edges to topics the map does not list
 *  are dropped; null when the output is not a map at all. */
export function courseMapOf(workspace: string, json: unknown): CourseMap | null {
	const m = record(json);
	if (!m || !Array.isArray(m.topics) || typeof m.today !== "string") return null;
	const parsed = m.topics.map(mapTopicOf).filter((t) => t !== null);
	const listed = new Set<string>(parsed.map((t) => t.handle));
	const edges: CourseMapEdge[] = [];
	const paired = new Set<string>();
	for (const topic of parsed) {
		for (const need of topic.needs) {
			if (listed.has(need)) edges.push({ kind: "needs", prerequisite: need as TopicHandle, topic: topic.handle });
		}
		for (const other of topic.contrasts) {
			const key = [topic.handle, other].sort().join("\u0000");
			if (!listed.has(other) || paired.has(key)) continue;
			paired.add(key);
			edges.push({ kind: "contrasts", pair: [topic.handle, other as TopicHandle] });
		}
	}
	const topics = parsed.map(({ needs: _needs, contrasts: _contrasts, ...topic }) => topic);
	const current = str(m.current);
	const tasks = (Array.isArray(m.tasks) ? m.tasks : []).flatMap((entry) => {
		const t = record(entry);
		const key = str(t?.key);
		return t && key ? [{ key, title: str(t.title) ?? key, step: str(t.step) }] : [];
	});
	return {
		workspace,
		title: str(m.title) ?? courseLabel({ workspace, title: null }),
		today: m.today,
		revision: count(m.revision),
		exam: examOf(m.exam),
		current: current && listed.has(current) ? (current as TopicHandle) : null,
		focus: str(m.focus),
		tasks,
		topics,
		edges,
	};
}

export function createCourseRecords(engine: EngineCommand): CourseRecords {
	return {
		async list() {
			const result = toResult(await exec(engine, ["plan", "--all", "--days", "1"], ""), "plan");
			if (!result.ok) return { available: false, reason: result.message };
			const entries = (result.json as { courses?: unknown }).courses;
			const courses = (Array.isArray(entries) ? entries : [])
				.map(summaryOf)
				.filter((c): c is CourseSummary => c !== null);
			return { available: true, courses };
		},
		async run(workspace, verb) {
			const { args, stdin } = argsFor(verb);
			return toResult(await exec(engine, ["--workspace", workspace, ...args], stdin), verb.verb);
		},
		async map(workspace) {
			const result = toResult(await exec(engine, ["--workspace", workspace, "map"], ""), "map");
			if (!result.ok) return result;
			const map = courseMapOf(workspace, result.json);
			return map ? { ok: true, map } : { ok: false, kind: "io", message: "map printed an unexpected shape" };
		},
		async create(directory, { title, exam }) {
			const init = toResult(await exec(engine, ["--workspace", directory, "init"], ""), "init");
			if (!init.ok) return init;
			const workspace = str((init.json as { workspace?: unknown } | null)?.workspace) ?? directory;
			const record = exam ? { title, exam: { date: exam } } : { title };
			const saved = toResult(await exec(engine, ["--workspace", workspace, "save"], JSON.stringify(record)), "save");
			return saved.ok ? { ok: true, workspace } : saved;
		},
	};
}
