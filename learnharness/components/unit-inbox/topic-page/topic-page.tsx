"use client";

import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { topicSessions } from "@/components/unit-inbox/units";
import { HybridTopic } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { PageFrame } from "@/components/page-frame/page-frame";
import { topicFacts, type Press, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { useTopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";
import { continueHref } from "@/components/nav/session-state";

/** What the page's body takes. */
export interface TopicPageProps {
	facts: TopicFacts;
	/** A start is in flight: the action and the task rows are disabled. */
	busy: boolean;
	/** Does the page's one action: opens the session, or starts one with the
	 *  action's opening. */
	onAct?: () => void;
	/** Continues an open task (a task pick-up row). */
	onTask: (press: Press) => void;
}

/**
 * The topic page (spec: topic-page.md): the start around the hybrid body,
 * whose history pane holds the action, so it has no composer: a new
 * lesson starts from the sidebar's New lesson, and a start that fails
 * says so under the head. The page appears once the topic read has
 * answered, so nothing shifts in afterwards.
 */
export function TopicPage({
	course,
	courses,
	topic,
	chats,
}: {
	course: StudyCourse;
	/** Every course, for what the sidebar says on the map's cards. */
	courses: readonly StudyCourse[];
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
}) {
	const router = useRouter();
	const lesson = useLessonStart();
	const workspace = course.map.workspace;
	const sessions = topicSessions(chats, workspace, topic.handle);
	const topicRead = useTopicRead(
		workspace,
		topic.handle,
		topic.tasks,
		sessions.map((chat) => chat.id),
	);
	const start = (opening: string, from?: string) => lesson.start(opening, workspace, { topics: [topic.handle], from });
	const press = (does: Press) => ("open" in does ? router.push(continueHref(does.open)) : start(does.opening, does.from));
	if (topicRead.status === "loading") return <TopicNotice>Loading…</TopicNotice>;
	const facts = topicFacts({ course, courses, topic, chats, read: topicRead.read });
	const act = () => {
		const { action } = facts;
		if ("chat" in action) router.push(continueHref(action.chat));
		else start(action.opening, "from" in action ? action.from : undefined);
	};
	return (
		<>
			<HybridTopic facts={facts} busy={lesson.busy} error={lesson.error} onAct={act} onTask={press} />
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</>
	);
}

/** The one plain sentence the topic page shows in its place, in the page frame. */
export function TopicNotice({ children }: { children: React.ReactNode }) {
	return (
		<PageFrame>
			<p data-slot="topic-notice" className="flex min-h-8 items-center text-body text-muted-foreground">
				{children}
			</p>
		</PageFrame>
	);
}
