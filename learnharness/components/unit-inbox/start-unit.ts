"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter } from "@/components/start-session";
import type { Unit } from "@/components/unit-inbox/units";

/** The action that starts a session on a unit, worded as the course map's. */
export const STUDY_WORDS = "Study this";

/** Starts a session on a unit in its course, opened on the topic's title as
 *  the course map's Study this does, so the tutor routes it: a due review
 *  is tried first. When the session cannot start (no models set up), the
 *  composer opens instead. */
export function useStartUnit(): { start: (unit: Unit) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(unit: Unit) => {
			if (starting) return;
			setStarting(unit.key);
			starter.current
				.start({ title: unit.topic.title, course: { workspace: unit.course.workspace } }, fetch)
				.then((href) => router.push(href))
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting],
	);
	return { start, starting };
}
