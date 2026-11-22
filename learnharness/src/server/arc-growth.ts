/**
 * Arcs that grow with the course. New material, or a topic a tutor adds,
 * joins the arcs at once by the engine's placement rules (arcs.md, "Placing
 * a new topic"). When what was added amounts to a new unit, the engine logs
 * a `unit` arc event (two or more new topics from a chapter, module or file
 * no arc holds), and this module re-cuts the arcs he has not begun around
 * it, in the background, with the grouping pass itself
 * (agent/subagents/arc-former.ts) on the course as core/arc-recut.ts
 * presents it: the arcs he is in or has studied, and his place, stay.
 *
 * Every start is an event: a map build of the course ended (its saves are
 * in), or a lesson's turn settled (the tutor may have added topics). Only a
 * course the app set up has a pass ledger and grows this way; one made
 * elsewhere keeps the arcs he approved until he asks.
 */

import { createArcPass } from "../agent/subagents/arc-former.ts";
import { mapRuns } from "../agent/subagents/course-map-builder.ts";
import { finishRun, setRunPhase } from "../agent/subagents/background-runs.ts";
import { claudeEngine } from "../agent/models.ts";
import { onRecord, presented, presentedStanding, recutPlan, type RecutPlan } from "../core/arc-recut.ts";
import { recordHasArcs, type CourseVerb } from "../core/contracts/course.ts";
import { openLessonsOf } from "../core/course-map-build.ts";
import type { CourseRecords } from "../core/ports.ts";
import { emit } from "../core/events.ts";
import { effectiveSettings, stores } from "./stores.ts";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});

/** What the course's arc log gained since `from` that amounts to a new
 *  unit: the engine's `unit` events (topics it placed from a unit no arc
 *  holds), and arcs a map build or a tutor added for one. Without `from`,
 *  everything since the arcs formed. Pure. */
export function newUnits(record: unknown, from?: number): Json[] {
	const log = (Array.isArray(obj(record).arc_log) ? (obj(record).arc_log as unknown[]) : []).map(obj);
	const start = from ?? log.findLastIndex((e) => e.kind === "formed") + 1;
	return log.slice(start).filter((e) => e.kind === "unit" || e.kind === "added");
}

/** The course records as the re-cut's pass reads and writes them. */
export function recutRecords(records: CourseRecords, workspace: string, plan: RecutPlan): CourseRecords {
	const whole = async () => {
		const shown = await records.run(workspace, { verb: "show", handles: "all" });
		if (!shown.ok) throw new Error(`course record: ${shown.message}`);
		return shown.json;
	};
	return {
		...records,
		async run(at: string, verb: CourseVerb) {
			if (at !== workspace) return records.run(at, verb);
			if (verb.verb === "show" && verb.handles === "all") {
				const shown = await records.run(at, verb);
				return shown.ok ? { ok: true, json: presented(shown.json, plan) } : shown;
			}
			if (verb.verb === "arcs") {
				const standing = await records.run(at, verb);
				return standing.ok ? { ok: true, json: presentedStanding(standing.json, plan) } : standing;
			}
			if (verb.verb === "save" || verb.verb === "check") return records.run(at, { verb: verb.verb, changes: onRecord(verb.changes, await whole(), plan) });
			return records.run(at, verb);
		},
	};
}

/** A build of the course ended, or a lesson of it settled: re-cut its
 *  arcs not begun when its record gained a new unit since the last look.
 *  While a build holds the course it waits: the build's end calls again.
 *  Resolves when that re-cut, if any, has ended. */
export async function growArcs(workspace: string): Promise<void> {
	const R = mapRuns();
	if (!stores.arcPassLedgers.get(workspace) || R.inFlight.has(workspace) || R.rerun.has(workspace)) return;
	// Held from the first read, so no build starts on the course meanwhile.
	R.inFlight.add(workspace);
	const key = `${workspace}#arc-recut`;
	let running = false;
	try {
		await recut(workspace, () => {
			running = true;
			return key;
		});
	} catch (err) {
		console.error(`[arc-growth ${workspace}] failed:`, err);
	} finally {
		if (running) finishRun(key);
		R.inFlight.delete(workspace);
		if (R.rerun.delete(workspace)) void import("./course-map.ts").then((m) => m.startCourseMap(workspace));
	}
}

const logLength = (record: unknown) => (Array.isArray(obj(record).arc_log) ? (obj(record).arc_log as unknown[]).length : 0);

async function recut(workspace: string, started: () => string): Promise<void> {
	const ledger = stores.arcPassLedgers.get(workspace);
	if (!ledger) return;
	const shown = await stores.courseRecords.run(workspace, { verb: "show", handles: "all" });
	if (!shown.ok || !recordHasArcs(shown.json)) return;
	const seen = ledger.grown;
	const logged = logLength(shown.json);
	// A re-cut that failed or was stopped is not tried again until the log grows.
	if (ledger.recutFailed === logged) return;
	const units = newUnits(shown.json, seen);
	// A course deleted meanwhile has no ledger to write back.
	const note = (fields: { grown?: number; recutFailed?: number }) => {
		const now = stores.arcPassLedgers.get(workspace);
		if (now) stores.arcPassLedgers.save(workspace, { ...now, ...fields });
	};
	const done = (grown: number) => note({ grown });
	if (units.length === 0) {
		if (logged !== seen) done(logged);
		return;
	}
	// His open lessons hold their arcs too (the engine's `held`).
	const lessons = openLessonsOf(stores.chatStore.listChats(), workspace, shown.json);
	const standing = await stores.courseRecords.run(workspace, { verb: "arcs", here: lessons.here, open: lessons.topics });
	const held = standing.ok && Array.isArray(obj(standing.json).held) ? (obj(standing.json).held as string[]) : null;
	if (!held) return;
	const plan = recutPlan(shown.json, held);
	// Every arc is begun: the new topics stay where the engine placed them.
	if (!plan) return done(logged);
	const title = typeof obj(shown.json).title === "string" ? (obj(shown.json).title as string) : workspace;
	const why = units.map((u) => (u.kind === "unit" ? String(u.reason ?? "") : `a new arc ${String(u.arc ?? "")}`)).filter(Boolean).join("; ");
	const signal = setRunPhase(started(), "grouping", "arc-pass", title).controller.signal;
	const pass = createArcPass({
		courseRecords: recutRecords(stores.courseRecords, workspace, plan),
		ledgers: stores.arcPassLedgers,
		engineFor: () => {
			try {
				return claudeEngine(effectiveSettings().claude.account);
			} catch {
				return undefined;
			}
		},
		sessions: () => stores.chatStore.listChats(),
		onSaved: () => emit("courses-changed", {}),
	});
	const result = await pass.run(workspace, { edges: "apply", signal, reason: `re-cut of the arcs not begun, around a new unit (${why})` }).catch((err: unknown) => {
		note({ recutFailed: logged });
		throw err;
	});
	console.info(`[arc-growth ${workspace}] ${result.status}: ${result.status === "formed" ? result.summary : result.reason}`);
	// A failed re-cut (a usage limit, a refusal) waits for the log to grow.
	if (result.status === "failed") return note({ recutFailed: logged });
	const after = await stores.courseRecords.run(workspace, { verb: "show", handles: "all" });
	done(after.ok ? logLength(after.json) : logged);
}
