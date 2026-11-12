"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DumbbellIcon, MessageSquareIcon } from "lucide-react";
import type { ChatListItem, CourseMapTopic, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { SidebarToggle } from "@/components/sidebar";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { sessionState } from "@/components/nav/session-state";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { shortTimeAgo } from "@/components/sidebar-next";
import { STUDY_WORDS, useStartUnit } from "@/components/unit-inbox/start-unit";
import { LEVEL_WORDS, reviewWords, SHELF_WORDS, shelfOf, topicSessions, unitKey, type Unit } from "@/components/unit-inbox/units";
import { unitHref } from "@/components/unit-inbox/page/unit-href";
import { Button } from "@/components/ui/button";

type Read = { status: "loading" } | { status: "missing" } | { status: "ready"; course: StudyCourse; chats: ChatListItem[] };

function useUnitRead(workspace: string): Read {
	const [read, setRead] = useState<Read>({ status: "loading" });
	const [attempt, setAttempt] = useState(0);
	useServerEvent("turn-settled", () => setAttempt((n) => n + 1));
	useServerEvent("chats-changed", () => setAttempt((n) => n + 1));
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

/** One related topic: its title, linking to its page, and its standing. */
function TopicLink({ workspace, topic }: { workspace: string; topic: CourseMapTopic }) {
	return (
		<NavRow asChild inset>
			<Link href={unitHref(workspace, topic.handle)} onClick={blurAfterPointerClick}>
				<NavRowLabel>{topic.title}</NavRowLabel>
				<NavRowTrailing>{LEVEL_WORDS[topic.level]}</NavRowTrailing>
			</Link>
		</NavRow>
	);
}

/** One of the unit's sessions: a lesson or practice, its title, and
 *  "Your turn" or how long ago. */
function SessionLine({ chat }: { chat: ChatListItem }) {
	const router = useRouter();
	const state = sessionState(chat);
	return (
		<NavRow
			attention={state === "your-turn"}
			data-testid="unit-page-session"
			onClick={(e) => {
				router.push(`/chat/${chat.id}`);
				blurAfterPointerClick(e);
			}}
		>
			{chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" /> : <MessageSquareIcon aria-label="Lesson" />}
			<NavRowLabel>{chat.title}</NavRowLabel>
			<NavRowTrailing>
				{state === "your-turn" ? (
					<span className="font-medium text-link">Your turn</span>
				) : (
					<time dateTime={chat.updatedAt}>{shortTimeAgo(chat.updatedAt)}</time>
				)}
			</NavRowTrailing>
		</NavRow>
	);
}

/** The topic as the engine holds it, with its sessions and neighbours. */
function UnitDetail({ course, topic, chats }: { course: StudyCourse; topic: CourseMapTopic; chats: readonly ChatListItem[] }) {
	const { start, starting } = useStartUnit();
	const { map } = course;
	const workspace = map.workspace;
	const sessions = topicSessions(chats, workspace, topic.handle);
	const shelf = shelfOf(topic, null);
	const unit: Unit = { key: unitKey(workspace, topic.handle), course: { workspace, title: map.title }, topic, shelf: shelf ?? "learning", sessions, now: null };
	const byHandle = new Map(map.topics.map((t) => [t.handle as string, t]));
	const related = (side: "prerequisite" | "topic") =>
		map.edges.flatMap((e) => {
			if (e.kind !== "needs") return [];
			const [mine, other] = side === "prerequisite" ? [e.topic, e.prerequisite] : [e.prerequisite, e.topic];
			const t = mine === topic.handle ? byHandle.get(other) : undefined;
			return t ? [t] : [];
		});
	const needs = related("prerequisite");
	const leads = related("topic");
	const review = reviewWords(topic.review);
	return (
		<>
			<div className="flex flex-col gap-1">
				<p className="text-label text-muted-foreground">
					{map.title}
					{shelf && ` · ${SHELF_WORDS[shelf]}`}
				</p>
				<h1 className="text-xl font-semibold text-foreground">{topic.title}</h1>
				<p className="text-row text-muted-foreground">
					{LEVEL_WORDS[topic.level]}
					{review && `. ${review}`}
				</p>
			</div>
			{topic.weak && topic.signals.gap && (
				<div data-slot="unit-gap" className="flex flex-col gap-0.5">
					<p className="text-label font-medium text-muted-foreground">Where it slips</p>
					<p className="text-row text-foreground">{topic.signals.gap}</p>
				</div>
			)}
			<div>
				<Button data-testid="unit-study" disabled={starting !== null} onClick={() => start(unit)}>
					{STUDY_WORDS}
				</Button>
			</div>
			<NavSection title="Sessions" trailing={sessions.length || undefined} className="-mx-2">
				{sessions.length === 0 ? (
					<p className="px-2 text-row text-muted-foreground">No session in the app works on it yet.</p>
				) : (
					sessions.map((c) => <SessionLine key={c.id} chat={c} />)
				)}
			</NavSection>
			{needs.length > 0 && (
				<NavSection title="Builds on" className="-mx-2">
					{needs.map((t) => (
						<TopicLink key={t.handle} workspace={workspace} topic={t} />
					))}
				</NavSection>
			)}
			{leads.length > 0 && (
				<NavSection title="Leads to" className="-mx-2">
					{leads.map((t) => (
						<TopicLink key={t.handle} workspace={workspace} topic={t} />
					))}
				</NavSection>
			)}
		</>
	);
}

/**
 * The unit page (spec: page.md), the Page candidate's main pane: one
 * course topic as the engine holds it, its standing and review in words
 * and why it is weak, Study this, its sessions newest first, and the
 * topics it builds on and leads to, each opening its own page.
 */
export function UnitPage({ workspace, handle }: { workspace: string; handle: string }) {
	const read = useUnitRead(workspace);
	const topic = read.status === "ready" ? read.course.map.topics.find((t) => t.handle === handle) : undefined;
	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="relative flex h-13 shrink-0 items-center gap-2 px-3">
				<SidebarToggle />
			</header>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div data-testid="unit-page" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 pb-12 pt-6">
					{read.status === "loading" ? (
						<p className="text-row text-muted-foreground">Loading…</p>
					) : read.status === "ready" && topic ? (
						<UnitDetail course={read.course} topic={topic} chats={read.chats} />
					) : (
						<p className="text-row text-muted-foreground">This topic is not in the course record.</p>
					)}
				</div>
			</div>
		</div>
	);
}
