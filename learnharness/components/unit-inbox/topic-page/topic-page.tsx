"use client";

import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { SetupDialog } from "@/components/setup-dialog";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { topicSessions } from "@/components/unit-inbox/units";
import { HYBRID_COLUMN, HybridTopic } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { topicFacts, type Press, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { useTopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";

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
 * lesson starts from the sidebar's New lesson. The page appears once the
 * topic read has answered, so nothing shifts in afterwards.
 */
export function TopicPage({
	connected,
	course,
	topic,
	chats,
	initialConfigured,
}: {
	/** The Link switch: whether a line ties the lesson's row to its step. */
	connected?: boolean;
	course: StudyCourse;
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
	initialConfigured: boolean;
}) {
	const router = useRouter();
	const lesson = useLessonStart(initialConfigured);
	const workspace = course.map.workspace;
	const sessions = topicSessions(chats, workspace, topic.handle);
	const topicRead = useTopicRead(
		workspace,
		topic.handle,
		topic.tasks,
		sessions.map((chat) => chat.id),
	);
	const start = (opening: string, from?: string) => lesson.start(opening, workspace, { topics: [topic.handle], from });
	const press = (does: Press) => ("open" in does ? router.push(`/chat/${does.open.id}`) : start(does.opening, does.from));
	if (topicRead.status === "loading") return <p className="mx-auto w-full max-w-[46rem] px-6 pt-6 text-row text-muted-foreground">Loading…</p>;
	const facts = topicFacts({ course, topic, chats, read: topicRead.read });
	const act = () => {
		const { action } = facts;
		if ("chat" in action) router.push(`/chat/${action.chat.id}`);
		else start(action.opening, "from" in action ? action.from : undefined);
	};
	return (
		<>
			<HybridTopic facts={facts} busy={lesson.busy} onAct={act} onTask={press} connected={connected} />
			{lesson.error && (
				<p role="alert" className={`mx-auto w-full px-6 pb-4 text-row text-danger ${HYBRID_COLUMN}`}>
					{lesson.error}
				</p>
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</>
	);
}
