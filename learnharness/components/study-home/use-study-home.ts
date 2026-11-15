"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatListItem, StudyCourse, StudyListing, UnreadableCourse } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { useDayChange } from "@/components/day-change";
import { openSessions, withLessonHere } from "@/components/study-home/study-facts";

/** The home's data: every course's map with its run-up, the sessions to
 *  pick up, and every session (newest first), which a course's line picks
 *  up from. */
export type StudyHomeState =
	| { status: "loading" }
	| { status: "unavailable"; reason: string }
	| { status: "failed" }
	| { status: "ready"; courses: StudyCourse[]; failed: UnreadableCourse[]; open: ChatListItem[]; chats: ChatListItem[] };

async function readHome(): Promise<StudyHomeState> {
	const [study, chats] = await Promise.all([
		fetch("/api/study", { cache: "no-store" }).then((r) => r.json() as Promise<StudyListing>),
		// The sessions are a bonus: the courses still show without them.
		fetch("/api/chats", { cache: "no-store" })
			.then((r) => r.json() as Promise<{ chats: ChatListItem[] }>)
			.then((d) => d.chats)
			.catch(() => [] as ChatListItem[]),
	]);
	if (!study.available) return { status: "unavailable", reason: study.reason };
	return { status: "ready", courses: withLessonHere(study.courses, chats), failed: study.failed, open: openSessions(chats), chats };
}

/** Reads the home on each visit and again whenever a turn starts or
 *  settles, a record, a course record or the session list changes, the day
 *  turns over, or the server comes back, so a line follows its session while the tutor writes and after;
 *  a failed reread keeps what is shown. `retry` reads it again from the
 *  start. */
export function useStudyHome(): { state: StudyHomeState; retry: () => void } {
	const [state, setState] = useState<StudyHomeState>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		void readHome()
			.then((next) => live.current && setState(next))
			.catch(() => live.current && setState({ status: "failed" }));
		return () => {
			live.current = false;
		};
	}, [attempt]);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const reread = useCallback(() => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			void readHome()
				.then((next) => live.current && setState((prev) => (next.status === "ready" || prev.status !== "ready" ? next : prev)))
				.catch(() => {});
		}, 250);
	}, []);
	useEffect(() => () => clearTimeout(timer.current), []);
	useServerEvent("turn-started", reread);
	useServerEvent("turn-settled", reread);
	useServerEvent("record-changed", reread);
	useServerEvent("chats-changed", reread);
	useServerEvent("compaction-changed", reread);
	useServerEvent("course-changed", reread);
	useServerResync(reread);
	useDayChange(reread);
	const retry = useCallback(() => {
		setState({ status: "loading" });
		setAttempt((n) => n + 1);
	}, []);
	return { state, retry };
}
