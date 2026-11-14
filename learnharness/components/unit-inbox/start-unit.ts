"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter, type SessionCreation } from "@/components/start-session";
import type { Unit } from "@/components/unit-inbox/units";

/** The row action that starts a session on a unit, worded as the course map's. */
export const STUDY_WORDS = "Study";

/** Starts a session on a unit in its course, opened on the topic's title as
 *  the course map's Study this does, so the tutor routes it: a due review
 *  is tried first. The session is linked to the topic from its first turn.
 *  When the session cannot start (no models set up), the composer opens
 *  instead. */
export function useStartUnit(): { start: (unit: Unit) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(unit: Unit) => {
			if (starting) return;
			setStarting(unit.key);
			starter.current
				.start({ title: unit.topic.title, course: { workspace: unit.course.workspace }, topics: [unit.topic.handle] }, fetch)
				.then((href) => router.push(href))
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting],
	);
	return { start, starting };
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
 *  and opens it; when it cannot start (no models set up), the composer
 *  opens instead. `starting` is the arc whose check is starting. */
export function useStartArcCheck(): { startArcCheck: (workspace: string, arc: { handle: string; title: string }, topics: readonly string[]) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const startArcCheck = useCallback(
		(workspace: string, arc: { handle: string; title: string }, topics: readonly string[]) => {
			if (starting) return;
			setStarting(arc.handle);
			starter.current
				.start(arcCheckCreation(workspace, arc, topics), fetch)
				.then((href) => router.push(href))
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting],
	);
	return { startArcCheck, starting };
}
