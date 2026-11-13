"use client";

import { useCallback, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { Composer } from "@/components/composer";
import { useFieldCycle } from "@/components/field-cycle";
import { SetupDialog } from "@/components/setup-dialog";
import type { TOPIC_OPTIONS } from "@/components/design-variant";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { useTopicStarts } from "@/components/unit-inbox/use-unit-inbox";
import { linkStarts, openingFor, topicSessions } from "@/components/unit-inbox/units";
import { BriefTopic } from "@/components/unit-inbox/topic-page/brief/brief-topic";
import { StepsTopic } from "@/components/unit-inbox/topic-page/steps/steps-topic";
import { TrailTopic } from "@/components/unit-inbox/topic-page/trail/trail-topic";
import { HYBRID_COLUMN, HybridTopic, type HybridPaneProps } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { topicFacts, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { useTopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";

/** What every candidate takes. */
export interface TopicPageProps {
	facts: TopicFacts;
	/** A start is in flight: the action and the task rows are disabled. */
	busy: boolean;
	/** Does the page's one action: opens the session, or starts one with the
	 *  action's opening. Absent when a Pick up pane holds the action. */
	onAct?: () => void;
	/** Starts a session on an open task (a task pick-up row). */
	onTask: (opening: string) => void;
}

/** One body per option of the Topic switch. */
export const TOPIC_CANDIDATES: Record<(typeof TOPIC_OPTIONS)[number], ComponentType<TopicPageProps>> = {
	brief: BriefTopic,
	steps: StepsTopic,
	trail: TrailTopic,
	hybrid: HybridTopic,
};

/**
 * The topic page behind the Topic switch (spec: topic-page.md): what the
 * page as it is owns, the start and the composer, around the chosen
 * candidate's body. With a `pickup` option the hybrid's history is that
 * option's pane, which holds the action, and the composer starts a new
 * lesson. The page appears once the topic read has answered, so nothing
 * shifts in afterwards.
 */
export function TopicPage({
	candidate: Candidate,
	pickup,
	course,
	topic,
	chats,
	initialConfigured,
}: {
	candidate: ComponentType<TopicPageProps>;
	/** A Pick up option's pane, which takes the hybrid's history's place. */
	pickup?: ComponentType<HybridPaneProps>;
	course: StudyCourse;
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
	initialConfigured: boolean;
}) {
	const router = useRouter();
	const lesson = useLessonStart(initialConfigured);
	const [starts, recordStart] = useTopicStarts();
	const [text, setText] = useState("");
	const cycleComposer = useCallback((): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="composer"] textarea')), []);
	useFieldCycle(cycleComposer);
	const workspace = course.map.workspace;
	const sessions = topicSessions(linkStarts(chats, starts), workspace, topic.handle);
	const topicRead = useTopicRead(
		workspace,
		topic.handle,
		topic.tasks,
		sessions.map((chat) => chat.id),
	);
	const start = (opening: string) => lesson.start(opening, workspace, (id) => recordStart(id, topic.handle));
	const send = () => {
		if (!text.trim()) return;
		start(openingFor(topic.title, text));
	};
	if (topicRead.status === "loading") return <p className="mx-auto w-full max-w-[46rem] px-6 pt-6 text-row text-muted-foreground">Loading…</p>;
	const facts = topicFacts({ course, topic, sessions, read: topicRead.read });
	const act = () => {
		const { action } = facts;
		if ("chat" in action) router.push(`/chat/${action.chat.id}`);
		else start(action.opening);
	};
	return (
		<>
			{pickup ? (
				<HybridTopic facts={facts} busy={lesson.busy} onAct={act} onTask={start} pane={pickup} />
			) : (
				<Candidate facts={facts} busy={lesson.busy} onAct={act} onTask={start} />
			)}
			<div className="shrink-0 bg-background pb-4">
				<div className={`mx-auto w-full px-4 ${Candidate === HybridTopic ? HYBRID_COLUMN : "max-w-[46rem]"}`}>
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
						placeholder={pickup ? `Ask about ${topic.title} to start a new lesson` : `Ask about ${topic.title}, or start a new session on it`}
					/>
				</div>
			</div>
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</>
	);
}
