"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter, type SessionCreation } from "@/components/start-session";
import type { Unit } from "@/components/unit-inbox/units";
import { topicOpening } from "@/src/core";

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

/** Starts a session on a unit in its course (`topicCreation`). */
export function useStartUnit(): { start: (unit: StartableUnit) => void; starting: string | null } {
	const { start, starting } = useStartSession();
	return { start: useCallback((unit: StartableUnit) => start(unit.key, topicCreation(unit.course.workspace, unit.topic, unit.course.today)), [start]), starting };
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
