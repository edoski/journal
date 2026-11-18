"use client";

import { useRef, useState } from "react";
import { PageFrame } from "@/components/page-frame/page-frame";
import { lessonWords } from "@/components/unit-inbox/topic-page/steps/steps-facts";
import { TopicHead } from "@/components/unit-inbox/topic-page/topic-head";
import type { TopicPageProps } from "@/components/unit-inbox/topic-page/topic-page";
import type { Press, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { isPlanned, mapLessonAtFirst } from "@/components/unit-inbox/topic-page/hybrid/hybrid-facts";
import { LessonMap } from "@/components/unit-inbox/topic-page/hybrid/lesson-map";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import { SectionsPane } from "@/components/unit-inbox/topic-page/pickup/sections";
import { lessonBegun } from "@/components/unit-inbox/topic-page/pickup/pickup-facts";
import { BuildsOnMap } from "@/components/unit-inbox/topic-page/hybrid/builds-on-map";
import { useMapTie } from "@/components/course-map/use-map-tie";
import { useListWalk } from "@/components/list-walk/use-list-walk";
import { StartFailure } from "@/components/start/start-scope";
import { CourseComposer } from "@/components/course-page/course-composer";

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
 * wears. The shared head, with the page's start failure under it, over two
 * bounded panes side by side, each the full height under it: the topic's
 * history sorted into Pick up's sections on the left, which holds the
 * page's action, and the steps of the lesson picked in it as a map on the
 * right, since a lesson's steps run down with little branching, in the
 * app's linked columns. A topic not started, or one a lesson he began has
 * not introduced yet, shows what it builds on there instead. With neither,
 * the right column stays empty, so the history keeps its width and every
 * line its date beside it (round 16, m21: Earlier ran about 1,200px wide,
 * each date at the far edge). At its foot, the course page's composer
 * with the topic chosen. Its starts go through the page's `StartScope`.
 */
export function HybridTopic({ facts, busy, onAct, onTask }: TopicPageProps) {
	const planned = facts.sessions.filter(isPlanned);
	const [chosen, setChosen] = useState(() => mapLessonAtFirst(facts.sessions, facts.action));
	// A row of Builds on lights its topic alone: the map is already the chain the topic builds on.
	const tie = useMapTie();
	const shown = planned.find((entry) => entry.chat.id === chosen) ?? planned.find((entry) => entry.chat.id === mapLessonAtFirst(facts.sessions, facts.action)) ?? null;
	// The sections walk as every page's list does: each row's press is a stop, Now's first; Up from Now reaches the
	// head's trail, its last link, and Down returns.
	const head = useRef<HTMLDivElement>(null);
	const pane = useRef<HTMLDivElement>(null);
	const walk = useListWalk({
		stops: () => Array.from(pane.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []),
		head: () => Array.from(head.current?.querySelectorAll<HTMLElement>("a[href]") ?? []).at(-1) ?? null,
	});
	const side = (className?: string) => (
		<SectionsPane
			facts={facts}
			busy={busy}
			onAct={onAct}
			onTask={onTask}
			shown={shown?.chat.id ?? null}
			onShow={setChosen}
			onPoint={(handle, by) => tie.pointTopic("list", handle, by)}
			listRef={pane}
			onWalkKey={walk.onKeyDown}
			className={className}
		/>
	);
	const starting = (facts.action.kind === "start" || lessonBegun(facts)) && facts.buildsMap;
	return (
		<PageFrame data-testid="unit-page" data-topic-candidate="hybrid">
			<div ref={head} className="contents" onKeyDown={walk.onHeadKeyDown}>
				{/* Now and Scheduled say the review, so the head does not. */}
				<TopicHead facts={{ ...facts, marks: facts.marks.filter((mark) => mark.kind !== "review") }}>
					<StartFailure className="flex min-h-5 items-center text-body" />
				</TopicHead>
			</div>
			<LinkedColumns
				data-slot="topic-panes"
				list={side("flex-1")}
				map={
					shown ? (
						<LessonMap key={shown.chat.id} entry={shown} label={lessonWords(shown.day, facts.today, shown.chat.kind === "practice" ? "practice" : "lesson")} />
					) : starting ? (
						<BuildsOnMap map={starting} said={facts.said} topic={facts.topic.handle} lights={tie.lights} />
					) : null
				}
			/>
			<CourseComposer course={facts.course} topic={facts.topic} />
		</PageFrame>
	);
}
