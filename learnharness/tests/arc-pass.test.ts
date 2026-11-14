/**
 * The grouping pass: its pure checks and merges, its ledger, and its runs on
 * the real engine with a scripted model (the edge step's saves on a re-read
 * record, a cut the engine refuses going back to the agent, and a course
 * whose ledger is not `new` never running live).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type FauxResponseStep, type ToolCall } from "@earendil-works/pi-ai";
import { LEARNING_ENGINE } from "../config.ts";
import {
	againstCut,
	ARC_PASS_MIN_TOPICS,
	arcPassChanges,
	arcPassProblems,
	doubtNote,
	edgeChanges,
	edgeDiffs,
	edgeProblems,
	passDue,
	stripPrefixes,
	type ArcPassLedger,
	type ArcPassView,
	type ArcSubmit,
	type EdgeSubmit,
} from "../src/core/arc-pass.ts";
import { duplicateOf, type ViewTopic } from "../src/core/course-map-build.ts";
import { createArcPass, type TranscriptEntry } from "../src/agent/subagents/arc-former.ts";
import { mapRuns } from "../src/agent/subagents/course-map-builder.ts";
import type { PiEngine } from "../src/agent/models.ts";
import { arcPassLedgersAt } from "../src/store/arc-pass-ledgers.ts";
import { createCourseRecords } from "../src/store/course-records.ts";
import type { ArcPassLedgers } from "../src/core/ports.ts";

const topic = (title: string, needs: string[] = [], over: Partial<ViewTopic> = {}): ViewTopic => ({ title, needs, contrasts: [], refs: [], aliases: [], ...over });

const view = (topics: Record<string, ViewTopic>, over: Partial<ArcPassView> = {}): ArcPassView => ({
	topics,
	order: Object.keys(topics),
	current: null,
	basis: null,
	exam: {},
	sources: ["book"],
	taken: [],
	arcs: [],
	topicArc: {},
	examArcs: [],
	studied: [],
	held: [],
	currentArc: null,
	examDate: null,
	...over,
});

const CALC = {
	limits: topic("Limits"),
	continuity: topic("Continuity", ["limits"]),
	derivative: topic("The derivative", ["limits"]),
	chain: topic("Chain rule", ["derivative"]),
	riemann: topic("Riemann sums", ["limits", "chain"]),
};

const arc = (handle: string, title: string, topics: string[], over: Partial<ArcSubmit["arcs"][number]> = {}) => ({
	handle,
	title,
	question: `What is ${title}?`,
	purpose: `Use ${title}.`,
	refs: [{ source: "book", locator: `Chapter on ${title}` }],
	topics,
	...over,
});

describe("the edge step", () => {
	const all: EdgeSubmit = {
		verdicts: [
			{ topic: "continuity", need: "limits", keep: true, reason: "continuity is defined by a limit" },
			{ topic: "derivative", need: "limits", keep: true, reason: "the derivative is a limit" },
			{ topic: "chain", need: "derivative", keep: true, reason: "it differentiates a composition" },
			{ topic: "riemann", need: "limits", keep: true, reason: "the integral is a limit of sums" },
			{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum can be worked without ever differentiating" },
		],
		add: [{ topic: "chain", need: "continuity", reason: "test add" }],
	};

	it("takes an answer that judges every stored edge once, each with its reason", () => {
		assert.equal(edgeProblems(all, view(CALC)), null);
	});

	it("refuses an answer that skips an edge, judges one twice or gives no reason", () => {
		const problems = edgeProblems({ verdicts: [all.verdicts[0]!, all.verdicts[0]!, { ...all.verdicts[1]!, reason: " " }], add: [] }, view(CALC))!;
		assert.match(problems, /twice/);
		assert.match(problems, /gives no reason/);
		assert.match(problems, /no verdict for "chain" needs "derivative", "riemann" needs "limits", "riemann" needs "chain"/);
	});

	it("refuses an added edge that is stored already, names no topic, or closes a loop", () => {
		const stored = edgeProblems({ ...all, add: [{ topic: "chain", need: "derivative", reason: "x" }] }, view(CALC))!;
		assert.match(stored, /stored already/);
		assert.match(edgeProblems({ ...all, add: [{ topic: "chain", need: "ghost", reason: "x" }] }, view(CALC))!, /both must be topics/);
		assert.match(edgeProblems({ ...all, add: [{ topic: "limits", need: "chain", reason: "x" }] }, view(CALC))!, /form a loop/);
	});

	it("saves per-topic diffs against the record read at save time: a need added meanwhile stays", () => {
		const diffs = edgeDiffs(all);
		const now = view({ ...CALC, riemann: topic("Riemann sums", ["limits", "chain", "continuity"]) });
		const merged = edgeChanges(diffs, now)!;
		assert.deepEqual(merged.changes, { topics: { riemann: { needs: ["limits", "continuity"] }, chain: { needs: ["derivative", "continuity"] } } });
		assert.deepEqual(
			merged.applied.map((d) => `${d.change} ${d.topic}<-${d.need}`),
			["drop riemann<-chain", "add chain<-continuity"],
		);
	});

	it("skips a drop of an edge already gone and an add that would now close a loop", () => {
		const now = view({ ...CALC, riemann: topic("Riemann sums", ["limits"]), continuity: topic("Continuity", ["limits", "chain"]) });
		const merged = edgeChanges(edgeDiffs(all), now);
		assert.equal(merged, null);
	});
});

describe("the cut's shape rules", () => {
	const good: ArcSubmit = {
		arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("derivatives", "Derivatives", ["derivative", "chain", "riemann"])],
		basis: "the book's chapters 2 and 3",
	};

	it("takes a cut that homes every topic once in at least two arcs", () => {
		assert.equal(arcPassProblems(good, view(CALC)), null);
	});

	it("R1: every topic, left-out ones too, in exactly one arc", () => {
		const left = { ...CALC, extra: topic("Extra", [], { excluded: "not examined" }) };
		assert.match(arcPassProblems(good, view(left))!, /in no arc: extra/);
		const twice = { ...good, arcs: [good.arcs[0]!, { ...good.arcs[1]!, topics: ["derivative", "chain", "riemann", "limits"] }] };
		assert.match(arcPassProblems(twice, view(CALC))!, /"limits" is in both/);
	});

	it("R6: two arcs or none, and a one-topic arc only with its reason", () => {
		assert.match(arcPassProblems({ ...good, arcs: [arc("all", "Calculus", Object.keys(CALC))] }, view(CALC))!, /form at least two/);
		const lone = { ...good, arcs: [arc("a", "Limits", ["limits"]), arc("b", "The rest", ["continuity", "derivative", "chain", "riemann"])] };
		assert.match(arcPassProblems(lone, view(CALC))!, /holds one topic/);
		assert.equal(arcPassProblems({ ...lone, arcs: [{ ...lone.arcs[0]!, single: "its own chapter, and the midterm treats it alone" }, lone.arcs[1]!] }, view(CALC)), null);
		assert.match(arcPassProblems({ ...good, none: "five topics" }, view(CALC))!, /send one or the other/);
		assert.equal(arcPassProblems({ arcs: [], none: "five topics, one unit", basis: "" }, view(CALC)), null);
	});

	it("R6: no two arcs share a unit of the material without saying why on each", () => {
		const shared = { ...good, arcs: good.arcs.map((a) => ({ ...a, refs: [{ source: "book", locator: "Chapter 2" }] })) };
		assert.match(arcPassProblems(shared, view(CALC))!, /share a unit of the material only with a reason/);
		assert.equal(arcPassProblems({ ...shared, arcs: shared.arcs.map((a) => ({ ...a, shares: "the chapter teaches both ideas" })) }, view(CALC)), null);
	});

	it("an exam's scope only with an exam date, and leaves out only topics of its arcs", () => {
		assert.match(arcPassProblems({ ...good, examArcs: ["limits-continuity"] }, view(CALC))!, /no exam date/);
		assert.match(arcPassProblems({ ...good, examArcs: ["limits-continuity"], leavesOut: ["chain"] }, view(CALC, { examDate: "2026-12-01" }))!, /"chain", which is in none of examArcs/);
		assert.match(arcPassProblems({ ...good, leavesOut: ["chain"] }, view(CALC))!, /leavesOut needs examArcs/);
	});

	it("R4: with registered material, every arc cites the unit it follows", () => {
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, refs: [] }, good.arcs[1]!] }, view(CALC))!, /"limits-continuity" cites no unit of the material/);
		assert.equal(arcPassProblems({ ...good, arcs: good.arcs.map((a) => ({ ...a, refs: [] })) }, view(CALC, { sources: [] })), null, "a course with no material has none to cite");
	});

	it("an edge proposal that would point backward under the cut says so", () => {
		const diffs = [
			{ topic: "derivative", need: "riemann", change: "add" as const, reason: "x" },
			{ topic: "riemann", need: "chain", change: "drop" as const, reason: "y" },
			{ topic: "chain", need: "limits", change: "add" as const, reason: "z" },
		];
		const arcs = { limits: "a", derivative: "b", chain: "b", riemann: "c" };
		assert.deepEqual(
			againstCut(diffs, arcs, ["a", "b", "c"]).map((d) => [d.topic, d.need, d.backward]),
			[["derivative", "riemann", true], ["riemann", "chain", false], ["chain", "limits", false]],
		);
	});

	it("an arc handle no topic, source, task or knowledge entry has", () => {
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, handle: "limits" }, good.arcs[1]!] }, view(CALC))!, /needs a handle no topic/);
		assert.match(arcPassProblems({ ...good, arcs: [{ ...good.arcs[0]!, handle: "book" }, good.arcs[1]!] }, view(CALC))!, /needs a handle no topic/);
	});

	it("the merge never sends needs: a doubted edge is a note, kept", () => {
		const formation = arcPassChanges({ ...good, doubts: [{ topic: "riemann", need: "chain", reason: "no derivative in a sum" }] }, view(CALC))!;
		for (const t of Object.values(formation.changes.topics as Record<string, object>)) assert.equal("needs" in t, false);
		assert.deepEqual(doubtNote({ ...good, doubts: [{ topic: "riemann", need: "chain", reason: "no derivative in a sum" }] }), {
			arc_change: { reason: 'prerequisites the grouping pass doubts, kept as they are: "riemann" needs "chain" (no derivative in a sum)' },
		});
	});

	it("re-derives on the record read at save time: a topic added since gets no arc, one gone is left out, and the path reads arc by arc", () => {
		const now = { ...CALC, implicit: topic("Implicit differentiation", ["chain"]) };
		delete (now as Partial<typeof now>).continuity;
		const formation = arcPassChanges(good, view(now, { order: ["limits", "derivative", "implicit", "chain", "riemann"] }), { edges: 'dropped "riemann" needs "chain" (x)', asked: "copy run" })!;
		assert.deepEqual(formation.gone, ["continuity"]);
		assert.deepEqual(formation.placedByEngine, ["implicit"]);
		assert.deepEqual(Object.keys(formation.changes.topics as object), ["limits", "derivative", "chain", "riemann"]);
		assert.deepEqual(formation.changes.path, { arcs: ["limits-continuity", "derivatives"], order: ["limits", "derivative", "chain", "riemann", "implicit"] });
		assert.deepEqual(formation.changes.arc_change, { reason: 'the book\'s chapters 2 and 3; edges settled first: dropped "riemann" needs "chain" (x)', asked: "copy run" });
	});
});

describe("the label strip", () => {
	const titles: Record<string, string> = {
		pricing: "GTM: Pricing",
		outbound: "GTM: Outbound",
		railway: "Railway: Deploys",
		evePricing: "Eve: Pricing",
		eveDeploy: "Eve: Deploy pipeline",
		evePipe: "Deploy pipeline",
	};
	const titleOf = (t: string) => titles[t];

	it("drops a label two or more of an arc's topics share, and keeps one a topic carries alone", () => {
		assert.deepEqual(stripPrefixes([{ topics: ["pricing", "outbound", "railway"] }], titleOf), { pricing: "Pricing", outbound: "Outbound" });
	});

	it("keeps a label whose strip would make two topics of one arc read as one", () => {
		assert.deepEqual(stripPrefixes([{ topics: ["evePricing", "eveDeploy", "evePipe"] }], titleOf), { evePricing: "Pricing" });
	});

	it("never merges topics that share a phrase: in two arcs both stay, each with its handle", () => {
		const topics = { pricing: topic("GTM: Pricing"), outbound: topic("GTM: Outbound"), evePricing: topic("Eve: Pricing"), eveDeploy: topic("Eve: Deploy pipeline") };
		const cut: ArcSubmit = { arcs: [arc("gtm", "Go to market", ["pricing", "outbound"]), arc("eve", "Eve", ["evePricing", "eveDeploy"])], basis: "branches" };
		const formation = arcPassChanges(cut, view(topics))!;
		assert.deepEqual(formation.changes.topics, {
			pricing: { title: "Pricing", arc: "gtm" },
			outbound: { title: "Outbound", arc: "gtm" },
			evePricing: { title: "Pricing", arc: "eve" },
			eveDeploy: { title: "Deploy pipeline", arc: "eve" },
		});
		const arcOf: Record<string, string> = { pricing: "gtm", outbound: "gtm", evePricing: "eve", eveDeploy: "eve" };
		const after = Object.fromEntries(Object.entries(formation.changes.topics as Record<string, { title: string }>).map(([k, t]) => [k, { title: t.title, aliases: [] }]));
		const order = ["gtm", "eve"];
		const within = (needs: string[]) => (twin: string) => order.indexOf(arcOf[twin]!) >= Math.max(0, ...needs.map((n) => order.indexOf(arcOf[n]!)));
		assert.equal(duplicateOf({ handle: "eve-pricing-2", title: "Pricing" }, { evePricing: after.evePricing! }, within(["eveDeploy"])), "evePricing", "a twin in its placement range is the same topic");
		assert.equal(duplicateOf({ handle: "gtm-pricing-2", title: "Pricing" }, { evePricing: after.evePricing! }, () => false), null, "a twin outside it is another topic");
	});

	it("never touches a title outside a strip, and titles only an untitled topic", () => {
		const topics = { a: topic("Linear regression"), b: topic("Linear regression assumptions"), c: { ...topic(""), title: undefined } };
		const cut: ArcSubmit = { arcs: [arc("x", "Regression", ["a", "b"]), arc("y", "Diagnostics", ["c"], { single: "test" })], titles: [{ topic: "c", title: "Residual plots" }], basis: "b" };
		assert.deepEqual(arcPassChanges(cut, view(topics))!.changes.topics, { a: { arc: "x" }, b: { arc: "x" }, c: { title: "Residual plots", arc: "y" } });
	});
});

describe("the ledger", () => {
	const record = (n: number, arcs = false) => ({ topics: Object.fromEntries(Array.from({ length: n }, (_, i) => [`t${i}`, { title: `T${i}` }])), ...(arcs ? { arcs: { a: {} } } : {}) });
	const ledger = (state: ArcPassLedger["state"], topics = 0): ArcPassLedger => ({ state, at: "2026-11-14T10:00:00Z", topics });

	it("a course without a ledger, the real courses' case, is never due", () => {
		assert.equal(passDue(undefined, record(30)), false);
	});

	it("a new course is due once it has enough topics and no arcs", () => {
		assert.equal(passDue(ledger("new"), record(ARC_PASS_MIN_TOPICS - 1)), false);
		assert.equal(passDue(ledger("new"), record(ARC_PASS_MIN_TOPICS)), true);
		assert.equal(passDue(ledger("new"), record(10, true)), false);
	});

	it("none and failed are tried again only once the topic count changes; every other state has had its run", () => {
		assert.equal(passDue(ledger("none", 6), record(6)), false);
		assert.equal(passDue(ledger("none", 6), record(9)), true);
		assert.equal(passDue(ledger("failed", 6), record(7)), true);
		for (const state of ["proposed", "approved", "formed"] as const) assert.equal(passDue(ledger(state, 1), record(9)), false, state);
	});

	it("is kept in its own file, and an entry with an unknown state reads as none", () => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-ledger-")), "arc-passes.json");
		const store = arcPassLedgersAt(file);
		store.save("/c", ledger("new"));
		assert.deepEqual(store.get("/c"), ledger("new"));
		fs.writeFileSync(file, JSON.stringify({ "/c": ledger("new"), "/d": { state: "live", at: "", topics: 1 } }));
		assert.equal(store.get("/d"), undefined);
		store.forget("/c");
		assert.deepEqual(store.workspaces(), ["/d"]);
	});
});

// ─── runs, on the real engine ────────────────────────────────────────────────

const realEngine = fs.existsSync(LEARNING_ENGINE.python);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-pass-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function memoryLedgers(): ArcPassLedgers & { all: Map<string, ArcPassLedger> } {
	const all = new Map<string, ArcPassLedger>();
	return { all, get: (w) => all.get(w), save: (w, l) => void all.set(w, structuredClone(l)), workspaces: () => [...all.keys()], forget: (w) => void all.delete(w) };
}

/** A model that answers the edge step with `edges` and the cut with each of
 *  `cuts` in turn (the next one after a refusal), and counts its calls. */
function scriptedModel(edges: EdgeSubmit, cuts: ArcSubmit[], hook?: () => void): PiEngine & { calls: number; refusals: string[] } {
	const faux = createFauxCore({});
	const state = { calls: 0, refusals: [] as string[] };
	let cut = 0;
	const step: FauxResponseStep = async (context) => {
		state.calls++;
		hook?.();
		const last = context.messages.at(-1) as { role: string; isError?: boolean; content?: Array<{ text?: string }> };
		if (last.role === "toolResult" && last.isError) state.refusals.push(last.content?.map((c) => c.text ?? "").join("") ?? "");
		if (JSON.stringify(context).includes("submit_edges")) return fauxAssistantMessage([fauxToolCall("submit_edges", edges as unknown as ToolCall["arguments"], { id: `edges-${state.calls}` })], { stopReason: "toolUse" });
		const answer = cuts[Math.min(cut++, cuts.length - 1)]!;
		return fauxAssistantMessage([fauxToolCall("submit_arcs", answer as unknown as ToolCall["arguments"], { id: `cut-${state.calls}` })], { stopReason: "toolUse" });
	};
	faux.setResponses(Array.from({ length: 20 }, () => step));
	return Object.assign(state, { model: faux.getModel(), streamFn: faux.streamSimple });
}

describe("the grouping pass (real engine, scripted model)", { skip: !realEngine && "learning engine not installed" }, () => {
	const home = path.join(TMP, "home");
	fs.mkdirSync(home, { recursive: true });
	const env = { ...process.env, HOME: home, LEARNING_TODAY: "2026-11-14" };
	const records = createCourseRecords({ ...LEARNING_ENGINE, env });
	const engine = (args: string[], input?: unknown) =>
		JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", ...args], { cwd: LEARNING_ENGINE.root, env: { ...env, PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());
	const record = (dir: string) => engine(["--workspace", dir, "show", "--all"]);

	function course(name: string): string {
		const dir = path.join(TMP, name);
		fs.mkdirSync(dir, { recursive: true });
		engine(["--workspace", dir, "init"]);
		engine(["--workspace", dir, "save"], {
			title: "Calculus",
			topics: Object.fromEntries(Object.entries(CALC).map(([k, t]) => [k, { title: t.title, needs: t.needs }])),
			path: { order: Object.keys(CALC) },
		});
		return dir;
	}

	const EDGES: EdgeSubmit = {
		verdicts: [
			{ topic: "continuity", need: "limits", keep: true, reason: "defined by a limit" },
			{ topic: "derivative", need: "limits", keep: true, reason: "a limit of quotients" },
			{ topic: "chain", need: "derivative", keep: true, reason: "differentiates compositions" },
			{ topic: "riemann", need: "limits", keep: true, reason: "a limit of sums" },
			{ topic: "riemann", need: "chain", keep: false, reason: "a Riemann sum needs no derivative" },
		],
		add: [],
	};
	const bare = (a: ReturnType<typeof arc>) => ({ ...a, refs: [] });
	const CUT: ArcSubmit = {
		arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("derivatives", "Derivatives", ["derivative", "chain"]), arc("integrals", "Integrals", ["riemann"], { single: "its own chapter" })].map(bare),
		basis: "the book's chapters 2 to 5",
	};

	it("applies the settled edges, then forms the arcs in one save that changes no need", async () => {
		const dir = course("formed");
		const model = scriptedModel(EDGES, [CUT]);
		const log: TranscriptEntry[] = [];
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "apply", transcript: (e) => log.push(e) });
		assert.equal(result.status, "formed", JSON.stringify(result));
		const r = record(dir);
		assert.deepEqual(r.path.arcs, ["limits-continuity", "derivatives", "integrals"]);
		assert.deepEqual(r.topics.riemann.needs, ["limits"], "the edge step's drop");
		assert.equal(r.topics.riemann.arc, "integrals");
		assert.deepEqual(
			log.filter((e) => e.kind === "saved").map((e) => e.step),
			["edges", "cut"],
		);
		const cutSave = log.find((e) => e.kind === "saved" && e.step === "cut") as { changes: { topics: Record<string, object> } };
		for (const t of Object.values(cutSave.changes.topics)) assert.equal("needs" in t, false);
		assert.match(r.arc_log[0].reason, /edges settled first: dropped "riemann" needs "chain"/);
		const report = result.status === "formed" ? (result.report as { backward: unknown[] }) : null;
		assert.deepEqual(report?.backward, []);
	});

	it("in propose mode saves no edge, and a cut the engine refuses (a need on a later arc) goes back to the agent", async () => {
		const dir = course("proposed");
		const backward: ArcSubmit = { ...CUT, arcs: [arc("limits-continuity", "Limits and continuity", ["limits", "continuity"]), arc("integrals", "Integrals", ["riemann"], { single: "x" }), arc("derivatives", "Derivatives", ["derivative", "chain"])].map(bare) };
		const model = scriptedModel(EDGES, [backward, CUT]);
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: model }).run(dir, { edges: "propose" });
		assert.equal(result.status, "formed");
		assert.match(model.refusals.join("\n"), /The engine refused the arcs: .*no topic may need a later arc/);
		assert.deepEqual(record(dir).topics.riemann.needs, ["limits", "chain"], "proposed, not applied");
		assert.equal(result.status === "formed" && result.edges.diffs.length, 1);
		assert.deepEqual(result.status === "formed" && result.edges.applied, []);
	});

	it("a course he has studied takes arcs only with words in asked", async () => {
		const dir = course("studied");
		engine(["--workspace", dir, "save"], { topics: { limits: { introduced: "2026-11-01" } } });
		const refusing = scriptedModel(EDGES, [CUT]);
		await assert.rejects(createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: refusing }).run(dir, { edges: "propose" }), /never submitted/);
		assert.match(refusing.refusals[0]!, /forms arcs in a course he has already studied/);
		assert.equal("arcs" in record(dir) && Object.keys(record(dir).arcs).length, 0);
		const result = await createArcPass({ courseRecords: records, ledgers: memoryLedgers(), engine: scriptedModel(EDGES, [CUT]) }).run(dir, { edges: "propose", asked: "approved by Edo on 2026-11-14: yes, form them" });
		assert.equal(result.status, "formed");
		assert.equal(record(dir).arc_log[0].asked, "approved by Edo on 2026-11-14: yes, form them");
	});

	it("a course whose ledger is not new never runs live: no model call, nothing saved", async () => {
		for (const ledger of [undefined, { state: "formed" as const, at: "", topics: 5 }, { state: "proposed" as const, at: "", topics: 5 }, { state: "none" as const, at: "", topics: 5 }]) {
			const dir = course(`never-${ledger?.state ?? "unledgered"}`);
			const ledgers = memoryLedgers();
			if (ledger) ledgers.save(dir, ledger);
			const model = scriptedModel(EDGES, [CUT]);
			const pass = createArcPass({ courseRecords: records, ledgers, engine: model });
			const revision = record(dir).revision;
			pass.built(dir);
			await pass.settle(dir);
			await pass.resumeCut();
			assert.equal(model.calls, 0, ledger?.state ?? "no ledger");
			assert.equal(record(dir).revision, revision);
			assert.equal(mapRuns().inFlight.has(dir), false);
		}
	});

	it("a new course runs once its map build saved and ended, and records formed", async () => {
		const dir = course("live");
		const ledgers = memoryLedgers();
		ledgers.save(dir, { state: "new", at: "", topics: 0 });
		const model = scriptedModel(EDGES, [CUT], () => assert.equal(mapRuns().inFlight.has(dir), true, "it holds the course"));
		const rebuilt: string[] = [];
		const pass = createArcPass({ courseRecords: records, ledgers, engine: model, rebuild: (w) => rebuilt.push(w) });
		mapRuns().inFlight.add(dir);
		pass.built(dir);
		await pass.settle(dir);
		assert.equal(model.calls, 0, "waits while the build holds the course");
		mapRuns().inFlight.delete(dir);
		mapRuns().rerun.add(dir);
		await pass.settle(dir);
		assert.equal(model.calls, 0, "and while a build is asked for again");
		mapRuns().rerun.delete(dir);
		await pass.settle(dir);
		assert.equal(ledgers.get(dir)?.state, "formed");
		assert.equal(ledgers.get(dir)?.revision, record(dir).revision);
		assert.equal(mapRuns().inFlight.has(dir), false);
		await pass.settle(dir);
		assert.equal(model.calls, 2, "one run, its two answers");
	});

	it("a new course he has already studied records failed without asking a model", async () => {
		const dir = course("live-studied");
		engine(["--workspace", dir, "save"], { topics: { limits: { introduced: "2026-11-01" } } });
		const ledgers = memoryLedgers();
		ledgers.save(dir, { state: "new", at: "", topics: 0 });
		const model = scriptedModel(EDGES, [CUT]);
		const pass = createArcPass({ courseRecords: records, ledgers, engine: model });
		await pass.resumeCut();
		assert.equal(ledgers.get(dir)?.state, "failed");
		assert.match(ledgers.get(dir)!.reason!, /only his words can ask for arcs/);
		assert.equal(model.calls, 0);
	});
});
