"use client";

import { useCallback, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { ChatListItem, CourseMapTopic, StudyCourse } from "@/src/core";
import { Composer } from "@/components/composer";
import { useFieldCycle } from "@/components/field-cycle";
import { SetupDialog } from "@/components/setup-dialog";
import type { TOPIC_OPTIONS } from "@/components/design-variant";
import { useLessonStart } from "@/components/start/use-lesson-start";
import { openingFor, topicSessions } from "@/components/unit-inbox/units";
import { BriefTopic } from "@/components/unit-inbox/topic-page/brief/brief-topic";
import { StepsTopic } from "@/components/unit-inbox/topic-page/steps/steps-topic";
import { TrailTopic } from "@/components/unit-inbox/topic-page/trail/trail-topic";
import { HYBRID_COLUMN, HybridTopic } from "@/components/unit-inbox/topic-page/hybrid/hybrid-topic";
import { topicFacts, type Press, type TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { useTopicRead } from "@/components/unit-inbox/topic-page/use-topic-read";
import type { PanesProps } from "@/components/unit-inbox/topic-page/link/link-panes";

/** What every candidate takes. */
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
 * candidate's body. The hybrid's history pane holds the action, so it has
 * no composer: a new lesson starts from the sidebar's New lesson. The page
 * appears once the topic read has answered, so nothing shifts in afterwards.
 */
export function TopicPage({
	candidate: Candidate,
	link,
	course,
	topic,
	chats,
	initialConfigured,
}: {
	candidate: ComponentType<TopicPageProps>;
	/** A Link option's way of tying the hybrid's pane to the map. */
	link?: ComponentType<PanesProps>;
	course: StudyCourse;
	topic: CourseMapTopic;
	chats: readonly ChatListItem[];
	initialConfigured: boolean;
}) {
	const router = useRouter();
	const lesson = useLessonStart(initialConfigured);
	const [text, setText] = useState("");
	const cycleComposer = useCallback((): readonly HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="composer"] textarea')), []);
	useFieldCycle(cycleComposer);
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
	const send = () => {
		if (!text.trim()) return;
		start(openingFor(topic.title, text));
	};
	if (topicRead.status === "loading") return <p className="mx-auto w-full max-w-[46rem] px-6 pt-6 text-row text-muted-foreground">Loading…</p>;
	const facts = topicFacts({ course, topic, chats, read: topicRead.read });
	const act = () => {
		const { action } = facts;
		if ("chat" in action) router.push(`/chat/${action.chat.id}`);
		else start(action.opening, "from" in action ? action.from : undefined);
	};
	return (
		<>
			{Candidate === HybridTopic ? (
				<HybridTopic facts={facts} busy={lesson.busy} onAct={act} onTask={press} panes={link} />
			) : (
				<Candidate facts={facts} busy={lesson.busy} onAct={act} onTask={press} />
			)}
			{Candidate === HybridTopic ? (
				lesson.error && (
					<p role="alert" className={`mx-auto w-full px-6 pb-4 text-row text-danger ${HYBRID_COLUMN}`}>
						{lesson.error}
					</p>
				)
			) : (
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
			)}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} onDone={lesson.closeSetup} />
		</>
	);
}
