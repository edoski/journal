"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionStarter } from "@/components/start-session";
import { CONTINUE_OPENING } from "@/components/start/course-facts";

/** Takes up a course's next step from the sidebar, as Home's line does: a
 *  new session in the course opened on Home's Continue, so the tutor takes
 *  today's mixed review first, then the open task, else the current topic.
 *  When the session cannot start (no models set up), the composer opens
 *  instead, as a topic's Study does. `starting` is the course being
 *  started. */
export function useContinueCourse(): { start: (workspace: string) => void; starting: string | null } {
	const router = useRouter();
	const starter = useRef(new SessionStarter());
	const [starting, setStarting] = useState<string | null>(null);
	const start = useCallback(
		(workspace: string) => {
			if (starting) return;
			setStarting(workspace);
			starter.current
				.start({ title: CONTINUE_OPENING, course: { workspace } }, fetch)
				.then((href) => router.push(href))
				.catch(() => router.push("/chat/new"))
				.finally(() => setStarting(null));
		},
		[router, starting],
	);
	return { start, starting };
}
