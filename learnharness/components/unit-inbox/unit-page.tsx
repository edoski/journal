"use client";

import { useEffect, useState } from "react";
import type { ChatListItem, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { useDayChange } from "@/components/day-change";
import { TopicPage } from "@/components/unit-inbox/topic-page/topic-page";
import { PageNotice, PageReading } from "@/components/page-frame/page-frame";
import { WindowPage } from "@/components/page-frame/window-page";
import { CoursesUnavailable } from "@/components/course-picker";
import { withLessonHere } from "@/components/study-home/study-facts";

type Read = { status: "loading" } | { status: "unavailable"; reason: string } | { status: "missing" } | { status: "ready"; course: StudyCourse; courses: StudyCourse[]; chats: ChatListItem[] };

/** The topic's course, every course and every session, read again when a turn settles,
 *  the list changes, the course record changes or the day turns over. A
 *  failed read keeps the last one. "You are here" is placed as Home and
 *  the sidebar place it (`withLessonHere`), so every surface puts it on
 *  one topic (round 14, m6: topic maps said Random variables while Home
 *  and the course page said Poisson). */
export function useUnitRead(workspace: string): Read {
	const [read, setRead] = useState<Read>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	useServerEvent("turn-settled", () => setAttempt((n) => n + 1));
	useServerEvent("chats-changed", () => setAttempt((n) => n + 1));
	useServerEvent("course-changed", (p) => p.workspace === workspace && setAttempt((n) => n + 1));
	useDayChange(() => setAttempt((n) => n + 1));
	useEffect(() => {
		let live = true;
		void Promise.all([
			fetch("/api/study", { cache: "no-store" }).then((r) => r.json() as Promise<StudyListing>),
			fetch("/api/chats", { cache: "no-store" }).then((r) => r.json() as Promise<{ chats: ChatListItem[] }>),
		])
			.then(([study, { chats }]) => {
				if (!live) return;
				if (!study.available) return setRead({ status: "unavailable", reason: study.reason });
				const courses = withLessonHere(study.courses, chats);
				const course = courses.find((c) => c.map.workspace === workspace);
				setRead(course ? { status: "ready", course, courses, chats } : { status: "missing" });
			})
			.catch(() => live && setRead((prev) => (prev.status === "ready" ? prev : { status: "missing" })));
		return () => {
			live = false;
		};
	}, [workspace, attempt]);
	return read;
}

/**
 * The topic page's route body (spec: topic-page/topic-page.md), what a
 * sidebar row or a map node opens: the window's 52px band, then the topic
 * page once its course is read.
 */
export function UnitPage({ workspace, handle }: { workspace: string; handle: string }) {
	const read = useUnitRead(workspace);
	const topic = read.status === "ready" ? read.course.map.topics.find((t) => t.handle === handle) : undefined;
	return (
		<WindowPage>
			{read.status === "loading" ? (
				<PageReading />
			) : read.status === "unavailable" ? (
				<PageNotice>
					<CoursesUnavailable reason={read.reason} />
				</PageNotice>
			) : read.status === "ready" && topic ? (
				<TopicPage course={read.course} courses={read.courses} topic={topic} chats={read.chats} />
			) : (
				<PageNotice>This topic is not in the course record.</PageNotice>
			)}
		</WindowPage>
	);
}
