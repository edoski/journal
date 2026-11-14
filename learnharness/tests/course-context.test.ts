/**
 * A course's context: what Context sorts out of the engine record, and
 * the data path on the real engine. A description reaches the tutor's
 * brief; a linked folder registers its readable files as sources and the
 * map builder reads them; a file dropped in the folder later is
 * registered when the folder's watch fires and the builder reads it alone;
 * a website is registered and read; removing unlinks without touching
 * what the map cites.
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
import type { PiEngine } from "../src/agent/models.ts";
import type { CourseMapLedgers } from "../src/core/ports.ts";
import type { CourseMapLedger, MapSubmit } from "../src/core/course-map-build.ts";
import { citedSources, contextOf, freeHandle, webAddress } from "../src/core/course-context.ts";
import { projectCourseBrief } from "../src/core/course-brief.ts";
import { createCourseContexts, folderMaterial, watchLinkedFolders } from "../src/server/course-context.ts";

describe("context from the record", () => {
	const record = {
		goal: "Probability for CS, written exam",
		sources: {
			"folder-lectures": { path: "/Users/edo/Uni/Lectures", title: "Lectures" },
			"week-1": { path: "/Users/edo/Uni/Lectures/week-1.pdf", title: "week-1" },
			"site-course": { path: "https://probabilitycourse.com/", title: "Course site" },
			"site-bare": { path: "http://www.example.org/notes" },
			slides: { path: "material/slides.pdf", title: "slides" },
		},
		topics: { bayes: { refs: [{ source: "week-1", locator: "p. 3" }] } },
		observations: { o1: { refs: [{ source: "slides" }] } },
	};
	const folders = new Set(["/Users/edo/Uni/Lectures"]);
	const context = contextOf("/c", record, (p) => (p.startsWith("/") ? p : `/c/${p}`), (abs) => folders.has(abs));

	it("sorts sources into folders, websites and files, a folder's own files under it", () => {
		assert.equal(context.description, "Probability for CS, written exam");
		assert.deepEqual(context.folders, [{ handle: "folder-lectures", path: "/Users/edo/Uni/Lectures", title: "Lectures" }]);
		assert.deepEqual(context.websites, [
			{ handle: "site-course", url: "https://probabilitycourse.com/", title: "Course site" },
			{ handle: "site-bare", url: "http://www.example.org/notes", title: "example.org" },
		]);
		assert.deepEqual(context.files, [{ handle: "slides", path: "material/slides.pdf", title: "slides" }]);
	});

	it("knows what the map cites, so it is never unlinked", () => {
		assert.deepEqual([...citedSources(record)].sort(), ["slides", "week-1"]);
	});

	it("reads a typed address as https and refuses anything that is not a website", () => {
		assert.equal(webAddress("probabilitycourse.com"), "https://probabilitycourse.com/");
		assert.equal(webAddress(" http://example.org/a "), "http://example.org/a");
		assert.equal(webAddress("file:///etc/passwd"), null);
		assert.equal(webAddress("notes"), null);
		assert.equal(webAddress(""), null);
	});

	it("names a new source like the engine, never on a taken handle", () => {
		assert.equal(freeHandle("folder", "Lezioni di Probabilità", new Set()), "folder-lezioni-di-probabilita");
		assert.equal(freeHandle("site", "example.org", new Set(["site-example-org"])), "site-example-org-2");
	});
});

const realEngine = fs.existsSync(LEARNING_ENGINE.python);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-context-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
/** The engine keeps paths with links resolved (macOS's /var is /private/var). */
const REAL_TMP = fs.realpathSync(TMP);

function memoryLedgers(): CourseMapLedgers & { all: Map<string, CourseMapLedger> } {
	const all = new Map<string, CourseMapLedger>();
	return { all, get: (w) => all.get(w), save: (w, l) => void all.set(w, structuredClone(l)), workspaces: () => [...all.keys()], forget: (w) => void all.delete(w) };
}

/** A model that reads every source it is told to read now, then submits
 *  the answer; `reads` and `prompts` are what it was given. */
function scriptedModel(answer: MapSubmit): PiEngine & { reads: string[]; prompts: string[] } {
	const reads: string[] = [];
	const prompts: string[] = [];
	const faux = createFauxCore({});
	const step: FauxResponseStep = async (context) => {
		const last = context.messages.at(-1) as { role: string };
		if (last.role === "user") {
			const prompt = JSON.stringify(context.messages.find((m) => m.role === "user"));
			prompts.push(prompt);
			const fresh = [...prompt.matchAll(/- ([a-z0-9_-]+): [^\n]*?\(to read now\)/g)].map((m) => m[1]!);
			reads.push(...fresh);
			return fauxAssistantMessage(fresh.map((source, i) => fauxToolCall("read_material", { source }, { id: `read-${i}` })), { stopReason: "toolUse" });
		}
		return fauxAssistantMessage([fauxToolCall("submit_map", answer as unknown as ToolCall["arguments"], { id: "submit" })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 20 }, () => step));
	return Object.assign({ model: faux.getModel(), streamFn: faux.streamSimple }, { reads, prompts });
}

/** Resolves once `check` holds, re-checked on every course-map status
 *  change the builder reports: its own signal, not a clock. */
function until(check: () => boolean): { tick: () => void; reached: Promise<void> } {
	let resolve!: () => void;
	const reached = new Promise<void>((r) => (resolve = r));
	return { tick: () => check() && resolve(), reached };
}

describe("context on the real engine", { skip: !realEngine && "learning engine not installed" }, () => {
	const home = path.join(TMP, "home");
	fs.mkdirSync(home, { recursive: true });
	const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-07" };
	const records = createCourseRecords({ ...LEARNING_ENGINE, env });
	const engine = (args: string[], input?: unknown) =>
		JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], { cwd: LEARNING_ENGINE.root, env: { ...env, PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());
	const record = (dir: string) => engine(["--workspace", dir, "show", "--all"]);

	function course(name: string): string {
		const dir = path.join(REAL_TMP, name);
		fs.mkdirSync(path.join(dir, "material"), { recursive: true });
		fs.writeFileSync(path.join(dir, "material", "slides.md"), "# Bayes\n");
		engine(["--workspace", dir, "init"]);
		engine(["--workspace", dir, "save"], { title: "Probability" });
		engine(["--workspace", dir, "sources", "--add", "material/slides.md"]);
		return dir;
	}
	function scratchFolder(name: string): string {
		const folder = path.join(REAL_TMP, name);
		fs.mkdirSync(path.join(folder, "week 2"), { recursive: true });
		fs.mkdirSync(path.join(folder, ".git"), { recursive: true });
		fs.writeFileSync(path.join(folder, "week-1.md"), "# Conditional probability\n");
		fs.writeFileSync(path.join(folder, "week 2", "exercises.txt"), "Ex. 1 Bayes\n");
		fs.writeFileSync(path.join(folder, "photo.png"), "not material");
		fs.writeFileSync(path.join(folder, ".hidden.md"), "hidden");
		fs.writeFileSync(path.join(folder, ".git", "HEAD.md"), "hidden");
		return folder;
	}
	function contexts(opened: string[] = [], started: string[] = []) {
		const ledgers = memoryLedgers();
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: scriptedModel({ topics: [], order: [] }) });
		return createCourseContexts({ courseRecords: records, adopt: (w, e) => builder.adopt(w, e), startMap: (w) => void started.push(w), open: async (p) => void opened.push(p) });
	}

	it("a description is the record's goal, and the tutor's brief reads it", async () => {
		const dir = course("describe");
		const described = await contexts().describe(dir, "  Written exam, closed book, lectures 1 to 12  ");
		assert.ok(described.ok);
		assert.equal(described.value.description, "Written exam, closed book, lectures 1 to 12");
		const brief = projectCourseBrief(engine(["--workspace", dir, "resume"]), "teach");
		assert.match(brief.text, /^About the course, in his words: Written exam, closed book, lectures 1 to 12$/m);
		assert.ok((await contexts().describe(dir, "")).ok);
		assert.equal(record(dir).goal, undefined, "an empty description clears it");
	});

	it("linking a folder registers its readable files, hidden ones and others left out, and extends the map", async () => {
		const dir = course("link");
		const folder = scratchFolder("lectures");
		const started: string[] = [];
		const linked = await contexts([], started).linkFolder(dir, folder);
		assert.ok(linked.ok, JSON.stringify(linked));
		assert.deepEqual(linked.value.folders, [{ handle: "folder-lectures", path: folder, title: "lectures" }]);
		assert.deepEqual(linked.value.files.map((f) => f.path), ["material/slides.md"], "the folder's files show as the folder");
		const paths = Object.values(record(dir).sources as Record<string, { path: string }>).map((s) => s.path).sort();
		assert.deepEqual(paths, [path.join(folder, "week 2", "exercises.txt"), path.join(folder, "week-1.md"), folder, "material/slides.md"].sort());
		assert.deepEqual(started, [dir]);
		assert.equal((await contexts().linkFolder(dir, folder)).ok, false, "a folder links once");
		assert.equal((await contexts().linkFolder(dir, path.join(TMP, "nowhere"))).ok, false);
	});

	it("a website is registered under its site's name; a typed address reads as https", async () => {
		const dir = course("website");
		const added = await contexts().addWebsite(dir, "probabilitycourse.com/chapter1");
		assert.ok(added.ok);
		assert.deepEqual(added.value.websites, [{ handle: "site-probabilitycourse-com", url: "https://probabilitycourse.com/chapter1", title: "probabilitycourse.com" }]);
		assert.equal((await contexts().addWebsite(dir, "ftp://example.org")).ok, false);
	});

	it("opens only what the course links", async () => {
		const dir = course("open");
		const folder = scratchFolder("open-folder");
		const opened: string[] = [];
		const c = contexts(opened);
		await c.linkFolder(dir, folder);
		assert.ok((await c.open(dir, "folder-open-folder")).ok);
		assert.ok((await c.open(dir, "slides")).ok);
		assert.deepEqual(opened, [folder, path.join(dir, "material", "slides.md")]);
		assert.equal((await c.open(dir, "not-linked")).ok, false);
	});

	it("unlinking a folder takes its files, except one the map cites; a cited file stays linked", async () => {
		const dir = course("remove");
		const folder = scratchFolder("remove-folder");
		const c = contexts();
		await c.linkFolder(dir, folder);
		engine(["--workspace", dir, "save"], { topics: { bayes: { title: "Bayes", refs: [{ source: "week-1", locator: "§1" }, { source: "slides" }] } } });
		const removed = await c.remove(dir, "folder-remove-folder");
		assert.ok(removed.ok);
		assert.deepEqual(removed.value.folders, []);
		assert.deepEqual(Object.keys(record(dir).sources).sort(), ["slides", "week-1"]);
		const cited = await c.remove(dir, "slides");
		assert.deepEqual(cited, { ok: false, status: 409, error: "Topics on the map cite slides, so it stays linked." });
	});

	it("a file dropped into a linked folder is registered when the folder's watch fires, and the builder reads it alone", async () => {
		const dir = course("watch");
		const folder = scratchFolder("watched");
		const ledgers = memoryLedgers();
		const model = scriptedModel({ topics: [{ handle: "bayes", title: "Bayes' theorem", refs: [{ source: "week-1" }] }], order: ["bayes"] });
		const built = until(() => (ledgers.all.get(dir)?.done.length ?? 0) >= 3);
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model, onStatus: built.tick });
		const start = (w: string) => void builder.buildMap(w);
		const c = createCourseContexts({ courseRecords: records, adopt: (w, e) => builder.adopt(w, e), startMap: start });
		await c.linkFolder(dir, folder);
		const first = until(() => model.reads.length >= 2);
		const poll = setInterval(first.tick, 20);
		await first.reached;
		clearInterval(poll);
		assert.deepEqual(model.reads.sort(), ["exercises", "week-1"], "the folder's files are read, not the folder");
		assert.doesNotMatch(model.prompts[0]!, /folder-watched/, "the folder itself is not a source to cite");

		const registered = until(() => Object.values(record(dir).sources as Record<string, { path: string }>).some((s) => s.path.endsWith("bayes.md")));
		const stop = watchLinkedFolders({ contexts: c, courseRecords: { list: async () => ({ available: true, courses: [{ workspace: dir }] as never, unreadable: [] }) }, settleMs: 50 });
		try {
			await new Promise((r) => setTimeout(r, 300));
			fs.writeFileSync(path.join(folder, "week 2", "bayes.md"), "# Bayes' theorem\n");
			const poll2 = setInterval(registered.tick, 50);
			await registered.reached;
			clearInterval(poll2);
			await built.reached;
		} finally {
			stop();
		}
		assert.deepEqual(model.reads.slice(2), ["bayes-2"], "only the new file is read (the topic holds the handle bayes)");
	});

	it("a linked website is fetched and read as text", async () => {
		const dir = course("read-site");
		const ledgers = memoryLedgers();
		const model = scriptedModel({ topics: [{ handle: "bayes", title: "Bayes' theorem", refs: [{ source: "site-course-site", locator: "Chapter 1" }] }], order: ["bayes"] });
		const builder = createCourseMapBuilder({ courseRecords: records, ledgers, engine: model, fetchPage: async (url) => `# Course page\n\nSource: ${url}\n\nChapter 1: Bayes` });
		await builder.adopt(dir, []);
		await createCourseContexts({ courseRecords: records, adopt: () => Promise.resolve(), startMap: () => {} }).addWebsite(dir, "https://example.org/course", "Course site");
		assert.equal((await builder.buildMap(dir)).status, "saved");
		assert.deepEqual(model.reads, ["site-course-site"]);
		assert.deepEqual(record(dir).topics.bayes.refs, [{ source: "site-course-site", locator: "Chapter 1" }], "the map cites the website");
		assert.match(model.prompts[0]!, /site-course-site: Course site, https:\/\/example.org\/course \(text, \d+ characters\)/);
	});
});

describe("a folder's material", () => {
	it("lists readable files under the folder by path, skipping hidden ones and dependency trees", () => {
		const folder = path.join(TMP, "listing");
		fs.mkdirSync(path.join(folder, "node_modules", "x"), { recursive: true });
		fs.mkdirSync(path.join(folder, "b"), { recursive: true });
		fs.writeFileSync(path.join(folder, "node_modules", "x", "README.md"), "");
		fs.writeFileSync(path.join(folder, "b", "two.pdf"), "");
		fs.writeFileSync(path.join(folder, "a.tex"), "");
		fs.writeFileSync(path.join(folder, "a.png"), "");
		assert.deepEqual(folderMaterial(folder), [path.join(folder, "a.tex"), path.join(folder, "b", "two.pdf")]);
	});
});
