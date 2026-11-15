"use client";

import { useEffect, useState } from "react";
import type { CourseStanding, CourseStandingResponse } from "@/src/core";
import { useServerEvent } from "@/components/server-events";

/** Where he stands for the exam and what is left to fix, as read: still
 *  reading, or read (`standing` null when the engine cannot say). */
export type StandingRead = { status: "reading" } | { status: "read"; standing: CourseStanding | null };

const READING: StandingRead = { status: "reading" };

/**
 * GET /api/course-standing for one course. The course frame reads it beside
 * the course and draws the head once both are in, so the readiness line and
 * Mistakes come with the page instead of pushing it down after (round 8: 2
 * m7, 1 D14). The first read of a course always settles, a failure as null,
 * so the page never waits on it; it is read again when a turn settles or
 * the course record changes, and a later failed read keeps the last good one.
 */
export function useCourseStanding(workspace: string): StandingRead {
	const [read, setRead] = useState<{ workspace: string; standing: CourseStanding | null } | null>(null);
	const [attempt, setAttempt] = useState(0);
	useServerEvent("turn-settled", () => setAttempt((n) => n + 1));
	useServerEvent("record-changed", () => setAttempt((n) => n + 1));
	useServerEvent("course-changed", (p) => p.workspace === workspace && setAttempt((n) => n + 1));
	useEffect(() => {
		let live = true;
		const settle = (standing: CourseStanding | null) => {
			if (live) setRead((was) => (standing || was?.workspace !== workspace ? { workspace, standing } : was));
		};
		void fetch(`/api/course-standing?${new URLSearchParams({ workspace })}`, { cache: "no-store" })
			.then((r) => r.json() as Promise<CourseStandingResponse>)
			.then((body) => settle(body.ok ? body.standing : null))
			.catch(() => settle(null));
		return () => {
			live = false;
		};
	}, [workspace, attempt]);
	return read?.workspace === workspace ? { status: "read", standing: read.standing } : READING;
}
