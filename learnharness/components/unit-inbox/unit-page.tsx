"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, DumbbellIcon, MessageSquareIcon } from "lucide-react";
import type { ChatListItem, CourseMapTopic, StudyCourse, StudyListing } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { SidebarToggle } from "@/components/sidebar";
import { Composer } from "@/components/composer";
import { SetupDialog } from "@/components/setup-dialog";
import { BrailleSpinner } from "@/components/braille-spinner";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { NavRow, NavRowLabel, NavRowTrailing } from "@/components/nav/nav-row";
import { NavSection } from "@/components/nav/nav-section";
import { sessionState } from "@/components/nav/session-state";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { shortTimeAgo } from "@/components/sidebar-next";
import { useMapVariant, useTopicVariant } from "@/components/design-variant";
import { TopicHeader } from "@/components/unit-inbox/topic-header";
import { TOPIC_CANDIDATES, TopicPage } from "@/components/unit-inbox/topic-page/topic-page";
import { useTopicStarts } from "@/components/unit-inbox/use-unit-inbox";
import { activeSession, LEVEL_WORDS, linkStarts, openingFor, reviewWords, topicSessions } from "@/components/unit-inbox/units";

type Read = { status: "loading" } | { status: "missing" } | { status: "ready"; course: StudyCourse; chats: ChatListItem[] };

/** The topic's course and every session, read again when a turn settles or
 *  the list changes. A failed read keeps the last one. */
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

const KindIcon = ({ chat }: { chat: ChatListItem }) =>
	chat.kind === "practice" ? <DumbbellIcon aria-label="Practice" /> : <MessageSquareIcon aria-label="Lesson" />;

/** The session to resume, first and whole-row clickable: what it is, its
 *  title, and Your turn or the spinner, then Resume. */
function ActiveSession({ chat }: { chat: ChatListItem }) {
	const router = useRouter();
	const waits = sessionState(chat) === "your-turn";
	return (
		<button
			type="button"
			data-testid="unit-active-session"
			onClick={(e) => {
				router.push(`/chat/${chat.id}`);
				blurAfterPointerClick(e);
			}}
			className="group/active flex w-full min-w-0 items-center gap-3 rounded-xl border bg-card px-[7px] py-2.5 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground"
		>
			<KindIcon chat={chat} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-row font-medium text-foreground">{chat.title}</span>
				<span className="text-label text-muted-foreground">
					{waits ? (
						<span className="font-medium text-link">Your turn</span>
					) : (
						<>
							<BrailleSpinner /> The tutor is writing
						</>
					)}
				</span>
			</span>
			<span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-row font-medium text-primary-foreground">
				Resume
				<ArrowRightIcon aria-hidden className="size-4" />
			</span>
		</button>
	);
}

/** One of the topic's other sessions: lesson or practice, its title, how
 *  long ago. */
function SessionLine({ chat }: { chat: ChatListItem }) {
	const router = useRouter();
	return (
		<NavRow
			data-testid="unit-page-session"
			onClick={(e) => {
				router.push(`/chat/${chat.id}`);
				blurAfterPointerClick(e);
			}}
		>
			<KindIcon chat={chat} />
			<NavRowLabel>{chat.title}</NavRowLabel>
			<NavRowTrailing>
				<time dateTime={chat.updatedAt}>{shortTimeAgo(chat.updatedAt)}</time>
			</NavRowTrailing>
		</NavRow>
	);
}

/** The topic's standing in a few words: the engine's level, its review,
 *  and where it slips when the engine calls it weak. Pure. */
export function standingWords(topic: CourseMapTopic): string {
	const review = reviewWords(topic.review);
	return [LEVEL_WORDS[topic.level], review].filter(Boolean).join(". ");
}

/** The topic's header, its sessions with the active one first, and the
 *  composer that starts the next session on it. */
function UnitBody({
	course,
	topic,
	chats,
	initialConfigured,
}: {
	course: StudyCourse;
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
	initialConfigured: boolean;
}) {
	const lesson = useLessonStart(initialConfigured);
	// The header the topic map's node opens, while the Map switch is on Proposed.
	const mapNext = useMapVariant() === "proposed";
	const [starts, recordStart] = useTopicStarts();
	const [text, setText] = useState("");
	const workspace = course.map.workspace;
	const sessions = topicSessions(linkStarts(chats, starts), workspace, topic.handle);
	const active = activeSession(sessions);
	const others = sessions.filter((c) => c !== active);
	const send = () => {
		if (!text.trim()) return;
		lesson.start(openingFor(topic.title, text), workspace, (id) => recordStart(id, topic.handle));
	};
	return (
		<>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div data-testid="unit-page" className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 px-4 pb-8 pt-6">
					{mapNext ? (
						<TopicHeader
							map={course.map}
							topic={topic}
							busy={lesson.busy}
							onStudy={active ? undefined : () => lesson.start(topic.title, workspace, (id) => recordStart(id, topic.handle))}
						/>
					) : (
					<header className="flex flex-col gap-1 px-2">
						<p className="text-label text-muted-foreground">{course.map.title}</p>
						<h1 className="text-xl font-semibold text-foreground">{topic.title}</h1>
						<p data-slot="unit-standing" className="text-row text-muted-foreground">
							{standingWords(topic)}
						</p>
						{topic.weak && topic.signals.gap && (
							<p data-slot="unit-gap" className="text-row text-foreground/90">
								{topic.signals.gap}
							</p>
						)}
					</header>
					)}
					{active && <ActiveSession chat={active} />}
					<NavSection title="Sessions" trailing={others.length || undefined}>
						{others.length === 0 ? (
							<p className="px-2 text-row text-muted-foreground">{active ? "No other session yet." : "No session on this topic yet."}</p>
						) : (
							others.map((c) => <SessionLine key={c.id} chat={c} />)
						)}
					</NavSection>
				</div>
			</div>
			<div className="shrink-0 bg-background pb-4">
				<div className="mx-auto w-full max-w-[46rem] px-4">
					{lesson.error && (
						<p role="alert" className="mb-2 px-2 text-row text-danger">
							{lesson.error}
						</p>
					)}
					<Composer
						variant="proposed"
						busy={lesson.busy}
						value={text}
						onChange={setText}
						onSend={send}
						onStop={() => {}}
						canSend={text.trim().length > 0 && !lesson.busy}
						placeholder={`Ask about ${topic.title}, or start a new session on it`}
					/>
				</div>
			</div>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</>
	);
}

/**
 * The topic page (spec: unit-inbox.md), what a sidebar row opens, laid out
 * like a T3 Code thread: the topic, its course and standing on top, the
 * session to resume first, the other sessions as a quiet list, and the
 * composer pinned at the foot, which starts a new session on the topic.
 */
export function UnitPage({ workspace, handle, initialConfigured }: { workspace: string; handle: string; initialConfigured: boolean }) {
	const read = useUnitRead(workspace);
	const variant = useTopicVariant();
	const topic = read.status === "ready" ? read.course.map.topics.find((t) => t.handle === handle) : undefined;
	return (
		<div className="relative flex h-dvh min-w-0 flex-col">
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />
			<header className="relative flex h-13 shrink-0 items-center gap-2 px-3">
				<SidebarToggle />
			</header>
			{read.status === "ready" && topic ? (
				variant === "current" ? (
					<UnitBody course={read.course} topic={topic} chats={read.chats} initialConfigured={initialConfigured} />
				) : (
					<TopicPage candidate={TOPIC_CANDIDATES[variant]} course={read.course} topic={topic} chats={read.chats} initialConfigured={initialConfigured} />
				)
			) : (
				<p className="mx-auto w-full max-w-[46rem] px-6 pt-6 text-row text-muted-foreground">
					{read.status === "loading" ? "Loading…" : "This topic is not in the course record."}
				</p>
			)}
		</div>
	);
}
