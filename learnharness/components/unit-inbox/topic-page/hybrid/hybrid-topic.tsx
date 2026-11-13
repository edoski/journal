"use client";

import { useState } from "react";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import { trailDays } from "@/components/unit-inbox/topic-page/trail/trail-facts";
import { History } from "@/components/unit-inbox/topic-page/hybrid/history";
import { isPlanned, mapLessonAtFirst } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { LessonMap } from "@/components/unit-inbox/topic-page/hybrid/lesson-map";

/** The hybrid page's column, which its composer foot shares: wide enough
 *  for the history beside a map one step wide plus the frame's fade. */
export const HYBRID_COLUMN = "max-w-[60rem]";

/**
 * Topic page candidate "hybrid" (spec: hybrid.md): the page fits the
 * window. The shared head over two bounded panes: the topic's history on
 * the left, and the steps of the lesson picked in it as a map on the
 * right. With no lesson that planned, the history takes the width. The
 * page's action lives in the composer foot.
 */
export function HybridTopic({ facts, busy, onAct }: TopicPageProps) {
	const days = trailDays(facts.sessions, facts.attempts, facts.today);
	const planned = facts.sessions.filter(isPlanned);
	const [chosen, setChosen] = useState(() => mapLessonAtFirst(facts.sessions, facts.action));
	const shown = planned.find((entry) => entry.chat.id === chosen) ?? planned.find((entry) => entry.chat.id === mapLessonAtFirst(facts.sessions, facts.action)) ?? null;
	return (
		<div data-testid="unit-page" data-topic-candidate="hybrid" className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-5 px-6 pt-6 pb-4 ${HYBRID_COLUMN}`}>
			<TopicHead facts={facts} busy={busy} onAct={onAct} />
			{shown ? (
				<div data-slot="topic-panes" className="grid min-h-0 flex-1 grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6">
					<History days={days} shown={shown.chat.id} onShow={setChosen} titleOf={facts.titleOf} />
					<LessonMap key={shown.chat.id} entry={shown} label={lessonWords(shown.day, facts.today, shown.chat.kind === "practice" ? "practice" : "lesson")} />
				</div>
			) : (
				<History days={days} shown={null} onShow={setChosen} titleOf={facts.titleOf} className="flex-1" />
			)}
		</div>
	);
}
