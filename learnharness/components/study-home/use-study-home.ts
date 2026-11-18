"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatListItem, StudyCourse, StudyListing, UnreadableCourse } from "@/src/core";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { useDayChange } from "@/components/day-change";
import { openSessions, withLessonHere } from "@/components/study-home/study-facts";

/** The home's data: every course's map with its run-up, the sessions to
 *  pick up, and every session (newest first), which a course's line picks
 *  up from. `readAt` is when the courses' read began: a session that
 *  settled since is newer than what the courses say (`needsYouNow`). */
export type StudyHomeState =
	| { status: "loading" }
	| { status: "unavailable"; reason: string }
	| { status: "failed" }
	| { status: "ready"; courses: StudyCourse[]; failed: UnreadableCourse[]; open: ChatListItem[]; chats: ChatListItem[]; readAt?: string };

type Ready = Extract<StudyHomeState, { status: "ready" }>;

/** The sessions, every one; [] when they cannot be read, since the courses
 *  still show without them. */
const readChats = (): Promise<ChatListItem[]> =>
	fetch("/api/chats", { cache: "no-store" })
		.then((r) => r.json() as Promise<{ chats: ChatListItem[] }>)
		.then((d) => d.chats)
		.catch(() => [] as ChatListItem[]);

/** The courses as the engine reads them, and when the read began. */
async function readStudy(): Promise<{ study: StudyListing; readAt: string }> {
	const readAt = new Date().toISOString();
	const study = await fetch("/api/study", { cache: "no-store" }).then((r) => r.json() as Promise<StudyListing>);
	return { study, readAt };
}

/** Home from its two reads. Pure. */
function ready(courses: readonly StudyCourse[], failed: UnreadableCourse[], chats: ChatListItem[], readAt: string): Ready {
	return { status: "ready", courses: withLessonHere(courses, chats), failed, open: openSessions(chats), chats, readAt };
}

/** The last Home this window read, so a visit shows it while the visit's
 *  own read is under way (round 12, 1 m8: Home sat on "Reading your
 *  courses…" for over a minute after a close, while the engine was busy
 *  with the lesson's background work). The courses are kept as read,
 *  before `withLessonHere`, so fresh sessions place "You are here" again. */
let lastRead: { courses: StudyCourse[]; failed: UnreadableCourse[]; chats: ChatListItem[]; readAt: string } | null = null;

/** Forgets the last read Home (tests). */
export function forgetStudyHome(): void {
	lastRead = null;
}

/** Reads begun, and the newest whose sessions and whose courses landed,
 *  so a slow older read never replaces a newer one. */
let reads = 0;
let chatsFrom = 0;
let studyFrom = 0;

/** One read of Home: the sessions and the courses each land as soon as
 *  they come, so the session list, which reads in milliseconds, never
 *  waits on the engine (round 13, 3 N3: back on Home mid-lesson, Today
 *  lacked the live lesson while the courses' read held both; 1 n1: after a
 *  close the finished lesson's line stayed for 15 s). A first read shows
 *  the courses with their sessions; a failed courses' read keeps the
 *  courses shown. */
function readHome(apply: (next: StudyHomeState) => void): void {
	const n = ++reads;
	let sessions: ChatListItem[] | null = null;
	let courses: { study: Extract<StudyListing, { available: true }>; readAt: string } | null = null;
	const show = (read: NonNullable<typeof lastRead>) => {
		lastRead = read;
		apply(ready(read.courses, read.failed, read.chats, read.readAt));
	};
	void readChats().then((chats) => {
		if (n < chatsFrom) return;
		chatsFrom = n;
		sessions = chats;
		if (lastRead) show({ ...lastRead, chats });
		else if (courses) show({ courses: courses.study.courses, failed: courses.study.failed, chats, readAt: courses.readAt });
	});
	void readStudy()
		.then(({ study, readAt }) => {
			if (n < studyFrom) return;
			studyFrom = n;
			if (!study.available) {
				apply({ status: "unavailable", reason: study.reason });
				return;
			}
			courses = { study, readAt };
			const chats = sessions ?? lastRead?.chats;
			if (chats) show({ courses: study.courses, failed: study.failed, chats, readAt });
		})
		.catch(() => {
			if (!lastRead) apply({ status: "failed" });
		});
}

/** Reads the home on each visit, showing the last one read until the
 *  visit's read lands, and again whenever a turn starts or
 *  settles, a record, a course record or the session list changes, the day
 *  turns over, or the server comes back, so a line follows its session while the tutor writes and after;
 *  a failed reread keeps what is shown. `retry` reads it again from the
 *  start. */
export function useStudyHome(): { state: StudyHomeState; retry: () => void } {
	const [state, setState] = useState<StudyHomeState>(() => (lastRead ? ready(lastRead.courses, lastRead.failed, lastRead.chats, lastRead.readAt) : { status: "loading" }));
	const [attempt, setAttempt] = useState(0);
	const live = useRef(true);
	const apply = useCallback((next: StudyHomeState) => {
		if (live.current) setState((prev) => (next.status === "ready" || prev.status !== "ready" ? next : prev));
	}, []);
	useEffect(() => {
		live.current = true;
		readHome(apply);
		return () => {
			live.current = false;
		};
	}, [attempt, apply]);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const reread = useCallback(() => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => readHome(apply), 250);
	}, [apply]);
	useEffect(() => () => clearTimeout(timer.current), []);
	useServerEvent("turn-started", reread);
	useServerEvent("turn-settled", reread);
	useServerEvent("record-changed", reread);
	useServerEvent("chats-changed", reread);
	useServerEvent("course-changed", reread);
	useServerResync(reread);
	useDayChange(reread);
	const retry = useCallback(() => {
		setState({ status: "loading" });
		setAttempt((n) => n + 1);
	}, []);
	return { state, retry };
}
