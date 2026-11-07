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
import type { CourseResult, CourseSummary, CourseVerb } from "../core/contracts/course.ts";
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
	return {
		workspace,
		title: str(e.title),
		due: (Array.isArray(e.due) ? e.due.length : 0) + dueMore,
		current: str(e.current),
		task: str((e.task as { title?: unknown } | undefined)?.title),
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
		async create(directory, title) {
			const init = toResult(await exec(engine, ["--workspace", directory, "init"], ""), "init");
			if (!init.ok) return init;
			const workspace = str((init.json as { workspace?: unknown } | null)?.workspace) ?? directory;
			const saved = toResult(await exec(engine, ["--workspace", workspace, "save"], JSON.stringify({ title })), "save");
			return saved.ok ? { ok: true, workspace } : saved;
		},
	};
}
