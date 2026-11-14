"use client";

import { useState } from "react";
import { PageFrame } from "@/components/page-frame/page-frame";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import type { Press, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { isPlanned, mapLessonAtFirst } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { LessonMap } from "@/components/unit-inbox/topic-page/hybrid/lesson-map";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import { SectionsPane } from "@/components/unit-inbox/topic-page/pickup/sections";
import { BuildsOnMap } from "@/components/unit-inbox/topic-page/hybrid/builds-on-map";
import type { TopicHandle } from "@/src/core";

/** What the history pane is given (`../pickup/pickup.md`). */
export interface HybridPaneProps {
	facts: TopicFacts;
	busy: boolean;
	/** Does the page's action. */
	onAct?: () => void;
	/** Continues an open task. */
	onTask: (press: Press) => void;
	/** The lesson on the map, by session id. */
	shown: string | null;
	/** Puts a lesson's steps on the map. */
	onShow: (id: string) => void;
	className?: string;
}

/**
 * The topic page's body (spec: hybrid.md): the page fits the window, in
 * the shared page frame (`PageFrame`, page-frame.md) the course page
 * wears. The shared head, with a start's error under it, over two bounded
 * panes side by side, each the
 * full height under it: the topic's history sorted into Pick up's sections
 * on the left, which holds the page's action, and the steps of the lesson
 * picked in it as a map on the right, since a lesson's steps run down with
 * little branching, in the app's linked columns. A topic not started
 * shows what it builds on there instead. With neither, the history takes
 * the width.
 */
export function HybridTopic({ facts, busy, error = null, onAct, onTask }: TopicPageProps & { error?: string | null }) {
	const planned = facts.sessions.filter(isPlanned);
	const [chosen, setChosen] = useState(() => mapLessonAtFirst(facts.sessions, facts.action));
	const [pointed, setPointed] = useState<TopicHandle | null>(null);
	const shown = planned.find((entry) => entry.chat.id === chosen) ?? planned.find((entry) => entry.chat.id === mapLessonAtFirst(facts.sessions, facts.action)) ?? null;
	const side = (className?: string) => (
		<SectionsPane facts={facts} busy={busy} onAct={onAct} onTask={onTask} shown={shown?.chat.id ?? null} onShow={setChosen} onPoint={(handle) => setPointed(handle as TopicHandle | null)} className={className} />
	);
	const starting = facts.action.kind === "start" && facts.buildsMap;
	return (
		<PageFrame data-testid="unit-page" data-topic-candidate="hybrid">
			{/* Now and Scheduled say the review and Earlier dates the last study, so the head says neither. */}
			<TopicHead facts={{ ...facts, marks: facts.marks.filter((mark) => mark.kind !== "review"), studied: null }}>
				{error && (
					<p role="alert" data-slot="topic-lesson-error" className="flex min-h-5 items-center text-row text-danger">
						{error}
					</p>
				)}
			</TopicHead>
			{shown ? (
				<LinkedColumns
					data-slot="topic-panes"
					list={side("flex-1")}
					map={<LessonMap key={shown.chat.id} entry={shown} label={lessonWords(shown.day, facts.today, shown.chat.kind === "practice" ? "practice" : "lesson")} />}
				/>
			) : starting ? (
				<LinkedColumns data-slot="topic-panes" list={side("flex-1")} map={<BuildsOnMap map={starting} said={facts.said} topic={facts.topic.handle} pointed={pointed} />} />
			) : (
				side("flex-1")
			)}
		</PageFrame>
	);
}
