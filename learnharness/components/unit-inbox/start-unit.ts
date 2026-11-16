"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter, type SessionCreation } from "@/components/start-session";
import type { Unit } from "@/components/unit-inbox/units";
import { topicOpening, type ChatListItem, type CourseMap, type CourseMapTopic } from "@/src/core";
import { topicAction } from "@/components/unit-inbox/topic-page/topic-facts";
import { examGapAsk } from "@/components/study-words";

/** The row action that starts a session on a unit, worded as the course map's. */
export const STUDY_WORDS = "Study";

/** What a start needs of a unit: its key, its topic and its course. */
export type StartableUnit = Pick<Unit, "key"> & { topic: Pick<Unit["topic"], "title" | "handle" | "review">; course: Pick<Unit["course"], "workspace" | "today"> };

/** Starts a session (`creation`) and opens it; when it cannot start (no
 *  models set up), the composer opens instead. `starting` is the key of
 *  the start in flight; a press while one is in flight does nothing. */
export function useStartSession(): { start: (key: string, creation: SessionCreation) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(key: string, creation: SessionCreation) => {
			if (starting) return;
			setStarting(key);
			starter.current
				.start(creation, fetch)
				.then((href) => router.push(href))
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting],
	);
	return { start, starting };
}

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
 *  so the press reads Continue, never Start (round 12, 1 D5: the course
 *  head's "Start Poisson distribution" opened a second chat for the lesson
 *  he had begun). Pure. */
export function topicPress(topic: CourseMapTopic, map: CourseMap, chats: readonly ChatListItem[]): { resume: ChatListItem | null; creation: SessionCreation; continues: boolean } {
	const action = topicAction(topic, map, chats);
	const creation = topicCreation(map.workspace, topic, map.today);
	const continues = action.kind === "resume" || action.kind === "open" || action.kind === "continue";
	if ("chat" in action) return { resume: action.chat, creation, continues };
	if (action.kind !== "continue") return { resume: null, creation, continues };
	return { resume: null, creation: { title: action.opening, course: { workspace: map.workspace }, topics: [topic.handle], ...(action.from ? { resume: { from: action.from } } : {}) }, continues };
}

/** Starts a session on a unit in its course (`topicCreation`). */
export function useStartUnit(): { start: (unit: StartableUnit) => void; starting: string | null } {
	const { start, starting } = useStartSession();
	return { start: useCallback((unit: StartableUnit) => start(unit.key, topicCreation(unit.course.workspace, unit.topic, unit.course.today)), [start]), starting };
}

/** The name of the session Ask the tutor opens from a course head that
 *  warns of topics with no room before the exam. */
export const EXAM_GAP_NAME = "Fitting the exam's topics in";

/** The session Ask the tutor opens from such a head: his question as its
 *  opening, linked to the topics it names, under a short name of its own,
 *  never the question (round 11, 1 N14: the breadcrumb read "My exam plan
 *  has no room for Geometric distribution, Expectation and…"). Pure. */
export function examGapAskCreation(workspace: string, titles: readonly string[], topics: readonly string[]): SessionCreation {
	return { title: examGapAsk(titles), name: EXAM_GAP_NAME, course: { workspace }, topics: [...topics] };
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

/** Starts an arc's check (`startArcCheck`), as a press of Check it does,
 *  and opens it. `starting` is the arc whose check is starting. */
export function useStartArcCheck(): { startArcCheck: (workspace: string, arc: { handle: string; title: string }, topics: readonly string[]) => void; starting: string | null } {
	const { start, starting } = useStartSession();
	const startArcCheck = useCallback(
		(workspace: string, arc: { handle: string; title: string }, topics: readonly string[]) => start(arc.handle, arcCheckCreation(workspace, arc, topics)),
		[start],
	);
	return { startArcCheck, starting };
}
