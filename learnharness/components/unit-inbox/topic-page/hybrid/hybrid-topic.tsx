"use client";

import { useState, type ComponentType } from "react";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import type { TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { trailDays } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import { History } from "@/components/unit-inbox/topic-page/hybrid/history";
import { isPlanned, mapLessonAtFirst } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { LessonMap } from "@/components/unit-inbox/topic-page/hybrid/lesson-map";

/** The hybrid page's column, which its composer foot shares: wide enough
 *  for a map two steps wide plus the frame's fade. */
export const HYBRID_COLUMN = "max-w-[60rem]";

/** What a pane that takes the history's place is given (`../pickup/pickup.md`). */
export interface HybridPaneProps {
	facts: TopicFacts;
	busy: boolean;
	/** Does the page's action. */
	onAct?: () => void;
	/** Starts a session on an open task. */
	onTask: (opening: string) => void;
	/** The lesson on the map, by session id. */
	shown: string | null;
	/** Puts a lesson's steps on the map. */
	onShow: (id: string) => void;
	className?: string;
}

/**
 * Topic page candidate "hybrid" (spec: hybrid.md): the page fits the
 * window. The shared head over two bounded panes: the topic's history on
 * top, at most two fifths of the room and only as tall as it needs, and
 * the steps of the lesson picked in it as a map filling the rest above the
 * composer. With no lesson that planned, the history takes the width. The
 * page's action lives in the composer foot, or, given a `pane` (a Pick up
 * option), in that pane, which takes the history's place.
 */
export function HybridTopic({ facts, busy, onAct, onTask, pane: Pane }: TopicPageProps & { pane?: ComponentType<HybridPaneProps> }) {
	const days = trailDays(facts.sessions, facts.attempts, facts.today);
	const planned = facts.sessions.filter(isPlanned);
	const [chosen, setChosen] = useState(() => mapLessonAtFirst(facts.sessions, facts.action));
	const shown = planned.find((entry) => entry.chat.id === chosen) ?? planned.find((entry) => entry.chat.id === mapLessonAtFirst(facts.sessions, facts.action)) ?? null;
	const side = (className?: string) =>
		Pane ? (
			<Pane facts={facts} busy={busy} onAct={onAct} onTask={onTask} shown={shown?.chat.id ?? null} onShow={setChosen} className={className} />
		) : (
			<History days={days} shown={shown?.chat.id ?? null} onShow={setChosen} titleOf={facts.titleOf} className={className} />
		);
	return (
		<div data-testid="unit-page" data-topic-candidate="hybrid" className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-5 px-6 pt-6 pb-4 ${HYBRID_COLUMN}`}>
			<TopicHead facts={facts} busy={busy} onAct={Pane ? undefined : onAct} />
			{shown ? (
				<div data-slot="topic-panes" className="flex min-h-0 flex-1 flex-col gap-4">
					{side("max-h-[40%] shrink-0")}
					<LessonMap key={shown.chat.id} entry={shown} label={lessonWords(shown.day, facts.today, shown.chat.kind === "practice" ? "practice" : "lesson")} />
				</div>
			) : (
				side("flex-1")
			)}
		</div>
	);
}
