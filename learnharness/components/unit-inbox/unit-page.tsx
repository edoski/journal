"use client";

import { useEffect, useState } from "react";
import type { ChatListItem, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { useDayChange } from "@/components/day-change";
import { SidebarToggle } from "@/components/sidebar";
import { useLinkVariant } from "@/components/design-variant";
import { TopicPage } from "@/components/unit-inbox/topic-page/topic-page";

type Read = { status: "loading" } | { status: "missing" } | { status: "ready"; course: StudyCourse; chats: ChatListItem[] };

/** The topic's course and every session, read again when a turn settles,
 *  the list changes, the course record changes or the day turns over. A
 *  failed read keeps the last one. */
function useUnitRead(workspace: string): Read {
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
				const course = study.available ? study.courses.find((c) => c.map.workspace === workspace) : undefined;
				setRead(course ? { status: "ready", course, chats } : { status: "missing" });
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
 * sidebar row or a map node opens: the band with the sidebar toggle, then
 * the topic page once its course is read.
 */
export function UnitPage({ workspace, handle, initialConfigured }: { workspace: string; handle: string; initialConfigured: boolean }) {
	const read = useUnitRead(workspace);
	const link = useLinkVariant();
	const topic = read.status === "ready" ? read.course.map.topics.find((t) => t.handle === handle) : undefined;
	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="relative flex h-13 shrink-0 items-center gap-2 px-3">
				<SidebarToggle />
			</header>
			{read.status === "ready" && topic ? (
				<TopicPage connected={link === "connected"} course={read.course} topic={topic} chats={read.chats} initialConfigured={initialConfigured} />
			) : (
				<p className="mx-auto w-full max-w-[46rem] px-6 pt-6 text-row text-muted-foreground">
					{read.status === "loading" ? "Loading…" : "This topic is not in the course record."}
				</p>
			)}
		</div>
	);
}
