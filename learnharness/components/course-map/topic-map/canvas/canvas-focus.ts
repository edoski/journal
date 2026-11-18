/**
 * The canvas's focus (canvas.md, Focus): one topic, what it needs and what
 * it leads to, and the cards and lines that show them. Pure.
 */

import type { CourseMapEdge, TopicHandle } from "@/src/core";
import type { Route } from "../topic-map-layout";

export interface Focus {
	topic: TopicHandle;
	/** Its direct prerequisites, every one, drawn or implied. */
	needs: readonly TopicHandle[];
	/** The topics that directly need it. */
	leadsTo: readonly TopicHandle[];
	/** The topics the lit lines pass through between those and it, where the drawing leaves implied needs out. */
	via: ReadonlySet<TopicHandle>;
	/** The drawn lines that join it to its needs and to what it leads to, `prerequisite>topic`. */
	lines: ReadonlySet<string>;
}

export const lineKey = (prerequisite: TopicHandle, topic: TopicHandle) => `${prerequisite}>${topic}`;

/**
 * A topic's focus on a drawing: every need is lit, either as its own line
 * or, where the drawing leaves it out as implied, as the drawn chain from
 * the prerequisite down to the topic; the same for what it leads to.
 */
export function focusOf(topic: TopicHandle, edges: readonly CourseMapEdge[], routes: readonly Route[]): Focus {
	const needs = edges.flatMap((e) => (e.kind === "needs" && e.topic === topic ? [e.prerequisite] : []));
	const leadsTo = edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === topic ? [e.topic] : []));
	const drawn = routes.filter((r) => r.points.length > 0);
	const below = new Map<TopicHandle, TopicHandle[]>();
	for (const r of drawn) below.set(r.prerequisite, [...(below.get(r.prerequisite) ?? []), r.topic]);
	const reach = new Map<TopicHandle, Set<TopicHandle>>();
	/** Every topic a drawn chain leads to from `from`, itself included. */
	const from = (start: TopicHandle): Set<TopicHandle> => {
		const known = reach.get(start);
		if (known) return known;
		const found = new Set<TopicHandle>([start]);
		const stack = [start];
		while (stack.length) {
			for (const next of below.get(stack.pop()!) ?? []) {
				if (found.has(next)) continue;
				found.add(next);
				stack.push(next);
			}
		}
		reach.set(start, found);
		return found;
	};
	const lines = new Set<string>();
	const via = new Set<TopicHandle>();
	const chain = (top: TopicHandle, bottom: TopicHandle) => {
		for (const r of drawn) {
			if (!from(top).has(r.prerequisite) || !from(r.topic).has(bottom)) continue;
			lines.add(lineKey(r.prerequisite, r.topic));
			for (const t of [r.prerequisite, r.topic]) if (t !== top && t !== bottom) via.add(t);
		}
	};
	for (const n of needs) chain(n, topic);
	for (const l of leadsTo) chain(topic, l);
	for (const t of [topic, ...needs, ...leadsTo]) via.delete(t);
	return { topic, needs, leadsTo, via, lines };
}
