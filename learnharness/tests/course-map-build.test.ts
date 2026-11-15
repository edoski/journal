/**
 * The course map builder: its pure merge (what a build may change in a
 * course record), its duplicate check by meaning, and the runner on the
 * real engine with a scripted model: one save at the end, a rerun that
 * changes nothing, material added later read alone, a second add during a
 * build run once more, and a stopped build that leaves the course as it was.
 */

import { fakeEngine } from "./helpers/fake-sdk.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { LEARNING_ENGINE } from "../config.ts";
import { createCourseRecords } from "../src/store/course-records.ts";
import { createCourseMapBuilder } from "../src/agent/subagents/course-map-builder.ts";
import { abortRuns } from "../src/agent/subagents/background-runs.ts";
import type { SdkEngine } from "../src/agent/models.ts";
import type { CourseMapLedgers } from "../src/core/ports.ts";
import type { ChatSummary } from "../src/core/contracts/chat.ts";
import {
	answerProblems,
	arcStandingOf,
	buildWindow,
	courseView,
	dropRefusedEdge,
	duplicateOf,
	mapChanges,
	NO_STANDING,
	openLessonsOf,
	withoutArcs,
	sameName,
	type CourseMapLedger,
	type MapCourseView,
	type MapSubmit,
	type OpenLessons,
} from "../src/core/course-map-build.ts";

const view = (over: Partial<MapCourseView> = {}): MapCourseView => ({
	topics: {},
	order: [],
	basis: null,
	exam: {},
	sources: ["notes", "sheet"],
	taken: [],
	arcs: [],
	topicArc: {},
	examArcs: [],
	studied: [],
	held: [],
	currentArc: null,
	...over,
});
const topic = (title: string, over: Partial<MapCourseView["topics"][string]> = {}) => ({ title, needs: [], contrasts: [], refs: [], aliases: [], ...over });

describe("course map merge", () => {
	const answer: MapSubmit = {
		topics: [
			{ handle: "ols", title: "Least squares", refs: [{ source: "notes", locator: "§1" }] },
			{ handle: "ridge", title: "Ridge regression", needs: ["ols"], contrasts: ["lasso"], refs: [{ source: "notes", locator: "§2" }] },
			{ handle: "lasso", title: "Lasso", needs: ["ols"], refs: [{ source: "notes", locator: "§3" }] },
			{ handle: "trees", title: "Decision trees", excluded: "Chapter 8 is not examined", refs: [{ source: "notes", locator: "§8" }] },
		],
		order: ["ols", "ridge", "lasso", "trees"],
		basis: "Notes order",
	};

	it("builds a whole map in one patch: topics, prerequisites, contrasts, references, exclusions, order", () => {
		const merged = mapChanges(answer, view());
		assert.ok(merged);
		assert.deepEqual(merged.changes.topics, {
			ols: { title: "Least squares", refs: [{ source: "notes", locator: "§1" }] },
			ridge: { title: "Ridge regression", needs: ["ols"], contrasts: ["lasso"], refs: [{ source: "notes", locator: "§2" }] },
			lasso: { title: "Lasso", needs: ["ols"], refs: [{ source: "notes", locator: "§3" }] },
			trees: { title: "Decision trees", refs: [{ source: "notes", locator: "§8" }], excluded: "Chapter 8 is not examined" },
		});
		assert.deepEqual(merged.changes.path, { order: ["ols", "ridge", "lasso", "trees"], basis: "Notes order" });
		assert.equal(merged.summary, "4 new topics, 2 prerequisites, 1 pair of competing methods, 4 references, 1 topic left out of the exam");
	});

	it("changes nothing when the same answer meets the map it built", () => {
		const built = view({
			topics: {
				ols: topic("Least squares", { refs: [{ source: "notes", locator: "§1" }] }),
				ridge: topic("Ridge regression", { needs: ["ols"], contrasts: ["lasso"], refs: [{ source: "notes", locator: "§2" }] }),
				lasso: topic("Lasso", { needs: ["ols"], refs: [{ source: "notes", locator: "§3" }] }),
				trees: topic("Decision trees", { refs: [{ source: "notes", locator: "§8" }], excluded: "Chapter 8 is not examined" }),
			},
			order: ["ols", "ridge", "lasso", "trees"],
			basis: "Notes order",
		});
		assert.equal(mapChanges(answer, built), null);
	});

	it("extends in place: keeps handles, titles and the order; lists grow whole; a studied topic the material drops is excluded, its answers kept", () => {
		const before = view({
			topics: {
				ols: topic("OLS, as you named it", { refs: [{ source: "notes", locator: "§1" }] }),
				ridge: topic("Ridge", { needs: ["ols"] }),
			},
			order: ["ols", "ridge"],
			basis: "Your order",
		});
		const merged = mapChanges(
			{
				topics: [
					{ handle: "ridge", title: "Ridge regression", needs: ["ols", "cv"], refs: [{ source: "sheet", locator: "Ex. 2" }], excluded: "not examined" },
					{ handle: "cv", title: "Cross-validation", refs: [{ source: "sheet", locator: "Ex. 1" }] },
				],
				order: ["cv", "ridge"],
				basis: "Sheet order",
			},
			before,
		);
		assert.ok(merged);
		assert.deepEqual(merged.changes.topics, {
			ridge: { needs: ["ols", "cv"], refs: [{ source: "sheet", locator: "Ex. 2" }], excluded: "not examined" },
			cv: { title: "Cross-validation", refs: [{ source: "sheet", locator: "Ex. 1" }] },
		});
		assert.deepEqual(merged.changes.path, { order: ["cv", "ols", "ridge"] }, "a new topic with nothing placed before it goes first; the basis stays");
	});

	it("leaves out a prerequisite that would close a loop, and references to unregistered sources", () => {
		const merged = mapChanges(
			{ topics: [{ handle: "a", title: "A", needs: ["b"], refs: [{ source: "web" }] }, { handle: "b", title: "B", needs: ["a"] }], order: ["a", "b"] },
			view(),
		);
		assert.deepEqual(merged?.changes.topics, { a: { title: "A", needs: ["b"] }, b: { title: "B" } });
	});

	it("never takes a handle a knowledge entry or task holds", () => {
		const merged = mapChanges({ topics: [{ handle: "notation", title: "Notation" }], order: ["notation"] }, view({ taken: ["notation"] }));
		assert.deepEqual(Object.keys(merged?.changes.topics as object), ["notation-2"]);
	});
});

describe("duplicates by meaning", () => {
	it("names the same topic across wording, inflection, order, accents and a typo", () => {
		assert.ok(sameName("Eigenvalues", "eigenvalue"));
		assert.ok(sameName("Principal component analysis", "Principal components analysis"));
		assert.ok(sameName("Autovalori e autovettori", "autovettori e autovalori"));
		assert.ok(sameName("The bias–variance trade-off", "Bias variance tradeoff") === false, "a joined word is another word");
		assert.ok(sameName("Bias-variance trade-off", "bias variance trade off"));
		assert.ok(sameName("Regressione lineare", "Regresione lineare"));
		assert.ok(sameName("Rank of $A$", "rank of A"));
	});

	it("keeps different topics apart", () => {
		assert.ok(!sameName("Type I error", "Type II error"));
		assert.ok(!sameName("Ridge regression", "Lasso regression"));
		assert.ok(!sameName("LU", "QR"));
		assert.ok(!sameName("Linear regression", "Logistic regression"));
		assert.ok(!sameName("Markov chains", "Hidden Markov chains"));
	});

	it("matches a new topic against titles, aliases and handles, and the check refuses it", () => {
		const existing = { eigen: topic("Eigenvalues and eigenvectors"), pca: topic("PCA", { aliases: ["Principal component analysis"] }) };
		assert.equal(duplicateOf({ handle: "eigenvalues", title: "Eigenvectors and eigenvalues" }, existing), "eigen");
		assert.equal(duplicateOf({ handle: "principal-components", title: "Principal components analysis" }, existing), "pca");
		assert.equal(duplicateOf({ handle: "svd", title: "Singular value decomposition" }, existing), null);
		const problems = answerProblems({ topics: [{ handle: "eigenvalues", title: "Eigenvectors and eigenvalues" }], order: [] }, view({ topics: existing }));
		assert.match(problems ?? "", /is the course's existing topic eigen .*use the handle eigen/);
	});

	it("folds a duplicate that slips through into the existing topic, with its references and links", () => {
		const merged = mapChanges(
			{ topics: [{ handle: "eigenvalues", title: "Eigenvalue", refs: [{ source: "sheet", locator: "Ex. 4" }] }, { handle: "power", title: "Power iteration", needs: ["eigenvalues"] }], order: ["eigenvalues", "power"] },
			view({ topics: { eigen: topic("Eigenvalues") }, order: ["eigen"] }),
		);
		assert.deepEqual(merged?.changes.topics, { eigen: { refs: [{ source: "sheet", locator: "Ex. 4" }] }, power: { title: "Power iteration", needs: ["eigen"] } });
		assert.deepEqual(merged?.changes.path, { order: ["eigen", "power"] });
	});

	it("refuses two new topics that name the same idea", () => {
		assert.match(answerProblems({ topics: [{ handle: "cv", title: "Cross-validation" }, { handle: "crossval", title: "Cross validation" }], order: [] }, view()) ?? "", /crossval and cv name the same topic/);
	});
});

describe("the material a build reads", () => {
	it("reads only sources no finished build read", () => {
		const sources = [{ handle: "notes", path: "material/notes.md" }, { handle: "sheet", path: "material/sheet.pdf" }];
		const first = buildWindow(sources, undefined)!;
		assert.deepEqual(first.fresh.map((s) => s.handle), ["notes", "sheet"]);
		const ledger: CourseMapLedger = { done: [{ sources: ["notes\u0000material/notes.md"], fingerprint: "x", at: "", outcome: "" }] };
		assert.deepEqual(buildWindow(sources, ledger)!.fresh.map((s) => s.handle), ["sheet"]);
		assert.equal(buildWindow(sources.slice(0, 1), ledger), null);
	});
});

describe("a course with arcs", () => {
	const ARCS: MapCourseView["arcs"] = [
		{ handle: "spaces", title: "Vector spaces", question: "What can vectors build?", purpose: "Span and bases.", refs: [] },
		{ handle: "systems", title: "Linear systems", question: "When does a system have a solution?", purpose: "Solve systems.", refs: [] },
		{ handle: "spectra", title: "Eigenvalues", question: "Which directions does a map keep?", purpose: "Find eigenvectors.", refs: [] },
	];
	const withArcs = view({
		topics: { vectors: topic("Vectors"), span: topic("Span", { needs: ["vectors"] }), elimination: topic("Gaussian elimination"), rank: topic("Rank", { needs: ["elimination"] }), eigen: topic("Eigenvalues", { needs: ["rank"] }), trace: topic("Trace") },
		order: ["vectors", "span", "elimination", "rank", "eigen", "trace"],
		arcs: ARCS,
		topicArc: { vectors: "spaces", span: "spaces", elimination: "systems", rank: "systems", eigen: "spectra", trace: "spectra" },
		studied: ["vectors", "span"],
		held: ["spaces"],
		currentArc: "spaces",
	});
	const ORTHO = { handle: "orthogonality", title: "Orthogonality", question: "When are vectors perpendicular?", purpose: "Project onto subspaces.", after: "systems", unit: "Chapter 7 Orthogonality" };
	const answer = (over: Partial<MapSubmit> = {}): MapSubmit => ({
		topics: [
			{ handle: "inner", title: "Inner products", needs: ["vectors"], arc: "orthogonality" },
			{ handle: "projection", title: "Orthogonal projection", needs: ["inner", "span"], arc: "orthogonality" },
		],
		order: ["inner", "projection"],
		newArcs: [ORTHO],
		...over,
	});

	it("the soft check: a new arc names its unit and holds two new topics, and an arc named must exist", () => {
		assert.equal(answerProblems(answer(), withArcs), null);
		const problems = (over: Partial<MapSubmit>) => answerProblems(answer(over), withArcs) ?? "";
		assert.match(problems({ newArcs: [{ ...ORTHO, unit: "" }] }), /new arc "orthogonality" has no unit/);
		assert.match(problems({ topics: [{ handle: "inner", title: "Inner products", arc: "orthogonality" }, { handle: "projection", title: "Orthogonal projection", needs: ["inner"] }] }), /holds one of this answer's new topics/);
		assert.match(problems({ newArcs: [{ ...ORTHO, handle: "systems" }] }), /never send an arc it has/);
		assert.match(problems({ newArcs: [{ ...ORTHO, after: "nowhere" }] }), /follows "nowhere", which is no arc listed before it/);
		assert.match(problems({ topics: [{ handle: "inner", title: "Inner products", arc: "geometry" }] , newArcs: [] }), /names arc "geometry", which is neither an arc of the course nor in newArcs/);
		assert.match(problems({ moves: [{ topic: "ghost", arc: "systems", reason: "Chapter 4" }] }), /moves names "ghost", which is no topic of the course/);
		assert.equal(answerProblems(answer({ moves: [{ topic: "span", arc: "systems", reason: "Chapter 4 uses it" }] }), withArcs), null, "a move he must ask for is no problem: the merge keeps it as a note");
	});

	it("a twin by name folds only into an arc the new topic could join; elsewhere the agent tells them apart", () => {
		const near = answerProblems({ topics: [{ handle: "eigenvalues", title: "Eigenvalue", needs: ["rank"] }], order: [] }, withArcs);
		assert.match(near ?? "", /is the course's existing topic eigen/);
		const far = { ...withArcs, topics: { ...withArcs.topics, gauss: topic("Gaussian elimination") }, topicArc: { ...withArcs.topicArc, gauss: "systems" } };
		const problems = answerProblems({ topics: [{ handle: "elim-spectral", title: "Gaussian elimination", needs: ["eigen"] }], order: [] }, far);
		assert.match(problems ?? "", /has the name of the course's topic (elimination|gauss) \("Gaussian elimination"\) in "Linear systems", an arc its prerequisites do not put it in/);
		const merged = mapChanges({ topics: [{ handle: "elim-spectral", title: "Gaussian elimination", needs: ["eigen"] }], order: [] }, withArcs);
		assert.deepEqual(Object.keys(merged?.changes.topics as object), ["elim-spectral"], "never folded into a topic of an earlier arc");
	});

	it("the merge splices new arcs after the arc each follows and never sends an existing arc's title, question or purpose", () => {
		const merged = mapChanges(
			answer({
				topics: [...answer().topics, { handle: "gram", title: "Gram–Schmidt", needs: ["projection"], arc: "least-squares" }, { handle: "lsq", title: "Least squares", needs: ["projection"], arc: "least-squares" }, { handle: "pivots", title: "Pivots", needs: ["elimination"], arc: "systems" }],
				newArcs: [ORTHO, { ...ORTHO, handle: "least-squares", title: "Least squares fitting", after: "orthogonality", unit: "Chapter 8" }, { ...ORTHO, handle: "systems", title: "Systems, renamed" }],
			}),
			withArcs,
		);
		assert.ok(merged);
		assert.deepEqual(Object.keys(merged.changes.arcs as object), ["orthogonality", "least-squares"]);
		assert.deepEqual((merged.changes.arcs as Record<string, unknown>).orthogonality, { title: "Orthogonality", question: "When are vectors perpendicular?", purpose: "Project onto subspaces." });
		assert.deepEqual((merged.changes.path as { arcs: string[] }).arcs, ["spaces", "systems", "orthogonality", "least-squares", "spectra"]);
		const topics = merged.changes.topics as Record<string, { arc?: string }>;
		assert.equal(topics.inner?.arc, "orthogonality");
		assert.equal(topics.pivots?.arc, "systems", "a new topic joins an existing arc");
		assert.match(String((merged.changes.arc_change as { reason: string }).reason), /new arc "Orthogonality" for the material's unit "Chapter 7 Orthogonality"/);
		assert.equal(merged.summary, "5 new topics, 6 prerequisites, new arcs");
	});

	it("a new topic with no arc carries none, and the engine places it", () => {
		const merged = mapChanges({ topics: [{ handle: "pivots", title: "Pivots", needs: ["elimination"] }], order: ["pivots"] }, withArcs);
		assert.deepEqual(merged?.changes.topics, { pivots: { title: "Pivots", needs: ["elimination"] } });
		assert.equal("arc_change" in (merged?.changes ?? {}), false);
	});

	it("moves go ahead only between arcs he is not in; a held or studied move is dropped and kept as a note", () => {
		const merged = mapChanges(
			{
				topics: [],
				order: [],
				moves: [
					{ topic: "trace", arc: "systems", reason: "Sheet 4 treats the trace" },
					{ topic: "span", arc: "systems", reason: "Chapter 4 opens with span" },
					{ topic: "elimination", arc: "spaces", reason: "Chapter 1 shows elimination" },
				],
			},
			withArcs,
		);
		assert.ok(merged);
		assert.deepEqual(merged.changes.topics, { trace: { arc: "systems" } });
		const reason = (merged.changes.arc_change as { reason: string }).reason;
		assert.match(reason, /moved "trace" to "Linear systems": Sheet 4 treats the trace/);
		assert.match(reason, /kept "span" in "Vector spaces", since "span" has evidence/);
		assert.match(reason, /kept "elimination" in "Linear systems", since "Vector spaces" is an arc he is in or has studied/);
		assert.equal(merged.summary, "a topic moved to another arc");
		const onlyHeld = mapChanges({ topics: [], order: [], moves: [{ topic: "span", arc: "systems", reason: "Chapter 4" }] }, withArcs);
		assert.deepEqual(Object.keys(onlyHeld?.changes ?? {}), ["arc_change"], "a held move alone saves only its note");
	});

	it("a course without arcs merges exactly as before: every arc field of the answer is ignored", () => {
		const plain = view({ topics: { vectors: topic("Vectors"), span: topic("Span", { needs: ["vectors"] }) }, order: ["vectors", "span"] });
		const full = answer({ moves: [{ topic: "span", arc: "orthogonality", reason: "x" }], arcNote: "a note" });
		assert.deepEqual(mapChanges(full, plain), mapChanges(withoutArcs({ ...full, arcNote: undefined }), plain));
		assert.equal(JSON.stringify(mapChanges(full, plain)?.changes).match(/"arc/g), null);
		assert.equal(answerProblems(full, plain), null);
	});

	it("the salvage ladder drops only a new edge the refusal names, and keeps it in a note", () => {
		const changes = { topics: { pivots: { title: "Pivots", needs: ["elimination", "eigen"] }, span: { needs: ["vectors", "pivots"] } }, arc_change: { reason: "new arc" } };
		const backward = 'topics.span.needs: "span" (in "Vector spaces") needs "pivots", which sits in the later arc "Linear systems"; no topic may need a later arc.';
		const one = dropRefusedEdge(changes, backward, withArcs);
		assert.deepEqual(one?.changes.topics, { pivots: { title: "Pivots", needs: ["elimination", "eigen"] } }, "span keeps only what it had, so its patch goes");
		assert.equal((one?.changes.arc_change as { reason: string }).reason, `new arc; proposed need: "span" needs "pivots"; refused: ${backward}`);
		const range = 'topics.pivots: its prerequisite "eigen" sits in "Eigenvalues" and "span" in the earlier "Vector spaces" needs it; drop the need that fails the prerequisite test, or place it with "arc"';
		assert.deepEqual((dropRefusedEdge(changes, range, withArcs)?.changes.topics as Record<string, unknown>).pivots, { title: "Pivots", needs: ["elimination"] });
		assert.equal(dropRefusedEdge(changes, 'topics.span.needs: "span" (in "Vector spaces") needs "vectors", which sits in the later arc "X"', withArcs), null, "an edge the course already had is never dropped");
		assert.equal(dropRefusedEdge(changes, "arcs.x.title: required", withArcs), null);
	});
});

describe("where he stands in the arcs", () => {
	const record = (over: Record<string, unknown> = {}) => ({
		arcs: { spaces: { title: "Vector spaces", question: "Q1", purpose: "P1" }, systems: { title: "Linear systems", question: "Q2", purpose: "P2" }, spectra: { title: "Eigenvalues", question: "Q3", purpose: "P3" } },
		path: { arcs: ["spaces", "systems", "spectra"], current: "span" },
		topics: { vectors: { title: "Vectors", arc: "spaces" }, span: { title: "Span", arc: "spaces" }, rank: { title: "Rank", arc: "systems" }, eigen: { title: "Eigen", arc: "spectra" }, trace: { title: "Trace", arc: "spectra", excluded: "not examined" } },
		standings: { vectors: { level: "retained" }, span: { level: "new" }, rank: { level: "new" }, eigen: { level: "new" }, trace: { level: "new" } },
		observations: {},
		...over,
	});

	it("the view carries where the engine says he stands, in a course with arcs only", () => {
		const said = arcStandingOf({ current_arc: "spectra", studied: ["vectors", "eigen"], held: ["spaces", "spectra"], arcs: [] });
		assert.deepEqual(said, { studied: ["vectors", "eigen"], held: ["spaces", "spectra"], currentArc: "spectra" });
		assert.deepEqual(arcStandingOf({ studied: [], held: [], arcs: [] }), { studied: [], held: [], currentArc: null }, "no current_arc in a course without arcs");
		assert.deepEqual([courseView(record(), said).currentArc, courseView(record(), said).held], ["spectra", ["spaces", "spectra"]]);
		assert.deepEqual(courseView(record(), NO_STANDING).held, [], "told nothing, it holds nothing");
	});

	it("a record with a broken arc entry reads as a course without arcs", () => {
		const broken = courseView(record({ arcs: { spaces: { title: "Vector spaces" } }, path: { arcs: ["spaces"] } }), { studied: ["span"], held: ["spaces"], currentArc: "spaces" });
		assert.deepEqual([broken.arcs, broken.held, broken.currentArc, broken.topicArc], [[], [], null, {}]);
	});

	it("open lessons: every session he picks up counts; the newest lesson in progress says where he is", () => {
		const chat = (id: string, over: Partial<ChatSummary>): ChatSummary => ({ id, title: id, createdAt: "2026-11-01", updatedAt: "2026-11-01", kind: "teach", messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, course: { workspace: "/c" }, ...over }) as ChatSummary;
		const chats = [
			chat("done", { ownTopics: ["vectors"], ended: "closed", updatedAt: "2026-11-01" }),
			chat("left", { ownTopics: ["rank"], ended: "left", updatedAt: "2026-11-02" }),
			chat("now", { ownTopics: ["ghost", "eigen"], ended: "mid-lesson", updatedAt: "2026-11-03" }),
			chat("other", { ownTopics: ["span"], ended: "mid-lesson", course: { workspace: "/d" } as ChatSummary["course"], updatedAt: "2026-11-04" }),
		];
		assert.deepEqual(openLessonsOf(chats, "/c", record()), { topics: ["rank", "eigen"], here: "eigen" });
		assert.equal(openLessonsOf(chats.slice(0, 2), "/c", record()).here, null, "a lesson left for next time is not where he is now");
	});
});

// ─── the runner, on the real engine ─────────────────────────────────────────

const realEngine = fs.existsSync(LEARNING_ENGINE.python);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-map-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function memoryLedgers(): CourseMapLedgers & { all: Map<string, CourseMapLedger> } {
	const all = new Map<string, CourseMapLedger>();
	return { all, get: (w) => all.get(w), save: (w, l) => void all.set(w, structuredClone(l)), workspaces: () => [...all.keys()], forget: (w) => void all.delete(w) };
}

/** Resolves once `done` holds after a build ends: the builder's own signal, not a clock. */
function settled(ledgers: ReturnType<typeof memoryLedgers>, dir: string, builds: number) {
	let resolve!: () => void;
	const ended = new Promise<void>((r) => (resolve = r));
	return { onStatus: () => (ledgers.all.get(dir)?.done.length ?? 0) >= builds && resolve(), ended };
}

/** A model that reads every source it is told to read now, then submits
 *  `answers` in turn (the next one after a refusal). */
function scriptedModel(answers: MapSubmit[], gate?: Promise<void>): SdkEngine & { reads: string[]; refusals: string[] } {
	const reads: string[] = [];
	const refusals: string[] = [];
	const faux = createFauxCore({});
	let submitted = 0;
	const step: FauxResponseStep = async (context) => {
		const last = context.messages.at(-1) as { role: string; toolName?: string };
		if (last.role === "user") {
			const prompt = JSON.stringify(context.messages.find((m) => m.role === "user"));
			const fresh = [...prompt.matchAll(/- ([a-z0-9_-]+): [^\n]*?\(to read now\)/g)].map((m) => m[1]!);
			reads.push(...fresh);
			return fauxAssistantMessage(fresh.map((source, i) => fauxToolCall("read_material", { source }, { id: `read-${i}` })), { stopReason: "toolUse" });
		}
		await gate;
		const refused = last as { role: string; toolName?: string; isError?: boolean; content?: Array<{ text?: string }> };
		if (refused.role === "toolResult" && refused.toolName === "submit_map" && refused.isError) refusals.push(refused.content?.map((c) => c.text ?? "").join("") ?? "");
		const answer = answers[Math.min(submitted++, answers.length - 1)]!;
		return fauxAssistantMessage([fauxToolCall("submit_map", answer as unknown as ToolCall["arguments"], { id: `submit-${submitted}` })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 20 }, () => step));
	return Object.assign(fakeEngine({ model: faux.getModel(), streamFn: faux.streamSimple }), { reads, refusals });
}

describe("course map builder (real engine, scripted model)", { skip: !realEngine && "learning engine not installed" }, () => {
	const home = path.join(TMP, "home");
	fs.mkdirSync(home, { recursive: true });
	const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
	const records = createCourseRecords({ ...LEARNING_ENGINE, env });
	const engine = (args: string[], input?: unknown) =>
		JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], { cwd: LEARNING_ENGINE.root, env: { ...env, PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());

	function course(name: string): string {
		const dir = path.join(TMP, name);
		fs.mkdirSync(path.join(dir, "material"), { recursive: true });
		fs.writeFileSync(path.join(dir, "material", "notes.md"), "# Least squares\n\n# Ridge\nRidge adds a penalty to least squares.\n");
		engine(["--workspace", dir, "init"]);
		engine(["--workspace", dir, "sources", "--add", "material/notes.md"]);
		return dir;
	}
	const record = (dir: string) => engine(["--workspace", dir, "show", "--all"]);
	const FIRST: MapSubmit = {
		topics: [
			{ handle: "ols", title: "Least squares", refs: [{ source: "notes", locator: "§1" }] },
			{ handle: "ridge", title: "Ridge regression", needs: ["ols"], refs: [{ source: "notes", locator: "§2" }] },
		],
		order: ["ols", "ridge"],
		basis: "Notes order",
	};

	it("builds the map in one save, and a rerun on the same material changes nothing", async () => {
		const dir = course("first");
		const ledgers = memoryLedgers();
		const model = scriptedModel([FIRST]);
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model });
		const outcome = await builder.buildMap(dir);
		assert.deepEqual(outcome, { status: "saved", summary: "2 new topics, 1 prerequisite, 2 references" });
		assert.deepEqual(model.reads, ["notes"]);
		const built = record(dir);
		assert.deepEqual(Object.keys(built.topics), ["ols", "ridge"]);
		assert.deepEqual(built.path, { order: ["ols", "ridge"], basis: "Notes order" });
		assert.deepEqual(engine(["--workspace", dir, "arcs"]).studied, [], "the build marks no topic where he is, so the engine counts nothing studied and the grouping pass may run");
		assert.deepEqual(builder.status(dir), { state: "built", outcome: "2 new topics, 1 prerequisite, 2 references", at: ledgers.all.get(dir)!.done[0]!.at });
		const revision = built.revision;
		assert.deepEqual(await builder.buildMap(dir), { status: "nothing" });
		assert.equal(record(dir).revision, revision, "no second save");
	});

	it("material added later is read alone, merges by handle, and keeps answers, levels, reviews and tasks", async () => {
		const dir = course("later");
		const ledgers = memoryLedgers();
		await createCourseMapBuilder({ courseRecords: records, ledgers, engine: scriptedModel([FIRST]) }).buildMap(dir);
		engine(["--workspace", dir, "save"], {
			topics: { ridge: { introduced: true, gap: "Forgets to standardise first" } },
			observations: [{ topics: ["ridge"], text: "Derived the ridge estimator", help: "none", result: "correct" }],
			tasks: { ex1: { title: "Exercise 1", topics: ["ridge"], step: "Choose lambda" } },
			knowledge: { notation: { text: "Lambda is the penalty" } },
		});
		const before = record(dir);
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1 cross-validation for lambda\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		const model = scriptedModel([
			{
				topics: [
					{ handle: "ridge-penalty", title: "Ridge regressions", refs: [{ source: "sheet", locator: "Ex. 1" }] },
					{ handle: "cv", title: "Cross-validation", needs: ["ols"], refs: [{ source: "sheet", locator: "Ex. 1" }] },
				],
				order: ["cv", "ridge-penalty"],
			},
			{
				topics: [
					{ handle: "ridge", title: "Ridge regression", needs: ["cv"], refs: [{ source: "sheet", locator: "Ex. 1" }] },
					{ handle: "cv", title: "Cross-validation", needs: ["ols"], refs: [{ source: "sheet", locator: "Ex. 1" }] },
				],
				order: ["ols", "cv", "ridge"],
			},
		]);
		const outcome = await createCourseMapBuilder({ courseRecords: records, ledgers, engine: model }).buildMap(dir);
		assert.equal(outcome.status, "saved");
		assert.deepEqual(model.reads, ["sheet"], "only the new material is read");
		const after_ = record(dir);
		assert.deepEqual(after_.observations, before.observations);
		assert.deepEqual(after_.tasks, before.tasks);
		assert.deepEqual(after_.knowledge, before.knowledge);
		assert.deepEqual(Object.keys(after_.topics).sort(), ["cv", "ols", "ridge"], "the reworded ridge was refused, then merged by handle: no duplicate");
		const { refs, needs, ...ridgeRest } = after_.topics.ridge;
		const { refs: oldRefs, needs: oldNeeds, ...ridgeBefore } = before.topics.ridge;
		assert.deepEqual(ridgeRest, ridgeBefore, "title, introduced, gap and review untouched");
		assert.deepEqual(refs, [...oldRefs, { source: "sheet", locator: "Ex. 1" }]);
		assert.deepEqual(needs, [...oldNeeds, "cv"]);
		assert.deepEqual(after_.path.order, ["ols", "cv", "ridge"]);
		assert.equal(after_.path.current, before.path.current);
	});

	it("a second add during a build runs once more when it ends, reading only what it added", async () => {
		const dir = course("concurrent");
		const ledgers = memoryLedgers();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const model = scriptedModel([FIRST, { topics: [{ handle: "cv", title: "Cross-validation", needs: ["ols"], refs: [{ source: "sheet" }] }], order: ["ols", "cv"] }], gate);
		const done = settled(ledgers, dir, 2);
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model, onStatus: done.onStatus });
		const first = builder.buildMap(dir);
		while (model.reads.length === 0) await new Promise((r) => setTimeout(r, 10));
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		assert.deepEqual(await builder.buildMap(dir), { status: "busy" });
		assert.deepEqual(await builder.buildMap(dir), { status: "busy" }, "a third request folds into the same rerun");
		release();
		await first;
		await done.ended;
		assert.equal(ledgers.all.get(dir)!.done.length, 2, "exactly one more build");
		assert.deepEqual(model.reads, ["notes", "sheet"], "each build read only its own material");
		assert.deepEqual(Object.keys(record(dir).topics).sort(), ["cv", "ols", "ridge"]);
	});

	it("a build stopped part-way leaves the course exactly as it was, and says so", async () => {
		const dir = course("stopped");
		const before = fs.readFileSync(path.join(dir, ".study", "course.json"), "utf-8");
		const ledgers = memoryLedgers();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: scriptedModel([FIRST], gate) });
		const run = builder.buildMap(dir);
		while (!abortRuns(dir)) await new Promise((r) => setTimeout(r, 10));
		release();
		const outcome = await run;
		assert.deepEqual(outcome, { status: "failed", reason: "it was stopped before it finished" });
		assert.equal(fs.readFileSync(path.join(dir, ".study", "course.json"), "utf-8"), before, "the record is byte for byte as it was");
		assert.equal(builder.status(dir).state, "failed");
		assert.equal(ledgers.all.get(dir)!.pending, undefined);
	});

	it("material added right after a course is created is read with the rest, never adopted as unread", async () => {
		const dir = course("fresh-add");
		const ledgers = memoryLedgers();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const model = scriptedModel([FIRST, { topics: [{ handle: "cv", title: "Cross-validation", refs: [{ source: "sheet" }] }], order: ["cv"] }], gate);
		const done = settled(ledgers, dir, 2);
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model, onStatus: done.onStatus });
		const first = builder.buildMap(dir);
		await builder.adopt(dir, ["material/sheet.md"]);
		while (model.reads.length === 0) await new Promise((r) => setTimeout(r, 10));
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		void builder.buildMap(dir);
		release();
		await first;
		await done.ended;
		assert.deepEqual(ledgers.all.get(dir)!.done.map((d) => d.outcome.startsWith("material the course had") ? "adopted" : "built"), ["built", "built"]);
		assert.deepEqual(model.reads, ["notes", "sheet"]);
	});

	/** A course grouped into three arcs, he studied least squares and stands on it. */
	function arcCourse(name: string): string {
		const dir = course(name);
		engine(["--workspace", dir, "save"], {
			arcs: {
				fit: { title: "Least squares", question: "How do we fit a line?", purpose: "Fit linear models." },
				shrink: { title: "Regularisation", question: "How do we tame a large model?", purpose: "Penalise coefficients." },
				choose: { title: "Model selection", question: "Which model do we keep?", purpose: "Compare models fairly." },
			},
			topics: {
				ols: { title: "Ordinary least squares", arc: "fit", refs: [{ source: "notes", locator: "§1" }] },
				gls: { title: "Generalised least squares", needs: ["ols"], arc: "fit" },
				ridge: { title: "Ridge regression", needs: ["ols"], arc: "shrink" },
				lasso: { title: "Lasso", needs: ["ols"], arc: "shrink" },
				cv: { title: "Cross-validation", needs: ["ols"], arc: "choose" },
				aic: { title: "Information criteria", needs: ["cv"], arc: "choose" },
			},
			path: { arcs: ["fit", "shrink", "choose"], order: ["ols", "gls", "ridge", "lasso", "cv", "aic"] },
			arc_change: { reason: "The notes' three chapters" },
		});
		engine(["--workspace", dir, "save"], { topics: { ols: { introduced: true } }, path: { current: "ols" } });
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Sheet 2: elastic net\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		return dir;
	}
	const adoptNotes = (ledgers: ReturnType<typeof memoryLedgers>, dir: string) =>
		ledgers.save(dir, { done: [{ sources: ["notes\u0000material/notes.md"], fingerprint: "x", at: "", outcome: "built" }] });

	it("with arcs: the merged answer is checked by the engine first, a refusal goes back to the agent, and only the final save writes", async () => {
		const dir = arcCourse("arcs-check");
		const ledgers = memoryLedgers();
		adoptNotes(ledgers, dir);
		const before = record(dir);
		const model = scriptedModel([
			{ topics: [{ handle: "elastic", title: "Elastic net", needs: ["ridge", "lasso"], arc: "fit", refs: [{ source: "sheet" }] }], order: ["elastic"] },
			{
				topics: [{ handle: "elastic", title: "Elastic net", needs: ["ridge", "lasso"], arc: "shrink", refs: [{ source: "sheet" }] }],
				order: ["ridge", "lasso", "elastic"],
				moves: [{ topic: "gls", arc: "choose", reason: "Sheet 2 compares GLS fits" }],
			},
		]);
		const outcome = await createCourseMapBuilder({ courseRecords: records, ledgers, engine: model }).buildMap(dir);
		assert.deepEqual(outcome, { status: "saved", summary: "1 new topic, 2 prerequisites, 1 reference" });
		assert.equal(model.refusals.length, 1);
		assert.match(model.refusals[0]!, /The engine refused the merged save: topics\.elastic\.needs: .*no topic may need a later arc/);
		const after_ = record(dir);
		assert.equal(after_.revision, before.revision + 1, "the check wrote nothing; one save did");
		assert.equal(after_.topics.elastic.arc, "shrink");
		assert.equal(after_.topics.gls.arc, "fit", "a move out of the arc he is in waits for his words");
		assert.match(after_.arc_log.at(-1).reason, /kept "gls" in "Least squares", since "Least squares" is an arc he is in or has studied/);
		assert.equal(after_.arc_log.at(-1).kind, "note");
	});

	it("with arcs: a save the engine keeps refusing is salvaged: arcs set aside, then each refused new edge dropped and noted, never a topic", async () => {
		const dir = arcCourse("arcs-salvage");
		const ledgers = memoryLedgers();
		adoptNotes(ledgers, dir);
		const model = scriptedModel([
			{
				topics: [
					{ handle: "elastic", title: "Elastic net", needs: ["aic"], arc: "shrink", refs: [{ source: "sheet" }] },
					{ handle: "lasso", title: "Lasso", needs: ["elastic"] },
				],
				order: ["elastic", "lasso"],
			},
		]);
		const outcome = await createCourseMapBuilder({ courseRecords: records, ledgers, engine: model }).buildMap(dir);
		assert.equal(outcome.status, "saved");
		assert.ok(model.refusals.length >= 1, "every check went back to the agent until its turns ran out");
		const after_ = record(dir);
		assert.deepEqual(Object.keys(after_.topics).sort(), ["aic", "cv", "elastic", "gls", "lasso", "ols", "ridge"], "every topic is mapped");
		assert.equal(after_.topics.elastic.needs, undefined, "the refused edge is gone");
		assert.deepEqual(after_.topics.lasso.needs, ["ols", "elastic"], "the edges that passed are kept");
		assert.equal(after_.topics.elastic.arc, "fit", "the engine placed it nearest where he is");
		const note = after_.arc_log.at(-1);
		assert.equal(note.kind, "note");
		assert.match(note.reason, /the proposed arc changes were set aside; refused: .*; proposed need: "elastic" needs "aic"; refused: topics\.elastic: its prerequisite "aic"/);
		const salvaged = ledgers.all.get(dir)!.done.at(-1)!.salvaged ?? [];
		assert.equal(salvaged.length, 2);
	});

	describe("where he stands in the arcs, as the engine says it", () => {
		const arc = (title: string) => ({ title, question: `Why ${title}?`, purpose: `Do ${title}.` });
		function standingCourse(name: string, extra: Record<string, unknown> = {}): string {
			const dir = course(name);
			engine(["--workspace", dir, "save"], {
				arcs: { spaces: arc("Vector spaces"), systems: arc("Linear systems"), spectra: arc("Eigenvalues") },
				topics: { vectors: { title: "Vectors", arc: "spaces", introduced: true }, span: { title: "Span", arc: "spaces" }, rank: { title: "Rank", arc: "systems" }, eigen: { title: "Eigen", arc: "spectra" }, trace: { title: "Trace", arc: "spectra", excluded: "not examined" } },
				path: { arcs: ["spaces", "systems", "spectra"], current: "span" },
				arc_change: { reason: "Chapters 1 to 3" },
				...extra,
			});
			return dir;
		}
		const standing = async (dir: string, lessons: OpenLessons = { topics: [], here: null }) => {
			const said = await records.run(dir, { verb: "arcs", here: lessons.here, open: lessons.topics });
			assert.ok(said.ok);
			return arcStandingOf(said.json);
		};

		it("the current arc is the arc of You are here: the lesson in progress, else path.current", async () => {
			const dir = standingCourse("stand-here");
			assert.equal((await standing(dir)).currentArc, "spaces");
			assert.equal((await standing(dir, { topics: ["eigen"], here: "eigen" })).currentArc, "spectra");
			assert.equal((await standing(dir, { topics: [], here: "trace" })).currentArc, "spaces", "an excluded topic is no place to stand");
		});

		it("with no topic to stand on: the earliest arc with an untaught live topic, else the last", async () => {
			const dir = standingCourse("stand-none");
			engine(["--workspace", dir, "save"], { topics: { span: { introduced: true } }, path: { current: null } });
			assert.equal((await standing(dir)).currentArc, "systems");
			engine(["--workspace", dir, "save"], { topics: { rank: { introduced: true }, eigen: { introduced: true } } });
			assert.equal((await standing(dir)).currentArc, "spectra");
		});

		it("studied counts taught topics, chosen methods, path.current and open lessons; held is their arcs and the current one", async () => {
			const dir = standingCourse("stand-studied");
			assert.deepEqual((await standing(dir)).held, ["spaces"]);
			engine(["--workspace", dir, "save"], { observations: [{ topics: ["vectors"], text: "Picked rank", help: "none", result: "incorrect", chose: "rank" }] });
			const v = await standing(dir, { topics: ["eigen"], here: null });
			assert.deepEqual(new Set(v.studied), new Set(["vectors", "span", "rank", "eigen"]));
			assert.deepEqual(v.held, ["spaces", "systems", "spectra"]);
		});

		it("a build keeps clear of the arc of the lesson he has open, which only the app sees", async () => {
			const lesson = { id: "now", title: "now", createdAt: "2026-11-07", updatedAt: "2026-11-07", kind: "teach", messageCount: 4, phase: "teach", pendingQuestion: false, pendingProblem: false, ended: "mid-lesson", ownTopics: ["aic"] } as unknown as ChatSummary;
			const move: MapSubmit = { topics: [], order: [], moves: [{ topic: "ridge", arc: "choose", reason: "Sheet 2 selects the penalty" }] };
			const build = async (name: string, sessions: readonly ChatSummary[]) => {
				const dir = arcCourse(name);
				const ledgers = memoryLedgers();
				adoptNotes(ledgers, dir);
				const mine = sessions.map((c) => ({ ...c, course: { workspace: dir } }) as ChatSummary);
				await createCourseMapBuilder({ courseRecords: records, ledgers, engine: scriptedModel([move]), sessions: () => mine }).buildMap(dir);
				return record(dir);
			};
			assert.equal((await build("arcs-free", [])).topics.ridge.arc, "choose", "with no lesson open, neither arc is held");
			const held = await build("arcs-open", [lesson]);
			assert.equal(held.topics.ridge.arc, "shrink");
			assert.match(held.arc_log.at(-1).reason, /kept "ridge" in "Regularisation", since "Model selection" is an arc he is in or has studied/);
		});
	});

	it("material added to a course from before the builder: only the new material is read", async () => {
		const dir = course("adopted");
		const ledgers = memoryLedgers();
		const model = scriptedModel([{ topics: [{ handle: "cv", title: "Cross-validation", refs: [{ source: "sheet" }] }], order: ["cv"] }]);
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model });
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1\n");
		await builder.adopt(dir, ["material/sheet.md"]);
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		await builder.buildMap(dir);
		assert.deepEqual(model.reads, ["sheet"]);
	});
});


