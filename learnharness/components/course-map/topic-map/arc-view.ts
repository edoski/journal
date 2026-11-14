import type { ArcHandle, CourseMap, TopicHandle } from "@/src/core";

/** What a map draws for one arc (spec: topic-map.md, Arcs): the course
 *  cut to the arc's topics and the topics it builds on from earlier arcs,
 *  with only the needs between them. */
export interface ArcView {
	/** The course with only the drawn topics and the needs between them. */
	map: CourseMap;
	/** Each drawn topic from an earlier arc, with that arc's title. */
	entry: ReadonlyMap<TopicHandle, string>;
}

/**
 * The drawing of `arc`: its topics whole, and its `entry` topics, each
 * captioned with the arc it comes from. A need between two entry topics is
 * left out, so every entry topic can sit in the top layer; so is a need on
 * an entry topic that a longer path in the drawing already carries (the
 * arc's own needs are kept whole), so an entry card does not pull a topic
 * away from the arc it builds on; and a need to a topic outside the drawing
 * is left out. The whole course when `arc` is undefined or not one of the
 * map's arcs. Pure.
 */
export function arcView(map: CourseMap, arc: ArcHandle | undefined): ArcView {
	const shown = arc ? map.arcs?.find((a) => a.handle === arc) : undefined;
	if (!shown) return { map, entry: new Map() };
	const titleOf = new Map((map.arcs ?? []).map((a) => [a.handle, a.title]));
	const entry = new Map<TopicHandle, string>();
	for (const handle of shown.entry) {
		const topic = map.topics.find((t) => t.handle === handle);
		if (topic && topic.arc !== arc) entry.set(handle, (topic.arc && titleOf.get(topic.arc)) ?? map.title);
	}
	const drawn = new Set(map.topics.filter((t) => t.arc === arc || entry.has(t.handle)).map((t) => t.handle));
	const inside = (h: TopicHandle) => drawn.has(h);
	const kept = map.edges.filter((e) =>
		e.kind === "needs" ? inside(e.prerequisite) && inside(e.topic) && !(entry.has(e.prerequisite) && entry.has(e.topic)) : inside(e.pair[0]) && inside(e.pair[1]),
	);
	const needs = kept.filter((e) => e.kind === "needs");
	/** Whether `to` reaches `from` by needs other than the one between them. */
	const carried = (from: TopicHandle, to: TopicHandle) => {
		const stack = needs.filter((e) => e.topic === to && e.prerequisite !== from).map((e) => e.prerequisite);
		const seen = new Set(stack);
		while (stack.length) {
			const at = stack.pop()!;
			if (at === from) return true;
			for (const e of needs) if (e.topic === at && !seen.has(e.prerequisite)) (seen.add(e.prerequisite), stack.push(e.prerequisite));
		}
		return false;
	};
	return {
		map: {
			...map,
			topics: map.topics.filter((t) => drawn.has(t.handle)),
			edges: kept.filter((e) => e.kind !== "needs" || !entry.has(e.prerequisite) || !carried(e.prerequisite, e.topic)),
		},
		entry,
	};
}

/** An entry topic's caption: the arc it comes from. */
export function entryCaption(arcTitle: string): string {
	return `From ${arcTitle}`;
}
