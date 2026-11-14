"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import type { TopicHandle } from "@/src/core";
import { TOPIC_NODE_SIZE, layoutTopicMap } from "@/components/course-map/topic-map/topic-map-layout";
import { CourseFrame } from "@/components/course-page/course-frame";
import { PageFrame } from "@/components/page-frame/page-frame";
import { CourseHeader } from "@/components/course-page/course-header";
import type { CourseView } from "@/components/course-page/course-model";
import { SplitList, type SplitListHandle } from "@/components/course-page/split/split-list";
import { SplitMap, type SplitMapHandle } from "@/components/course-page/split/split-map";
import { aimOf, litOf, markedOf, revealOf, shownGroups, type Pointed } from "@/components/course-page/split/split-tie";

/**
 * The course page (spec: split-course.md), in the shared page frame: the
 * head across the column, then the course's topics in their groups on the
 * left and its topic map filling the right. Pointing at a
 * row lights its topic and prerequisites on the map and brings it into
 * view; pointing at a node marks its row. A click on either opens the
 * topic's page. The page fits the window; each pane scrolls inside itself.
 */
export function SplitCourse({ workspace }: { workspace: string }) {
	return (
		<CourseFrame workspace={workspace}>
			{({ view, busy, onContinue }) => <SplitBody view={view} header={<CourseHeader view={view} busy={busy} onContinue={onContinue} />} />}
		</CourseFrame>
	);
}

function SplitBody({ view, header }: { view: CourseView; header: React.ReactNode }) {
	const { map } = view.course;
	const [pointed, setPointed] = useState<Pointed | null>(null);
	const groups = useMemo(() => shownGroups(view.groups), [view.groups]);
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, TOPIC_NODE_SIZE), [map.topics, map.edges]);
	const aim = useMemo(() => aimOf(map.current, view.next.lesson.topics, groups, layout), [map.current, view.next.lesson.topics, groups, layout]);
	const lit = useMemo(() => litOf(pointed, map.edges), [pointed, map.edges]);
	const headerBox = useRef<HTMLDivElement>(null);
	const list = useRef<SplitListHandle>(null);
	const drawing = useRef<SplitMapHandle>(null);

	/** One pane says what he points at; leaving it clears only its own. */
	const pointFrom = (from: Pointed["from"]) => (handle: TopicHandle | null) =>
		setPointed((was) => (handle ? { handle, from } : was?.from === from ? null : was));

	/** The header's button joins the arrow walk: Up from the first row reaches it, Down returns to the rows. */
	const action = () => headerBox.current?.querySelector<HTMLElement>("[data-slot=course-action]") ?? null;
	const onHeaderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.target !== action() || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			list.current?.focusFirst();
		} else if (e.key === "Escape") {
			e.preventDefault();
			(e.target as HTMLElement).blur();
		}
	};

	return (
		<PageFrame className="h-full">
			<div ref={headerBox} className="contents" onKeyDown={onHeaderKeyDown}>
				{header}
			</div>
			{map.topics.length === 0 ? (
				<p data-slot="course-notice" className="flex min-h-8 items-center text-row text-muted-foreground">
					Topics appear as you study this course.
				</p>
			) : (
				<LinkedColumns
					data-slot="course-split"
					list={
						<SplitList
							ref={list}
							groups={groups}
							marked={markedOf(pointed)}
							onPoint={pointFrom("list")}
							onEnterMap={(to) => drawing.current?.focus(to)}
							onExitTop={() => action()?.focus()}
						/>
					}
					map={
						<SplitMap
							ref={drawing}
							map={map}
							layout={layout}
							lit={lit}
							aim={aim}
							reveal={revealOf(pointed)}
							onPoint={pointFrom("map")}
							onLeave={(to) => list.current?.focus(to)}
						/>
					}
				/>
			)}
		</PageFrame>
	);
}
