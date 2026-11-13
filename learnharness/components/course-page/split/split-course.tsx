"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { TopicHandle } from "@/src/core";
import { layoutTopicMap } from "@/components/course-map/topic-map/topic-map-layout";
import { useNodeSize } from "@/components/course-map/topic-map/node-size";
import { CourseFrame } from "@/components/course-page/course-frame";
import { CourseHeader } from "@/components/course-page/course-header";
import type { CourseView } from "@/components/course-page/course-model";
import { SplitList, type SplitListHandle } from "@/components/course-page/split/split-list";
import { SplitMap, type SplitMapHandle } from "@/components/course-page/split/split-map";
import { aimOf, litOf, markedOf, revealOf, shownGroups, type Pointed } from "@/components/course-page/split/split-tie";

/**
 * The course page candidate "split" (spec: split-course.md): the shared
 * header across the page, then the course's topics in their groups on the
 * left and its topic map filling the right, tied together. Pointing at a
 * row lights its topic and prerequisites on the map and brings it into
 * view; pointing at a node marks its row. A click on either opens the
 * topic's page. The page fits the window; each pane scrolls inside itself.
 */
export function SplitCourse({ workspace, initialConfigured }: { workspace: string; initialConfigured: boolean }) {
	return (
		<CourseFrame workspace={workspace} initialConfigured={initialConfigured} className="flex h-full w-full flex-col gap-6 px-8 pt-5 pb-6">
			{({ view, busy, onContinue }) => <SplitBody view={view} header={<CourseHeader view={view} busy={busy} onContinue={onContinue} />} />}
		</CourseFrame>
	);
}

function SplitBody({ view, header }: { view: CourseView; header: React.ReactNode }) {
	const { map } = view.course;
	const [pointed, setPointed] = useState<Pointed | null>(null);
	const groups = useMemo(() => shownGroups(view.groups), [view.groups]);
	const node = useNodeSize();
	const layout = useMemo(() => layoutTopicMap(map.topics, map.edges, node), [map.topics, map.edges, node]);
	const aim = useMemo(() => aimOf(view.next.lesson.topics, groups, layout), [view.next.lesson.topics, groups, layout]);
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
		<>
			<div ref={headerBox} className="contents" onKeyDown={onHeaderKeyDown}>
				{header}
			</div>
			{map.topics.length === 0 ? (
				<p data-slot="course-notice" className="flex min-h-8 items-center text-row text-muted-foreground">
					Topics appear as you study this course.
				</p>
			) : (
				<div data-slot="course-split" className="grid min-h-0 flex-1 grid-cols-[clamp(20rem,36%,25rem)_minmax(0,1fr)] gap-6">
					<SplitList
						ref={list}
						groups={groups}
						marked={markedOf(pointed)}
						onPoint={pointFrom("list")}
						onEnterMap={(handle) => drawing.current?.focus(handle)}
						onExitTop={() => action()?.focus()}
					/>
					<SplitMap
						ref={drawing}
						map={map}
						layout={layout}
						lit={lit}
						aim={aim}
						reveal={revealOf(pointed)}
						onPoint={pointFrom("map")}
						onLeave={(handle) => list.current?.focus(handle)}
					/>
				</div>
			)}
		</>
	);
}
