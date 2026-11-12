"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter } from "@/components/start-session";
import { useTopicStarts } from "@/components/unit-inbox/use-unit-inbox";
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
	const [, recordStart] = useTopicStarts();
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(unit: Unit) => {
			if (starting) return;
			setStarting(unit.key);
			starter.current
				.start({ title: unit.topic.title, course: { workspace: unit.course.workspace } }, fetch)
				.then((href) => {
					recordStart(href.slice("/chat/".length), unit.topic.handle);
					router.push(href);
				})
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting, recordStart],
	);
	return { start, starting };
}
