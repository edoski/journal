/**
 * The course page's read of where he stands for the exam and what is left
 * to fix: the engine's `standing`, parsed here, so the page gets only the
 * contract (core/contracts/course-standing.ts).
 */

import type { ArcHandle } from "../core/contracts/course-arcs.ts";
import type { TopicHandle } from "../core/contracts/course-map.ts";
import type { CourseReadiness, CourseStanding, CourseStandingResponse, MistakeAnswer, OpenMistake, ReadinessPart } from "../core/contracts/course-standing.ts";
import { listCourses } from "./courses.ts";
import { stores } from "./stores.ts";

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

const handles = (value: unknown): TopicHandle[] => (Array.isArray(value) ? value.filter((v): v is TopicHandle => typeof v === "string" && v.length > 0) : []);

function partOf(entry: unknown): ReadinessPart | null {
	const p = record(entry);
	if (!p) return null;
	const arc = str(p.arc);
	return {
		...(arc ? { arc: arc as ArcHandle } : {}),
		solid: handles(p.solid),
		notYet: handles(p.not_yet),
		toStart: handles(p.to_start),
		wontFit: handles(p.wont_fit),
	};
}

function readinessOf(value: unknown): CourseReadiness | null {
	const r = record(value);
	const date = str(r?.date);
	if (!r || !date || typeof r.days_left !== "number" || !Array.isArray(r.parts)) return null;
	return { date, daysLeft: r.days_left, parts: r.parts.flatMap((p) => partOf(p) ?? []) };
}

/** What an answer was on: the task, then each place in his material. */
function onOf(a: Record<string, unknown>): string | null {
	const places = (Array.isArray(a.where) ? a.where : []).flatMap((entry) => {
		const w = record(entry);
		const source = str(w?.source);
		if (!w || !source) return [];
		const locator = str(w.locator);
		return [locator ? `${locator}, ${source}` : source];
	});
	const said = [str(a.task), ...places].filter((s): s is string => s !== null);
	return said.length > 0 ? [...new Set(said)].join("; ") : null;
}

function answerOf(entry: unknown): MistakeAnswer | null {
	const a = record(entry);
	const id = str(a?.id);
	const date = str(a?.date);
	const text = str(a?.text);
	if (!a || !id || !date || !text || (a.result !== "incorrect" && a.result !== "partial")) return null;
	const chose = str(a.chose);
	return {
		id,
		date,
		text,
		response: str(a.response),
		result: a.result,
		helped: a.helped === true,
		confident: a.confident === true,
		chose: chose as TopicHandle | null,
		on: onOf(a),
	};
}

function mistakeOf(entry: unknown): OpenMistake | null {
	const m = record(entry);
	const topic = str(m?.topic);
	if (!m || !topic) return null;
	const answers = (Array.isArray(m.answers) ? m.answers : []).flatMap((a) => answerOf(a) ?? []);
	const gap = str(m.gap);
	if (!gap && answers.length === 0) return null;
	return { topic: topic as TopicHandle, gap, latest: str(m.latest), answers };
}

/** The engine's `standing` output as the contract; null when it is not
 *  one. An entry the contract cannot hold is left out. Pure. */
export function courseStandingOf(json: unknown): CourseStanding | null {
	const s = record(json);
	if (!s || !Array.isArray(s.mistakes)) return null;
	return { readiness: readinessOf(s.readiness), mistakes: s.mistakes.flatMap((m) => mistakeOf(m) ?? []) };
}

/** GET /api/course-standing's answer. Only a course the engine lists is
 *  read; an engine failure answers with no standing. */
export async function courseStandingRead(workspace: string): Promise<{ status: 200 | 404; body: CourseStandingResponse }> {
	const unknown = { status: 404 as const, body: { ok: false as const, code: "unknown_course" as const, error: "No registered course has this folder" } };
	// A folder the registry names runs its standing beside the listing, not
	// after it: each is the engine replaying every course (round 15, P7).
	const registered = stores.courseRecords.registered?.();
	if (registered && !registered.includes(workspace)) return unknown;
	const standing = registered ? stores.courseRecords.run(workspace, { verb: "standing" }) : null;
	const listing = await listCourses();
	if (!listing.available || !listing.courses.some((c) => c.workspace === workspace)) return unknown;
	const result = await (standing ?? stores.courseRecords.run(workspace, { verb: "standing" }));
	return { status: 200, body: { ok: true, standing: result.ok ? courseStandingOf(result.json) : null } };
}
