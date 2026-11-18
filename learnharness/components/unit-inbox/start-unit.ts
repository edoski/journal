"use client";

import type { SessionCreation } from "@/components/start-session";
import type { Unit } from "@/components/unit-inbox/units";
import { topicOpening, type ChatListItem, type CourseMap, type CourseMapTopic } from "@/src/core";
import { topicAction } from "@/components/unit-inbox/topic-page/topic-facts";
import { examGapAsk, pressWord, type PressWord } from "@/components/study-words";

/** The session a start on one topic creates, linked to the topic from its
 *  first turn: its review when memory asks for it by `today`, else a
 *  lesson on its title, as the topic page's Study opens it
 *  (`topicOpening`). */
export function topicCreation(workspace: string, topic: Pick<Unit["topic"], "title" | "handle" | "review">, today: string): SessionCreation {
	return { title: topicOpening(topic, today), course: { workspace }, topics: [topic.handle] };
}

/** A press on a topic from any surface, as its topic page's action
 *  (`topicAction`) takes it: the session to open (`resume`), else what to
 *  start, an open task continued as the page continues it, else a session
 *  on the topic. `continues` when it picks up a session or a task he began,
 *  so the press reads Continue, never Start; `word` its one word (`pressWord`) (round 12, 1 D5: the course
 *  head's "Start Poisson distribution" opened a second chat for the lesson
 *  he had begun). Pure. */
export function topicPress(topic: CourseMapTopic, map: CourseMap, chats: readonly ChatListItem[]): { resume: ChatListItem | null; creation: SessionCreation; continues: boolean; word: PressWord } {
	const action = topicAction(topic, map, chats);
	const creation = topicCreation(map.workspace, topic, map.today);
	const continues = action.kind === "resume" || action.kind === "open" || action.kind === "continue";
	const word = pressWord(action.kind);
	if ("chat" in action) return { resume: action.chat, creation, continues, word };
	if (action.kind !== "continue") return { resume: null, creation, continues, word };
	return { resume: null, creation: { title: action.opening, course: { workspace: map.workspace }, topics: [topic.handle], ...(action.from ? { resume: { from: action.from } } : {}) }, continues, word };
}

/** The name of the session Ask the tutor opens from a course head that
 *  warns of topics with no room before the exam. */
export const EXAM_GAP_NAME = "Fitting the exam's topics in";

/** The session Ask the tutor opens from such a head: his question as its
 *  opening, under a short name of its own, never the question (round 11,
 *  1 N14: the breadcrumb read "My exam plan has no room for Geometric
 *  distribution, Expectation and…"). It is opened on no topic: the topics
 *  his question names are words, and the session belongs to those its
 *  work is on (round 16, M3: filed under Geometric, Poisson and Variance,
 *  it made each read "Left off today"). Pure. */
export function examGapAskCreation(workspace: string, titles: readonly string[]): SessionCreation {
	return { title: examGapAsk(titles), name: EXAM_GAP_NAME, course: { workspace } };
}

/** The session a Check it press creates (spec: course-page.md, "Arcs"):
 *  practice on the arc's live topics, opened on the arc's name, carrying
 *  the arc so the course brief adds its check (`arcCheck`). Pure. */
export function arcCheckCreation(workspace: string, arc: { handle: string; title: string }, topics: readonly string[]): SessionCreation {
	return { title: arcCheckWords(arc.title), kind: "practice", course: { workspace }, topics: [...topics], arcCheck: arc.handle };
}

/** A Check it session's opening and its name: "Vector spaces check". */
export function arcCheckWords(arcTitle: string): string {
	return `${arcTitle} check`;
}
