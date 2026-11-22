/**
 * Re-cutting the arcs he has not begun, when what a course gained amounts to
 * a new unit (the engine's `unit` arc event: two or more new topics from a
 * chapter, module or file no arc holds). The grouping pass runs unchanged
 * (agent/subagents/arc-former.ts) on the course as this module presents it:
 * without the arcs he is in or has studied ("held", the engine's word) and
 * their topics, and with no arcs at all, so the pass cuts the rest as it
 * cuts a new course. Its saves are translated back onto the whole record:
 * the held arcs lead `path.arcs` and `path.order` as they were, every need
 * into a held topic is kept, and the arcs it replaced leave. The engine
 * allows each of these without his words (arcs.md, "Changing arcs"), and
 * refuses any that would touch a held arc. Pure.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

/** What a re-cut keeps, read once from the record and the engine's
 *  standing before the pass starts. */
export interface RecutPlan {
	/** The arcs he is in or has studied, in `path.arcs` order. */
	held: string[];
	/** Their topics. */
	kept: ReadonlySet<string>;
	/** The arcs the pass replaces. */
	replaced: string[];
}

/** The plan for a record with arcs and the engine's `held` arcs. Null when
 *  every arc is held, so nothing is left to re-cut. */
export function recutPlan(record: unknown, held: readonly string[]): RecutPlan | null {
	const r = obj(record);
	const order = strings(obj(r.path).arcs);
	const arcs = order.length > 0 ? order : Object.keys(obj(r.arcs));
	const keep = arcs.filter((a) => held.includes(a));
	const replaced = arcs.filter((a) => !held.includes(a));
	if (replaced.length === 0) return null;
	const kept = new Set(Object.entries(obj(r.topics)).flatMap(([k, t]) => (keep.includes(String(obj(t).arc)) ? [k] : [])));
	return { held: keep, kept, replaced };
}

/** The course as the pass reads it: the topics outside the held arcs, none
 *  in an arc, their needs and contrasts within them; no arcs; the path
 *  without the held topics and without his place, which is in a held arc;
 *  the exam's scope without arcs. Everything else as it is. */
export function presented(record: unknown, plan: RecutPlan): Json {
	const r = obj(record);
	const outside = (k: string) => !plan.kept.has(k);
	const topics = Object.fromEntries(
		Object.entries(obj(r.topics))
			.filter(([k]) => outside(k))
			.map(([k, t]) => {
				const { arc: _arc, ...rest } = obj(t);
				return [k, { ...rest, ...(Array.isArray(rest.needs) ? { needs: strings(rest.needs).filter(outside) } : {}), ...(Array.isArray(rest.contrasts) ? { contrasts: strings(rest.contrasts).filter(outside) } : {}) }];
			}),
	);
	const { arcs: _arcs, current: _current, ...path } = obj(r.path);
	const exam = r.exam === undefined ? {} : { exam: examWithout(obj(r.exam), outside) };
	return { ...r, topics, arcs: {}, path: { ...path, ...(Array.isArray(path.order) ? { order: strings(path.order).filter(outside) } : {}) }, ...exam };
}

function examWithout(exam: Json, outside: (k: string) => boolean): Json {
	const { arcs: _arcs, ...rest } = exam;
	return { ...rest, ...(Array.isArray(rest.leaves_out) ? { leaves_out: strings(rest.leaves_out).filter(outside) } : {}) };
}

/** The engine's `arcs` standing as the pass reads it: only what it was
 *  given studied, which outside the held arcs is nothing. */
export function presentedStanding(json: unknown, plan: RecutPlan): Json {
	const j = obj(json);
	return { ...j, studied: strings(j.studied).filter((t) => !plan.kept.has(t)) };
}

/**
 * A save of the pass, onto the whole record:
 * - a topic's `needs` (and `contrasts`) sent whole keep those into held
 *   topics, which the pass never saw;
 * - new arcs join after the held ones in `path.arcs`, and the arcs they
 *   replace leave (null);
 * - `path.order` is the held topics in their order, then the pass's;
 * - an exam scope it states follows the held arcs of the record's scope.
 */
export function onRecord(changes: unknown, record: unknown, plan: RecutPlan): Json {
	const c = obj(changes);
	const r = obj(record);
	const stored = obj(r.topics);
	const out: Json = { ...c };
	if (c.topics !== undefined) {
		out.topics = Object.fromEntries(
			Object.entries(obj(c.topics)).map(([k, t]) => {
				const patch = obj(t);
				const before = obj(stored[k]);
				const keptOf = (field: "needs" | "contrasts") => strings(before[field]).filter((n) => plan.kept.has(n));
				return [
					k,
					{
						...patch,
						...(Array.isArray(patch.needs) ? { needs: [...keptOf("needs"), ...strings(patch.needs)] } : {}),
						...(Array.isArray(patch.contrasts) ? { contrasts: [...keptOf("contrasts"), ...strings(patch.contrasts)] } : {}),
					},
				];
			}),
		);
	}
	if (c.arcs !== undefined) {
		// The pass never saw the held arcs, so it may name a new one as one of
		// them: that one takes a free handle, never the held arc's.
		const taken = new Set([...plan.held, ...Object.keys(obj(r.arcs)), ...Object.keys(stored)]);
		const renamed = new Map<string, string>();
		for (const handle of Object.keys(obj(c.arcs))) {
			if (!plan.held.includes(handle)) continue;
			let n = 2;
			while (taken.has(`${handle}-${n}`)) n++;
			renamed.set(handle, `${handle}-${n}`);
			taken.add(`${handle}-${n}`);
		}
		const h = (handle: string) => renamed.get(handle) ?? handle;
		const fresh = Object.fromEntries(Object.entries(obj(c.arcs)).map(([k, v]) => [h(k), v]));
		if (out.topics !== undefined) out.topics = Object.fromEntries(Object.entries(obj(out.topics)).map(([k, t]) => [k, typeof obj(t).arc === "string" ? { ...obj(t), arc: h(String(obj(t).arc)) } : t]));
		out.arcs = { ...fresh, ...Object.fromEntries(plan.replaced.filter((a) => !(a in fresh)).map((a) => [a, null])) };
		const path = obj(c.path);
		const order = strings(obj(r.path).order).filter((t) => plan.kept.has(t));
		const cut = strings(path.arcs).map(h);
		out.path = { ...path, arcs: [...plan.held, ...cut], order: [...order, ...strings(path.order).filter((t) => !plan.kept.has(t))] };
		const scope = strings(obj(r.exam).arcs);
		const stated = strings(obj(c.exam).arcs).map(h);
		if (scope.length > 0 || stated.length > 0) {
			const covered = scope.some((a) => plan.replaced.includes(a));
			out.exam = { ...obj(c.exam), arcs: [...scope.filter((a) => plan.held.includes(a)), ...(stated.length > 0 ? stated : covered ? cut : [])] };
		}
	}
	return out;
}
