"use client";

import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import type { Press, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { isPlanned, mapLessonAtFirst } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { LessonMap } from "@/components/unit-inbox/topic-page/hybrid/lesson-map";
import { PlainPanes, type PanesProps } from "@/components/unit-inbox/topic-page/link/link-panes";
import { SectionsPane } from "@/components/unit-inbox/topic-page/pickup/sections";

/** The hybrid page's column, which its error line shares: wide enough
 *  for the history beside a map two steps wide plus the frame's fade. */
export const HYBRID_COLUMN = "max-w-[60rem]";

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
 * The topic page's body (spec: hybrid.md): the page fits the
 * window. The shared head over two bounded panes side by side, each the
 * full height under it: the topic's history sorted into Pick up's sections
 * on the left, which holds the page's action, and the steps of the lesson
 * picked in it as a map on the right, since a lesson's steps run down with
 * little branching. With no lesson that planned, the history takes the
 * width. `panes` (a Link option) is how the two are tied; plain side by
 * side by default.
 */
export function HybridTopic({ facts, busy, onAct, onTask, panes: Panes = PlainPanes }: TopicPageProps & { panes?: ComponentType<PanesProps> }) {
	const planned = facts.sessions.filter(isPlanned);
	const [chosen, setChosen] = useState(() => mapLessonAtFirst(facts.sessions, facts.action));
	const shown = planned.find((entry) => entry.chat.id === chosen) ?? planned.find((entry) => entry.chat.id === mapLessonAtFirst(facts.sessions, facts.action)) ?? null;
	const side = (className?: string) => <SectionsPane facts={facts} busy={busy} onAct={onAct} onTask={onTask} shown={shown?.chat.id ?? null} onShow={setChosen} className={className} />;
	return (
		<div data-testid="unit-page" data-topic-candidate="hybrid" className={cn("mx-auto flex min-h-0 w-full flex-1 flex-col gap-5 px-6 pb-6 pt-6", HYBRID_COLUMN)}>
			{/* Now and Scheduled say the review and Earlier dates the last study, so the head says neither. */}
			<TopicHead facts={{ ...facts, marks: facts.marks.filter((mark) => mark.kind !== "review"), studied: null }} />
			{shown ? (
				<Panes side={side()} map={<LessonMap key={shown.chat.id} entry={shown} label={lessonWords(shown.day, facts.today, shown.chat.kind === "practice" ? "practice" : "lesson")} />} />
			) : (
				side("flex-1")
			)}
		</div>
	);
}
