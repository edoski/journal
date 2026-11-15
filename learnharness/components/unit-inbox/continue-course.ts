"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter } from "@/components/start-session";
import { CONTINUE_OPENING } from "@/components/start/course-facts";
import { stepWords, type NextStep } from "@/components/study-home/study-facts";

/** Takes up a course's line from the sidebar, as Home's line starts it: a
 *  new session in the course opened on the line's step ("Continue Problem
 *  sheet 4", on its topics), or with no step on Home's Continue, so the
 *  tutor takes today's mixed review first, then the open task, else the
 *  current topic. When the session cannot start (no models set up), the
 *  composer opens instead, as a topic's Study does. `starting` is the
 *  course being started. */
export function useContinueCourse(): { start: (workspace: string, step?: NextStep) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(workspace: string, step?: NextStep) => {
			if (starting) return;
			setStarting(workspace);
			const creation = step && step.kind !== "none" ? { title: stepWords(step), course: { workspace }, topics: step.topics } : { title: CONTINUE_OPENING, course: { workspace } };
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
