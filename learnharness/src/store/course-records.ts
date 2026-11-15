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
import * as fs from "node:fs";
import * as path from "node:path";
import { emit } from "../core/events.ts";
import {
	courseLabel,
	type CourseResult,
	type CourseSummary,
	type CourseVerb,
	type DueReview,
	type UnreadableCourse,
	type UnreadableProblem,
} from "../core/contracts/course.ts";
import { EXAM_GAP_REASONS, isTopicLevel, type CourseExam, type ExamGapReason, type CourseMap, type CourseMapEdge, type CourseMapTopic, type RightAnswer, type TopicHandle, type TopicMoved } from "../core/contracts/course-map.ts";
import type { CourseRecords } from "../core/ports.ts";
import { arcBlockOf, startsWhyOf, type ArcBlock } from "./course-arcs.ts";

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
		const child = spawn(engine.python, ["-m", "learning", ...args], {
			cwd: engine.root,
			env: { ...(engine.env ?? process.env), PYTHONPATH: engine.root, PYTHONIOENCODING: "utf-8" },
			stdio: ["pipe", "pipe", "pipe"],
			timeout: engine.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			killSignal: "SIGKILL",
		});
		child.stdout.setEncoding("utf-8").on("data", (chunk: string) => (stdout += chunk));
		child.stderr.setEncoding("utf-8").on("data", (chunk: string) => (stderr += chunk));
		// Only spawn's timeout kills the engine, so a killed child timed out.
		// A spawn failure may fire close after error; the promise keeps the first.
		child.on("error", (error) => resolve({ code: null, stdout, stderr, timedOut: child.killed, spawnError: error.message }));
		child.on("close", (code) => resolve({ code, stdout, stderr, timedOut: child.killed }));
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
		case "check":
			return { args: ["save", "--check"], stdin: JSON.stringify(verb.changes) };
		case "arcs":
			return { args: ["arcs", ...(verb.here ? ["--here", verb.here] : []), ...(verb.open?.length ? ["--open", ...verb.open] : []), ...(verb.report ? ["--report"] : [])], stdin: "" };
		case "plan":
			return { args: ["plan", "--days", String(verb.days ?? 1)], stdin: "" };
		case "standing":
			return { args: ["standing"], stdin: "" };
		case "sources":
			return { args: "scan" in verb ? ["sources", verb.scan === true ? "--scan" : `--scan=${verb.scan}`] : ["sources", "--add", ...verb.add], stdin: "" };
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

const PROBLEMS: readonly UnreadableProblem[] = ["denied", "damaged", "unreadable"];

/** One `plan --all` course entry: a course, or, for an entry with `error`,
 *  a course the engine could not read, by its folder's name. `plan --all`
 *  lists registered workspaces that have a course record, so a course
 *  appears here from its first save on. Null when it names no workspace. */
function entryOf(entry: unknown): { course: CourseSummary } | { unreadable: UnreadableCourse } | null {
	const e = record(entry);
	const workspace = str(e?.workspace);
	if (!e || !workspace) return null;
	if ("error" in e) {
		const problem = PROBLEMS.find((p) => p === e.problem) ?? "unreadable";
		return { unreadable: { workspace, title: courseLabel({ workspace, title: null }), problem } };
	}
	return { course: summaryOf(workspace, e) };
}

function summaryOf(workspace: string, e: Record<string, unknown>): CourseSummary {
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
		lastActiveDaysAgo: daysAgoOf(e.last_studied),
	};
}

/** `plan`'s `exam: {date, days_left}`, or null when it has no date. */
function examOf(value: unknown): CourseSummary["exam"] {
	if (typeof value !== "object" || value === null) return null;
	const { date, days_left: daysLeft } = value as Record<string, unknown>;
	return typeof date === "string" && typeof daysLeft === "number" ? { date, daysLeft } : null;
}

/** The map's exam with its run-up and its scope: its arcs and the topics
 *  it leaves out, in a course with or without arcs; topic and arc handles
 *  the map does not list are dropped. A scope stays a list when none of
 *  its arcs is shown: the exam then examines none of them. */
function mapExamOf(value: unknown, listed: ReadonlySet<string>, block: ArcBlock): CourseExam | null {
	const exam = examOf(value);
	const e = record(value);
	if (!exam || !e) return null;
	const handles = (v: unknown) => strings(v).filter((h) => listed.has(h)) as TopicHandle[];
	const finalReview = str(e.final_review);
	const doesNotFit = handles(e.does_not_fit);
	const unreviewed = handles(e.unreviewed);
	const arcs = block.arcs && Array.isArray(e.arcs) ? strings(e.arcs).flatMap((a) => block.arcOf(a) ?? []) : null;
	const leavesOut = handles(e.leaves_out);
	const reasons = Object.fromEntries(
		Object.entries(record(e.reasons) ?? {}).filter(([h, r]) => listed.has(h) && EXAM_GAP_REASONS.includes(r as ExamGapReason)),
	) as Partial<Record<TopicHandle, ExamGapReason>>;
	return {
		...exam,
		...(finalReview ? { finalReview } : {}),
		...(doesNotFit.length > 0 ? { doesNotFit } : {}),
		...(unreviewed.length > 0 ? { unreviewed } : {}),
		...(Object.keys(reasons).length > 0 ? { reasons } : {}),
		...(arcs ? { arcs } : {}),
		...(leavesOut.length > 0 ? { leavesOut } : {}),
	};
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

const RIGHT_ANSWERS: readonly RightAnswer[] = ["unaided", "helped", "guess", "uncertain", "partial"];
const isRightAnswer = (value: unknown): value is RightAnswer => RIGHT_ANSWERS.includes(value as RightAnswer);

/** The engine's `moved`, when it is one the app can say. */
function movedOf(value: unknown): { moved: TopicMoved } | Record<string, never> {
	const m = record(value);
	const from = str(m?.from);
	if (!m || !from) return {};
	if (m.by === "study") return { moved: { from, by: "study", courses: strings(m.courses), day: m.day === "yesterday" ? "yesterday" : "today" } };
	return m.by === "missed" || m.by === "left" ? { moved: { from, by: m.by } } : {};
}

/** One `map` topic with its raw edges, arc and start reason; null when it
 *  lacks a handle or an engine level. */
function mapTopicOf(entry: unknown): (CourseMapTopic & { needs: string[]; contrasts: string[]; rawArc: string | null; rawWhy: unknown }) | null {
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
				: { kind: "scheduled", date: reviewDate, ...(e.held === true && str(e.due) ? { held: { exam: str(e.held_for), since: str(e.due)! } } : {}) }
			: null,
		weak: e.weak === true,
		...(isRightAnswer(e.right) ? { right: e.right } : {}),
		signals: {
			gap: str(e.gap),
			lapsed: e.lapsed === true,
			stale: e.stale === true,
			choiceErrors,
			confidentErrors: count(e.confident_errors),
			repaired: e.repaired === true,
			...(e.repaired_with_help === true ? { repairedWithHelp: true } : {}),
			...(e.mistake === true ? { mistake: true } : {}),
		},
		tasks: strings(e.tasks),
		...(str(e.excluded) ? { excluded: str(e.excluded)! } : {}),
		...(str(e.starts) ? { starts: str(e.starts)! } : {}),
		...(str(e.starts) && strings(e.starts_after).length > 0 ? { startsAfter: strings(e.starts_after) } : {}),
		...movedOf(e.moved),
		needs: strings(e.needs),
		contrasts: strings(e.contrasts),
		rawArc: str(e.arc),
		rawWhy: str(e.starts) ? e.starts_why : null,
	};
}

/** The engine's `map` output as a CourseMap: field renaming, the
 *  per-topic `needs` and symmetric `contrasts` lists flattened into edges
 *  (one per unordered contrast pair), and the arc block whole or not at
 *  all (`arcBlockOf`). Edges to topics the map does not list are dropped;
 *  null when the output is not a map at all. */
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
	const block = arcBlockOf(
		workspace,
		m,
		parsed.map((t) => ({ handle: t.handle, excluded: t.excluded !== undefined, arc: t.rawArc })),
	);
	const topics = parsed.map(({ needs: _needs, contrasts: _contrasts, rawArc, rawWhy, ...topic }): CourseMapTopic => {
		const arc = block.arcOf(rawArc);
		const startsWhy = startsWhyOf(rawWhy, listed, block.arcOf);
		return { ...topic, ...(arc ? { arc } : {}), ...(startsWhy ? { startsWhy } : {}) };
	});
	const current = str(m.current);
	const tasks = (Array.isArray(m.tasks) ? m.tasks : []).flatMap((entry) => {
		const t = record(entry);
		const key = str(t?.key);
		const topics = Array.isArray(t?.topics) ? t.topics.filter((h): h is TopicHandle => typeof h === "string" && listed.has(h)) : null;
		return t && key ? [{ key, title: str(t.title) ?? key, step: str(t.step), updated: str(t.updated), ...(topics ? { topics } : {}) }] : [];
	});
	return {
		workspace,
		title: str(m.title) ?? courseLabel({ workspace, title: null }),
		today: m.today,
		revision: count(m.revision),
		exam: mapExamOf(m.exam, listed, block),
		current: current && listed.has(current) ? (current as TopicHandle) : null,
		focus: str(m.focus),
		tasks,
		topics,
		edges,
		...(block.arcs ? { arcs: block.arcs } : {}),
		...(block.currentArc ? { currentArc: block.currentArc } : {}),
	};
}

/** The verbs that write the course record. `sources --scan` only lists
 *  the material folder, so it announces nothing: announcing it made every
 *  reader that refetches on `course-changed` and scans again loop. */
const WRITE_VERBS: ReadonlySet<CourseVerb["verb"]> = new Set(["save", "sources", "forget-course"]);
const writes = (verb: CourseVerb): boolean => WRITE_VERBS.has(verb.verb) && !("scan" in verb);

/** Whether the course was deleted: the engine's `forget --course` unlinks
 *  the record and leaves the initialised `.study` folder behind. An
 *  unreadable or damaged record is still there; a folder never made a
 *  course has no `.study`. A cheap, synchronous read for every turn. */
export function courseRecordForgotten(workspace: string): boolean {
	const study = path.join(workspace, ".study");
	return fs.existsSync(study) && !fs.existsSync(path.join(study, "course.json"));
}

/** Watch one course's record for writes from any host (Claude Code and
 *  Claude Desktop save through the engine's MCP server, never through the
 *  app). The engine keeps the record at `<workspace>/.study/course.json` and
 *  replaces it whole on each save, so the folder is watched, not the file.
 *  Returns the unwatch; a course whose folder is missing is not watched. */
export function watchCourseRecord(workspace: string, onChange: () => void): () => void {
	try {
		const watcher = fs.watch(path.join(workspace, ".study"), (_event, file) => {
			if (file === null || String(file) === "course.json") onChange();
		});
		watcher.on("error", () => watcher.close());
		return () => watcher.close();
	} catch {
		return () => {};
	}
}

export function createCourseRecords(engine: EngineCommand): CourseRecords {
	return {
		forgotten: courseRecordForgotten,
		async list() {
			const result = toResult(await exec(engine, ["plan", "--all", "--days", "1"], ""), "plan");
			if (!result.ok) return { available: false, reason: result.message };
			const entries = (result.json as { courses?: unknown }).courses;
			const read = (Array.isArray(entries) ? entries : []).map(entryOf);
			return {
				available: true,
				courses: read.flatMap((r) => (r && "course" in r ? [r.course] : [])),
				unreadable: read.flatMap((r) => (r && "unreadable" in r ? [r.unreadable] : [])),
			};
		},
		async run(workspace, verb) {
			const { args, stdin } = argsFor(verb);
			const result = toResult(await exec(engine, ["--workspace", workspace, ...args], stdin), verb.verb);
			// A save that timed out may have landed too: announce it.
			if (writes(verb) && (result.ok || result.kind === "io")) emit("course-changed", { workspace });
			return result;
		},
		async map(workspace, here) {
			const result = toResult(await exec(engine, ["--workspace", workspace, "map", ...(here ? ["--here", here] : [])], ""), "map");
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
			emit("course-changed", { workspace });
			return saved.ok ? { ok: true, workspace } : saved;
		},
	};
}
