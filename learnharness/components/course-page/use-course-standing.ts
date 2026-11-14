"use client";

import { useEffect, useState } from "react";
import type { CourseStanding, CourseStandingResponse } from "@/src/core";
import { useServerEvent } from "@/components/server-events";

/**
 * Where he stands for the exam and what is left to fix (GET
 * /api/course-standing): null until read and while the engine cannot say.
 * Read again when a turn settles or the course record changes; a failed
 * read keeps the last good one.
 */
export function useCourseStanding(workspace: string): CourseStanding | null {
	const [read, setRead] = useState<{ workspace: string; standing: CourseStanding } | null>(null);
	const [attempt, setAttempt] = useState(0);
	useServerEvent("turn-settled", () => setAttempt((n) => n + 1));
	useServerEvent("record-changed", () => setAttempt((n) => n + 1));
	useServerEvent("course-changed", (p) => p.workspace === workspace && setAttempt((n) => n + 1));
	useEffect(() => {
		let live = true;
		void fetch(`/api/course-standing?${new URLSearchParams({ workspace })}`, { cache: "no-store" })
			.then((r) => r.json() as Promise<CourseStandingResponse>)
			.then((body) => {
				if (live && body.ok && body.standing) setRead({ workspace, standing: body.standing });
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, [workspace, attempt]);
	return read?.workspace === workspace ? read.standing : null;
}
