/**
 * The course map builder: its pure merge (what a build may change in a
 * course record), its duplicate check by meaning, and the runner on the
 * real engine with a scripted model: one save at the end, a rerun that
 * changes nothing, material added later read alone, a second add during a
 * build run once more, and a stopped build that leaves the course as it was.
 */

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
import { abortExtraction } from "../src/agent/subagents/extraction.ts";
import type { PiEngine } from "../src/agent/models.ts";
import type { CourseMapLedgers } from "../src/core/ports.ts";
import {
	answerProblems,
	buildWindow,

	duplicateOf,
	mapChanges,
	sameName,
	type CourseMapLedger,
	type MapCourseView,
	type MapSubmit,
} from "../src/core/course-map-build.ts";

const view = (over: Partial<MapCourseView> = {}): MapCourseView => ({ topics: {}, order: [], current: null, basis: null, exam: {}, sources: ["notes", "sheet"], taken: [], ...over });
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
		current: "ols",
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
		assert.deepEqual(merged.changes.path, { order: ["ols", "ridge", "lasso", "trees"], current: "ols", basis: "Notes order" });
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
			current: "ols",
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
			current: "ridge",
			basis: "Your order",
		});
		const merged = mapChanges(
			{
				topics: [
					{ handle: "ridge", title: "Ridge regression", needs: ["ols", "cv"], refs: [{ source: "sheet", locator: "Ex. 2" }], excluded: "not examined" },
					{ handle: "cv", title: "Cross-validation", refs: [{ source: "sheet", locator: "Ex. 1" }] },
				],
				order: ["cv", "ridge"],
				current: "cv",
				basis: "Sheet order",
			},
			before,
		);
		assert.ok(merged);
		assert.deepEqual(merged.changes.topics, {
			ridge: { needs: ["ols", "cv"], refs: [{ source: "sheet", locator: "Ex. 2" }], excluded: "not examined" },
			cv: { title: "Cross-validation", refs: [{ source: "sheet", locator: "Ex. 1" }] },
		});
		assert.deepEqual(merged.changes.path, { order: ["cv", "ols", "ridge"] }, "a new topic with nothing placed before it goes first; current and basis stay");
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
			view({ topics: { eigen: topic("Eigenvalues") }, order: ["eigen"], current: "eigen" }),
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

// ─── the runner, on the real engine ─────────────────────────────────────────

const realEngine = fs.existsSync(LEARNING_ENGINE.python);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-map-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function memoryLedgers(): CourseMapLedgers & { all: Map<string, CourseMapLedger> } {
	const all = new Map<string, CourseMapLedger>();
	return { all, get: (w) => all.get(w), save: (w, l) => void all.set(w, structuredClone(l)), workspaces: () => [...all.keys()] };
}

/** A model that reads every source it is told to read now, then submits
 *  `answers` in turn (the next one after a refusal). */
function scriptedModel(answers: MapSubmit[], gate?: Promise<void>): PiEngine & { reads: string[] } {
	const reads: string[] = [];
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
		const answer = answers[Math.min(submitted++, answers.length - 1)]!;
		return fauxAssistantMessage([fauxToolCall("submit_map", answer as unknown as ToolCall["arguments"], { id: `submit-${submitted}` })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 20 }, () => step));
	return Object.assign({ model: faux.getModel(), streamFn: faux.streamSimple }, { reads });
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
		assert.deepEqual(built.path, { current: "ols", order: ["ols", "ridge"], basis: "Notes order" });
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
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model });
		const first = builder.buildMap(dir);
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		assert.deepEqual(await builder.buildMap(dir), { status: "busy" });
		assert.deepEqual(await builder.buildMap(dir), { status: "busy" }, "a third request folds into the same rerun");
		release();
		await first;
		for (let waited = 0; (builder.status(dir).state === "building" || ledgers.all.get(dir)!.done.length < 2) && waited < 250; waited++) await new Promise((r) => setTimeout(r, 20));
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
		while (!abortExtraction(dir)) await new Promise((r) => setTimeout(r, 10));
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
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model });
		const first = builder.buildMap(dir);
		await builder.adopt(dir, ["material/sheet.md"]);
		fs.writeFileSync(path.join(dir, "material", "sheet.md"), "Ex. 1\n");
		engine(["--workspace", dir, "sources", "--add", "material/sheet.md"]);
		void builder.buildMap(dir);
		release();
		await first;
		for (let waited = 0; ledgers.all.get(dir)!.done.length < 2 && waited < 250; waited++) await new Promise((r) => setTimeout(r, 20));
		assert.deepEqual(ledgers.all.get(dir)!.done.map((d) => d.outcome.startsWith("material the course had") ? "adopted" : "built"), ["built", "built"]);
		assert.deepEqual(model.reads, ["notes", "sheet"]);
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


