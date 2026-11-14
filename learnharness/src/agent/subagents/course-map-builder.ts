/**
 * The course map builder: when a course gets material, one background
 * agent reads it and builds or extends the course's topic map
 * (core/course-map-build.ts holds the rules). It follows the tutor
 * doctrine's one path-building recipe, the same text Claude Code and
 * Claude Desktop read. It writes the engine only, through the
 * CourseRecords port, in one save at the end, so a build that stops early
 * leaves the course exactly as it was. It never posts into a chat.
 *
 * It shows in the activity dock as a run of the shared background registry
 * (phase "mapping"), takes a permit of the shared background-LLM pool, and
 * keeps a per-course ledger of the material it read.
 */

import fs from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { CourseMapLedgers, CourseRecords } from "../../core/ports.ts";
import {
	answerProblems,
	buildWindow,
	courseView,
	ledgerSources,
	mapChanges,
	sourcesOf,
	type CourseMapLedger,
	type MapCourseView,
	type MapSubmit,
} from "../../core/course-map-build.ts";
import { CLAUDE_LIMIT_TEXT } from "../../core/contracts/claude.ts";
import { recordHasArcs } from "../../core/contracts/course.ts";
import type { PiEngine } from "../models.ts";
import { courseMapDoctrine } from "../prompt-segments.ts";
import { createMaterialTools, measureMaterial, readingRounds, type MaterialFile } from "../tools/material.ts";
import { withBgLlmSlot } from "./bg-llm-semaphore.ts";
import { finishRun, setRunPhase } from "./background-runs.ts";
import { runSubmitAgent } from "./submit-agent.ts";

const SUBMIT_TOOL = "submit_map";
/** Model rounds beyond reading: one to look at the course, one to submit,
 *  and the submit seam's own retry budget for an answer it refuses
 *  (runSubmitAgent's default of 4). */
const SUBMIT_ROUNDS = 6;

const refSchema = Type.Object({
	source: Type.String({ description: "A registered source's handle." }),
	locator: Type.Optional(Type.String({ description: "Where in it: page, slide, section or exercise." })),
});

const mapSchema = Type.Object({
	topics: Type.Array(
		Type.Object({
			handle: Type.String({ description: "A short lowercase handle; an existing topic's handle when it is the same idea." }),
			title: Type.String({ description: "The topic's name as a heading reads, every piece of math in it as $…$ LaTeX." }),
			needs: Type.Optional(Type.Array(Type.String(), { description: "Handles of its true, direct prerequisites." })),
			contrasts: Type.Optional(Type.Array(Type.String(), { description: "Handles of methods it competes with." })),
			refs: Type.Optional(Type.Array(refSchema, { description: "Every place the material teaches it." })),
			aliases: Type.Optional(Type.Array(Type.String(), { description: "Other names the material uses." })),
			excluded: Type.Optional(Type.String({ description: "Only when the material says the exam leaves it out: why, in one line." })),
		}),
	),
	order: Type.Array(Type.String(), { description: "Every topic's handle in study order: prerequisites first, then the material's order." }),
	current: Type.Optional(Type.String({ description: "Where to start." })),
	basis: Type.Optional(Type.String({ description: "Where the order comes from, in one line." })),
	exam: Type.Optional(
		Type.Object({
			coverage: Type.Optional(Type.String({ description: "What the exam covers, as the material states it." })),
			format: Type.Optional(Type.String({ description: "The exam's format, as the material states it." })),
		}),
	),
	unread: Type.Optional(Type.Array(Type.Object({ source: Type.String(), reason: Type.String() }), { description: "Sources you could not read, each with why." })),
});

export const COURSE_MAP_INSTRUCTIONS = `You build a course's topic map from its material, following the recipe below. You answer with one ${SUBMIT_TOOL} call; the app saves it to the course record.

How this differs from the recipe's tools:
- The material is already registered. Cite its sources by the handles listed, and read them with read_material, search_material and render_pages.
- Read every source before you answer. A long PDF is read in parts: follow each read's note on where to continue. A book longer than the course needs: read its table of contents, then the chapters the other material or the syllabus points to, and find the rest with search_material. A page with no text layer is a scan: render it to read it.
- The course may already have a map, listed with its handles. Update by handle: when the material teaches an idea the map already has, under any wording, send that topic's existing handle with only what is new (references, prerequisites, competing methods). Never repeat, reword or rename a topic; a new handle is only for an idea the map lacks. The app refuses a new topic whose name matches an existing one.
- A source you cannot read, or a scan you cannot make out, goes under unread with the reason; never guess its content.
- A title is the topic's name as a heading reads ("Singular value decomposition", "$k$-means"). Every piece of math in a title is LaTeX in $…$, as in every text the record keeps, never bare: "$\\det(AB) = \\det A \\det B$", not "det(AB) = det A · det B". The app typesets it on the map, the course page and the topic's header. Other names the material uses go in aliases.

`;

/** The course and its material, as the agent reads them. */
function mapPrompt(title: string, view: MapCourseView, files: readonly MaterialFile[], examDate: string | null, record: unknown, folders: ReadonlySet<string>): string {
	const lines = [`# Course: ${title}`];
	const about = obj(record).goal;
	if (typeof about === "string" && about.trim()) lines.push(`About the course, in the learner's words: ${about.trim()}`);
	if (examDate) lines.push(`Exam: ${examDate}`);
	if (view.exam.coverage) lines.push(`Exam coverage on record: ${view.exam.coverage}`);
	lines.push("", "## Material to read");
	for (const f of files) {
		const facts =
			f.kind === "pdf"
				? [`PDF, ${f.pages} pages`, f.scanned && f.scanned.length > 0 ? `${f.scanned.length === f.pages ? "every page" : `${f.scanned.length} pages`} without a text layer` : ""]
				: f.kind === "text"
					? [`text, ${f.chars} characters`]
					: [`cannot be read: ${f.problem}`];
		lines.push(`- ${f.handle}: ${f.title ? `${f.title}, ` : ""}${f.registered} (${facts.filter(Boolean).join("; ")})`);
	}
	const fresh = new Set(files.map((f) => f.handle));
	lines.push("", "## Every registered source (cite these handles)");
	for (const [handle, source] of Object.entries(obj(obj(record).sources))) {
		if (folders.has(handle)) continue;
		const s = obj(source);
		lines.push(`- ${handle}: ${typeof s.title === "string" ? `${s.title}, ` : ""}${String(s.path ?? "")}${fresh.has(handle) ? " (to read now)" : " (read before; its topics are on the map)"}`);
	}
	const knowledge = Object.entries(obj(obj(record).knowledge));
	if (knowledge.length > 0) {
		lines.push("", "## The course's knowledge entries (facts about the course, not topics; never turn one into a topic twice)");
		for (const [handle, entry] of knowledge) lines.push(`- ${handle}: ${String(obj(entry).text ?? "").split("\n")[0]}`);
	}
	const topics = Object.entries(view.topics);
	if (topics.length === 0) {
		lines.push("", "The course has no map yet: build it whole.");
	} else {
		lines.push("", "## The map so far (extend it; keep these handles)");
		for (const [handle, t] of topics) {
			const facts = [
				t.needs.length > 0 ? `needs ${t.needs.join(", ")}` : "",
				t.contrasts.length > 0 ? `contrasts ${t.contrasts.join(", ")}` : "",
				t.excluded ? `left out: ${t.excluded}` : "",
				t.refs.length > 0 ? `refs ${t.refs.map((r) => `${r.source}${r.locator ? ` ${r.locator}` : ""}`).join("; ")}` : "",
			].filter(Boolean);
			lines.push(`- ${handle}: ${t.title ?? "(no title)"}${facts.length > 0 ? ` (${facts.join("; ")})` : ""}`);
		}
		if (view.order.length > 0) lines.push("", `Order: ${view.order.join(", ")}`);
	}
	return lines.join("\n");
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});

export type MapOutcome =
	| { status: "saved"; summary: string }
	| { status: "nothing" }
	| { status: "skipped"; reason: string }
	| { status: "failed"; reason: string }
	| { status: "busy" };

/** Where a course's map stands, for the New course dialog. */
export type CourseMapStatus =
	| { state: "building" }
	| { state: "built"; outcome: string; at: string }
	| { state: "failed"; reason: string; at: string }
	| { state: "none" };

export interface CourseMapBuilderDeps {
	courseRecords: CourseRecords;
	ledgers: CourseMapLedgers;
	/** Test seam: a scripted engine, checked first. */
	engine?: PiEngine;
	/** The app's default model, resolved fresh per build; undefined when no
	 *  model is set, and the build skips. */
	engineFor?: () => PiEngine | undefined;
	/** The subscription's background consent for the engine's provider. */
	backgroundAllowed?: (provider: string) => boolean;
	/** Test seam: how a linked website's page is read (the web tool's reader). */
	fetchPage?: (url: string) => Promise<string>;
	/** A build saved to a course record (Home and the course page refetch). */
	onSaved?: (workspace: string) => void;
	/** A build started or ended (the dialog refetches its status). */
	onStatus?: (workspace: string) => void;
}

export interface CourseMapBuilder {
	/** Build or extend the course's map from the material no build read
	 *  yet. Single-flight per course: a call during a build makes it run
	 *  once more when it ends, so material added meanwhile is read then. */
	buildMap(workspace: string): Promise<MapOutcome>;
	status(workspace: string): CourseMapStatus;
	/** At app start: run again every build a quit cut short. */
	resumeCut(): void;
	/** A course the builder meets for the first time when material is added
	 *  to it: its earlier material, all but `except` (handles or paths), is
	 *  marked as there before the builder, so only the new material is read.
	 *  Rebuilding a course's map from all its material is the learner's
	 *  call. No-op for a course with a ledger. */
	adopt(workspace: string, except: readonly string[]): Promise<void>;
}

/** The ledger line for new sources with nothing of their own to read: a
 *  linked folder, read through the files registered from it. */
export const NOTHING_TO_READ = "a linked folder; its files are read on their own";

/** Whether a registered source is a folder on disk (a linked folder). */
function isFolder(registered: string, directory: string): boolean {
	if (/^https?:\/\//i.test(registered)) return false;
	try {
		return fs.statSync(path.isAbsolute(registered) ? registered : path.join(directory, registered)).isDirectory();
	} catch {
		return false;
	}
}

/** The ledger line for material a course had before the map builder. */
export const ADOPTED = "material the course had before the map builder; not read";

interface LhCourseMapGlobal {
	__lhCourseMapRuns?: { inFlight: Set<string>; rerun: Set<string> };
}

function mapRuns(): NonNullable<LhCourseMapGlobal["__lhCourseMapRuns"]> {
	const g = globalThis as typeof globalThis & LhCourseMapGlobal;
	return (g.__lhCourseMapRuns ??= { inFlight: new Set(), rerun: new Set() });
}

const jobKeyOf = (workspace: string) => `${workspace}#course-map`;

/** Why a build stopped, in words the learner reads. */
export function failureWords(err: unknown, aborted: boolean): string {
	if (aborted) return "it was stopped before it finished";
	const message = err instanceof Error ? err.message : String(err);
	if (message.startsWith(CLAUDE_LIMIT_TEXT)) return "your Claude plan's usage limit was reached";
	if (message.startsWith("save refused")) return "the course record refused the map";
	if (message === "The map builder never submitted.") return "the model finished without proposing a map";
	if (message.startsWith("course record:")) return "the course record could not be read";
	return "the model stopped with an error";
}

export function createCourseMapBuilder(deps: CourseMapBuilderDeps): CourseMapBuilder {
	const { courseRecords, ledgers } = deps;
	const ledgerOf = (workspace: string): CourseMapLedger => ledgers.get(workspace) ?? { done: [] };
	const update = (workspace: string, next: (ledger: CourseMapLedger) => CourseMapLedger) => ledgers.save(workspace, next(ledgerOf(workspace)));

	async function readRecord(workspace: string): Promise<unknown> {
		const shown = await courseRecords.run(workspace, { verb: "show", handles: "all" });
		if (!shown.ok) throw new Error(`course record: ${shown.message}`);
		return shown.json;
	}

	async function build(workspace: string, start: (title: string) => AbortSignal): Promise<MapOutcome> {
		const record = await readRecord(workspace);
		const window = buildWindow(sourcesOf(record), ledgers.get(workspace));
		if (!window) {
			if (ledgers.get(workspace)?.pending) update(workspace, ({ pending: _pending, ...rest }) => rest);
			return { status: "nothing" };
		}
		const engine = deps.engine ?? deps.engineFor?.();
		if (!engine) return { status: "skipped", reason: "no model is set in Settings" };
		if (deps.backgroundAllowed && !deps.backgroundAllowed(engine.model.provider)) {
			return { status: "skipped", reason: `${engine.model.provider} does not allow background work` };
		}
		const scanned = await courseRecords.run(workspace, { verb: "sources", scan: true });
		if (!scanned.ok) throw new Error(`course record: ${scanned.message}`);
		const directory = String(obj(scanned.json).directory ?? workspace);
		const sources = ledgerSources(window.fresh);
		update(workspace, (ledger) => ({ ...ledger, pending: { fingerprint: window.fingerprint, sources } }));
		const title = typeof obj(record).title === "string" ? (obj(record).title as string) : workspace;
		const signal = start(title);
		const files = (await measureMaterial(directory, window.fresh, deps.fetchPage)).filter((f) => f.kind !== "folder");
		if (files.length === 0) {
			update(workspace, ({ done }) => ({ done: [...done, { sources, fingerprint: window.fingerprint, at: new Date().toISOString(), outcome: NOTHING_TO_READ }] }));
			return { status: "nothing" };
		}
		const folders = new Set(sourcesOf(record).filter((s) => isFolder(s.path, directory)).map((s) => s.handle));
		const view = courseView(record);
		const examDate = typeof obj(obj(record).exam).date === "string" ? (obj(obj(record).exam).date as string) : null;
		const submit = await withBgLlmSlot(signal, () =>
			runSubmitAgent<MapSubmit>({
				role: "teacher",
				toolName: SUBMIT_TOOL,
				toolDescription: "Submit the course's topic map.",
				parameters: mapSchema,
				fill: (input: Static<typeof mapSchema>) => ({ ...input, topics: input.topics ?? [], order: input.order ?? [] }),
				validate: (answer) => {
					const problems = answerProblems(answer, view);
					if (problems) console.info(`[course-map ${workspace}] answer refused: ${problems.replace(/\n/g, " | ")}`);
					return problems;
				},
				systemPrompt: COURSE_MAP_INSTRUCTIONS + courseMapDoctrine({ arcs: recordHasArcs(record) }),
				prompt: mapPrompt(title, view, files, examDate, record, folders),
				engine,
				signal,
				extraTools: createMaterialTools(files, engine.model),
				maxTurns: readingRounds(files) + SUBMIT_ROUNDS,
				onStep: (usage, model, step, finish, tools) =>
					console.info(`[course-map ${workspace}] step ${step} ${model}: ${usage.input} in, ${usage.output} out, ${finish}, ${tools}`),
				neverSubmitted: "The map builder never submitted.",
			}),
		);
		if (signal.aborted) throw Object.assign(new Error("course map aborted"), { name: "AbortError" });
		// A lesson may have saved while the agent read: merge into the record as it is now.
		const patch = mapChanges(submit, courseView(await readRecord(workspace)));
		if (signal.aborted) throw Object.assign(new Error("course map aborted"), { name: "AbortError" });
		if (patch) {
			const saved = await courseRecords.run(workspace, { verb: "save", changes: patch.changes });
			if (!saved.ok) throw new Error(`save refused (${saved.kind}): ${saved.message}`);
			deps.onSaved?.(workspace);
		}
		const unread = (submit.unread ?? []).map((u) => `${u.source} (${u.reason})`);
		const outcome = [patch?.summary ?? "nothing new to save", unread.length > 0 ? `could not read ${unread.join(", ")}` : ""].filter(Boolean).join("; ");
		update(workspace, ({ done }) => ({ done: [...done, { sources, fingerprint: window.fingerprint, at: new Date().toISOString(), outcome }] }));
		console.info(`[course-map ${workspace}] ${outcome}`);
		return patch ? { status: "saved", summary: outcome } : { status: "nothing" };
	}

	/** The sources a skipped build would have read, for its ledger line. */
	const window = (workspace: string): string[] => ledgers.get(workspace)?.pending?.sources ?? [];

	async function buildMap(workspace: string): Promise<MapOutcome> {
		const R = mapRuns();
		if (R.inFlight.has(workspace)) {
			R.rerun.add(workspace);
			return { status: "busy" };
		}
		R.inFlight.add(workspace);
		// Claimed before the first await: material added while this build
		// reads the record is then the course's own, never adopted as unread.
		if (!ledgers.get(workspace)) ledgers.save(workspace, { done: [] });
		deps.onStatus?.(workspace);
		const jobKey = jobKeyOf(workspace);
		let signal: AbortSignal | undefined;
		try {
			// The dock row shows a run's label: what it does and for which course.
			const outcome = await build(workspace, (title) => (signal = setRunPhase(jobKey, "mapping", "course-map", title).controller.signal));
			if (outcome.status === "skipped") {
				console.info(`[course-map ${workspace}] skipped: ${outcome.reason}`);
				const sources = window(workspace);
				update(workspace, ({ pending: _pending, ...rest }) => ({ ...rest, failed: { sources, at: new Date().toISOString(), reason: outcome.reason } }));
			}
			return outcome;
		} catch (err) {
			const aborted = signal?.aborted === true || (err instanceof Error && err.name === "AbortError");
			const reason = failureWords(err, aborted);
			const pending = ledgers.get(workspace)?.pending;
			update(workspace, ({ pending: _pending, ...rest }) => ({ ...rest, failed: { sources: pending?.sources ?? [], at: new Date().toISOString(), reason } }));
			console.error(`[course-map ${workspace}] failed (${reason}):`, err);
			return { status: "failed", reason };
		} finally {
			R.inFlight.delete(workspace);
			if (signal) finishRun(jobKey);
			const again = R.rerun.delete(workspace) && !signal?.aborted;
			deps.onStatus?.(workspace);
			if (again) void buildMap(workspace).catch(() => {});
		}
	}

	function status(workspace: string): CourseMapStatus {
		if (mapRuns().inFlight.has(workspace)) return { state: "building" };
		const ledger = ledgers.get(workspace);
		if (ledger?.failed) return { state: "failed", reason: ledger.failed.reason, at: ledger.failed.at };
		const last = ledger?.done.filter((d) => d.outcome !== ADOPTED && d.outcome !== NOTHING_TO_READ).at(-1);
		return last ? { state: "built", outcome: last.outcome, at: last.at } : { state: "none" };
	}

	function resumeCut(): void {
		for (const workspace of ledgers.workspaces()) if (ledgers.get(workspace)?.pending) void buildMap(workspace).catch(() => {});
	}

	async function adopt(workspace: string, except: readonly string[]): Promise<void> {
		if (ledgers.get(workspace)) return;
		const left = new Set(except);
		const before = sourcesOf(await readRecord(workspace)).filter((s) => !left.has(s.handle) && !left.has(s.path));
		if (ledgers.get(workspace)) return;
		ledgers.save(workspace, { done: before.length > 0 ? [{ sources: ledgerSources(before), fingerprint: "adopted", at: new Date().toISOString(), outcome: ADOPTED }] : [] });
	}

	return { buildMap, status, resumeCut, adopt };
}
