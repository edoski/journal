"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatListItem, StudyCourse, StudyListing } from "@/src/core";
import { waitingSessions } from "@/components/study-home/study-facts";

/** The home's data: every course's map with its run-up, and the sessions
 *  waiting on the learner. */
export type StudyHomeState =
	| { status: "loading" }
	| { status: "unavailable"; reason: string }
	| { status: "failed" }
	| { status: "ready"; courses: StudyCourse[]; failed: string[]; waiting: ChatListItem[] };

async function readHome(): Promise<StudyHomeState> {
	const [study, chats] = await Promise.all([
		fetch("/api/study", { cache: "no-store" }).then((r) => r.json() as Promise<StudyListing>),
		// The waiting sessions are a bonus: the courses still show without them.
		fetch("/api/chats", { cache: "no-store" })
			.then((r) => r.json() as Promise<{ chats: ChatListItem[] }>)
			.then((d) => d.chats)
			.catch(() => [] as ChatListItem[]),
	]);
	if (!study.available) return { status: "unavailable", reason: study.reason };
	return { status: "ready", courses: study.courses, failed: study.failed, waiting: waitingSessions(chats) };
}

/** Reads the home once per visit; `retry` reads it again. */
export function useStudyHome(): { state: StudyHomeState; retry: () => void } {
	const [state, setState] = useState<StudyHomeState>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		let live = true;
		void readHome()
			.then((next) => live && setState(next))
			.catch(() => live && setState({ status: "failed" }));
		return () => {
			live = false;
		};
	}, [attempt]);
	const retry = useCallback(() => {
		setState({ status: "loading" });
		setAttempt((n) => n + 1);
	}, []);
	return { state, retry };
}
