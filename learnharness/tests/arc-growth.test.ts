/**
 * Arcs that grow (core/arc-recut.ts, server/arc-growth.ts): the re-cut of
 * the arcs he has not begun reads the course without the held arcs, and
 * its saves land on the whole record with the held arcs, their topics and
 * his place untouched. The save runs on the real engine, in a temporary
 * home, so the engine's own arc rules judge it.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { realEngineMissing } from "./helpers/real-engine.ts";

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-arc-growth-")));
process.env.HOME = path.join(TMP, "home");
process.env.LEARNING_TODAY = "2026-11-22";
process.env.LH_DATA_DIR = path.join(TMP, "data");
fs.mkdirSync(process.env.HOME, { recursive: true });

const { LEARNING_ENGINE } = await import("../config.ts");
const { onRecord, presented, presentedStanding, recutPlan } = await import("../src/core/arc-recut.ts");
const { newUnits, recutRecords } = await import("../src/server/arc-growth.ts");
const { stores } = await import("../src/server/stores.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const arc = (title: string) => ({ title, question: `What is ${title.toLowerCase()} for?`, purpose: `Use ${title.toLowerCase()}.` });
const RECORD = {
	title: "Calculus",
	arcs: { limits: arc("Limits"), derivatives: arc("Derivatives"), integrals: arc("Integrals") },
	topics: {
		limit: { title: "Limits", arc: "limits" },
		continuity: { title: "Continuity", needs: ["limit"], arc: "limits" },
		derivative: { title: "The derivative", needs: ["limit"], arc: "derivatives" },
		"chain-rule": { title: "Chain rule", needs: ["derivative"], arc: "derivatives" },
		riemann: { title: "Riemann sums", needs: ["limit"], arc: "integrals" },
		ftc: { title: "Fundamental theorem", needs: ["riemann", "derivative"], arc: "integrals" },
	},
	path: { arcs: ["limits", "derivatives", "integrals"], order: ["limit", "continuity", "derivative", "chain-rule", "riemann", "ftc"], current: "continuity" },
	arc_log: [{ day: "2026-11-20", kind: "formed", reason: "the book's chapters" }],
};

describe("the course as a re-cut reads it", () => {
	const plan = recutPlan(RECORD, ["limits"])!;

	it("keeps the held arcs and their topics out, with no arcs left and no place", () => {
		assert.deepEqual(plan.held, ["limits"]);
		assert.deepEqual(plan.replaced, ["derivatives", "integrals"]);
		const view = presented(RECORD, plan) as { topics: Record<string, { arc?: string; needs?: string[] }>; arcs: object; path: { order: string[]; current?: string; arcs?: string[] } };
		assert.deepEqual(Object.keys(view.topics).sort(), ["chain-rule", "derivative", "ftc", "riemann"]);
		assert.deepEqual(view.arcs, {});
		assert.ok(Object.values(view.topics).every((t) => t.arc === undefined));
		assert.deepEqual(view.topics.derivative!.needs, [], "a need into a held topic is met before the re-cut arcs");
		assert.deepEqual(view.topics.ftc!.needs, ["riemann", "derivative"]);
		assert.deepEqual(view.path.order, ["derivative", "chain-rule", "riemann", "ftc"]);
		assert.equal(view.path.current, undefined);
		assert.equal(view.path.arcs, undefined);
		assert.deepEqual(presentedStanding({ studied: ["continuity", "limit"], held: ["limits"] }, plan).studied, []);
	});

	it("nothing to re-cut when every arc is held", () => {
		assert.equal(recutPlan(RECORD, ["limits", "derivatives", "integrals"]), null);
	});

	it("a save lands on the whole record: held arcs lead, needs into held topics stay, replaced arcs leave, a clashing handle is renamed", () => {
		const cut = {
			arcs: { limits: arc("Rates of change"), integration: arc("Integration") },
			topics: { derivative: { arc: "limits", needs: [] }, "chain-rule": { arc: "limits" }, riemann: { arc: "integration" }, ftc: { arc: "integration" } },
			path: { arcs: ["limits", "integration"], order: ["derivative", "chain-rule", "riemann", "ftc"], basis: "chapters" },
			arc_change: { reason: "a new unit" },
		};
		const whole = onRecord(cut, RECORD, plan) as { arcs: Record<string, unknown>; topics: Record<string, { arc?: string; needs?: string[] }>; path: { arcs: string[]; order: string[] } };
		assert.deepEqual(Object.keys(whole.arcs).sort(), ["derivatives", "integrals", "integration", "limits-2"]);
		assert.equal(whole.arcs.derivatives, null);
		assert.equal(whole.arcs.integrals, null);
		assert.equal(whole.topics.derivative!.arc, "limits-2");
		assert.deepEqual(whole.topics.derivative!.needs, ["limit"]);
		assert.deepEqual(whole.path.arcs, ["limits", "limits-2", "integration"]);
		assert.deepEqual(whole.path.order, ["limit", "continuity", "derivative", "chain-rule", "riemann", "ftc"]);
	});

	it("reads the new units and added arcs after the ones it has read, or since the arcs formed", () => {
		const log = { arc_log: [{ kind: "added", arc: "old" }, { kind: "formed" }, { kind: "unit", topics: ["a", "b"] }, { kind: "note" }, { kind: "added", arc: "maps" }] };
		assert.equal(newUnits(log).length, 2, "everything since the formation, not the arc added before it");
		assert.equal(newUnits(log, 3).length, 1);
		assert.equal(newUnits(log, 5).length, 0);
	});
});

describe("a re-cut's save on the real engine", { skip: realEngineMissing(LEARNING_ENGINE.python) }, () => {
	it("is taken: his arc and place stay, the arcs not begun are replaced", async () => {
		const dir = path.join(TMP, "calculus");
		fs.mkdirSync(dir, { recursive: true });
		const engine = (args: string[], input?: unknown) =>
			JSON.parse(execFileSync(LEARNING_ENGINE.python, ["-m", "learning", "--workspace", dir, ...args], { cwd: LEARNING_ENGINE.root, env: { ...process.env, PYTHONPATH: LEARNING_ENGINE.root }, input: input === undefined ? undefined : JSON.stringify(input) }).toString());
		engine(["init"]);
		const { arc_log: _log, path: { current: _current, ...route }, ...rest } = RECORD;
		engine(["save"], { ...rest, path: route, arc_change: { reason: "the book's chapters" } });
		engine(["save"], { path: { current: "continuity" } });
		const before = engine(["show", "--all"]);
		const standing = engine(["arcs"]);
		assert.deepEqual(standing.held, ["limits"], "his place holds its arc");
		const plan = recutPlan(before, standing.held)!;
		const records = recutRecords(stores.courseRecords, dir, plan);
		const shown = await records.run(dir, { verb: "show", handles: "all" });
		assert.ok(shown.ok && Object.keys((shown.json as { arcs: object }).arcs).length === 0, "the pass sees a course with no arcs");
		const saved = await records.run(dir, {
			verb: "save",
			changes: {
				arcs: { differentiation: arc("Differentiation"), integration: arc("Integration") },
				topics: { derivative: { arc: "differentiation" }, "chain-rule": { arc: "differentiation" }, riemann: { arc: "integration" }, ftc: { arc: "integration" } },
				path: { arcs: ["differentiation", "integration"], order: ["derivative", "chain-rule", "riemann", "ftc"], basis: "chapters" },
				arc_change: { reason: "re-cut of the arcs not begun, around a new unit" },
			},
		});
		assert.ok(saved.ok, saved.ok ? "" : saved.message);
		const now = engine(["show", "--all"]);
		assert.deepEqual(now.path.arcs, ["limits", "differentiation", "integration"]);
		assert.deepEqual(Object.keys(now.arcs).sort(), ["differentiation", "integration", "limits"]);
		assert.equal(now.topics.continuity.arc, "limits");
		assert.equal(now.path.current, "continuity");
		assert.deepEqual(now.topics.derivative.needs, ["limit"]);
	});
});
