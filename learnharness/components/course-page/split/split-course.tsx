"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import type { ArcHandle, CourseStanding, TopicHandle } from "@/src/core";
import { drawingOf } from "@/components/course-map/topic-map/map-drawing";
import { useStartArcCheck } from "@/components/unit-inbox/start-unit";
import { CourseFrame } from "@/components/course-page/course-frame";
import { PageFrame } from "@/components/page-frame/page-frame";
import { CourseHead, arcOnPage } from "@/components/course-page/course-head/course-head";
import { openingArc, type CourseArcSection, type CourseGroup, type CourseView } from "@/components/course-page/course-model";
import { WhatNextRows } from "@/components/course-page/what-next";
import { SplitList, type SplitListHandle } from "@/components/course-page/split/split-list";
import { SplitMap, type SplitMapHandle } from "@/components/course-page/split/split-map";
import { OPEN_AT_FIRST, aimOf, litOf, markedOf, revealOf, shownGroups, type Pointed } from "@/components/course-page/split/split-tie";

/**
 * The course page (spec: split-course.md), in the shared page frame: the
 * head across the column, then the course's topics in their groups on the
 * left and its topic map filling the right. Pointing at a
 * row lights its topic and prerequisites on the map and brings it into
 * view; pointing at a node marks its row. A click on either opens the
 * topic's page. The page fits the window; each pane scrolls inside itself.
 * A course with arcs lists its arcs instead, where he is open on arrival,
 * and the map draws one arc with the course's arcs listed beside it, as
 * Home's map does: opening an arc shows it on the map, and showing one on
 * the map (its list, ⇧↑ ⇧↓, H) opens it in the list.
 * Above its arcs, where he picks up and what comes next (`WhatNextRows`).
 */
export function SplitCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{({ view, standing, busy, onContinue }) => <SplitBody view={view} standing={standing} busy={busy} onContinue={onContinue} />}</CourseFrame>;
}

/** What a course page's head and left column are handed by the page they
 *  sit in (`SplitBody`): the course, the arc the map shows and which
 *  sections are open, and the tie to the map, so every page keeps one
 *  linked-columns layout with the same map. */
export interface CourseColumns {
	view: CourseView;
	standing: CourseStanding | null;
	busy: boolean;
	onContinue: (workspace: string) => void;
	/** The groups with topics, for a course without arcs. */
	groups: readonly CourseGroup[];
	/** The arc the map shows, of a course with arcs. */
	shown: CourseArcSection | null;
	/** Shows an arc on the map, and opens it in the list. */
	showArc: (arc: ArcHandle) => void;
	open: Readonly<Record<string, boolean>>;
	onOpenChange: (id: string, open: boolean) => void;
	onCheck: (section: CourseArcSection) => void;
	/** The arc whose check is starting. */
	checking: string | null;
	/** The topic he points at on the map, whose row the list marks. */
	marked: TopicHandle | null;
	/** A row he points at or focuses, or none. */
	onPoint: (handle: TopicHandle | null) => void;
	/** The list's handle, which the map hands the walk back to. */
	listRef: RefObject<SplitListHandle | null>;
	onEnterMap: (handle: TopicHandle) => void;
	/** Up from the list's first stop: the head's press. */
	onExitTop: () => void;
}

/** Current's head: Pace (course-head.md). */
function currentHead({ view, standing, busy, onContinue }: CourseColumns): ReactNode {
	return <CourseHead view={view} standing={standing} busy={busy} onContinue={onContinue} />;
}

/** Current's left column: What next, then the arcs or the groups. */
function currentList(c: CourseColumns): ReactNode {
	return (
		<>
			<WhatNextRows next={c.view.whatNext} course={c.view.course} busy={c.busy} onContinue={c.onContinue} />
			<SplitList
				ref={c.listRef}
				groups={c.groups}
				arcs={c.view.arcs}
				open={c.open}
				onOpenChange={c.onOpenChange}
				onCheck={c.onCheck}
				checking={c.checking}
				marked={c.marked}
				onPoint={c.onPoint}
				onEnterMap={c.onEnterMap}
				onExitTop={c.onExitTop}
			/>
		</>
	);
}

/** The page under the course frame: its head, then the list beside the
 *  map. A candidate page passes its own `head` and `list`. */
export function SplitBody({
	view,
	standing,
	busy,
	onContinue,
	head = currentHead,
	list: listOf = currentList,
	mapIndex = true,
}: {
	view: CourseView;
	standing: CourseStanding | null;
	busy: boolean;
	onContinue: (workspace: string) => void;
	head?: (columns: CourseColumns) => ReactNode;
	list?: (columns: CourseColumns) => ReactNode;
	/** Whether the map lists its arcs beside it; off when the list is itself the course's arcs (Road). */
	mapIndex?: boolean;
}) {
	const { map } = view.course;
	const { arcs } = view;
	const [pointed, setPointed] = useState<Pointed | null>(null);
	const groups = useMemo(() => shownGroups(view.groups), [view.groups]);
	// `?arc=` (the head's arc pill, a topic head's) shows that arc; else where he is.
	const asked = useSearchParams().get("arc");
	const askedArc = arcs?.some((a) => a.arc.handle === asked) ? (asked as ArcHandle) : null;
	const [shownArc, setShownArc] = useState<ArcHandle | null>(() => (arcs ? (askedArc ?? openingArc(arcs)) : null));
	const [open, setOpen] = useState<Readonly<Record<string, boolean>>>(() => (arcs ? (shownArc ? { [shownArc]: true } : {}) : OPEN_AT_FIRST));
	const [lastAsked, setLastAsked] = useState(askedArc);
	if (lastAsked !== askedArc) {
		setLastAsked(askedArc);
		if (askedArc) {
			setShownArc(askedArc);
			setOpen((was) => (was[askedArc] ? was : { ...was, [askedArc]: true }));
		}
	}
	const shown = arcs?.find((a) => a.arc.handle === shownArc) ?? null;
	// The map's drawing, which sizes the pane's surface.
	const wholeLayout = useMemo(() => drawingOf(map, undefined).layout, [map]);
	const layout = useMemo(() => (shown ? drawingOf(map, shown.arc.handle).layout : wholeLayout), [shown, map, wholeLayout]);
	const aim = useMemo(() => aimOf(map.current, view.next.lesson.topics, shown ? [{ id: shown.arc.handle, topics: shown.topics }] : groups, layout), [map.current, view.next.lesson.topics, shown, groups, layout]);
	const { startArcCheck, starting } = useStartArcCheck();
	const onCheck = (section: CourseArcSection) =>
		startArcCheck(
			map.workspace,
			section.arc,
			section.topics.filter((t) => t.topic.excluded === undefined).map((t) => t.topic.handle),
		);
	/** The shown arc, kept in the address, so the head's pill (`?arc=`) always moves to it. */
	const show = (arc: ArcHandle) => {
		setShownArc(arc);
		setLastAsked(arc);
		window.history.replaceState(null, "", arcOnPage(map.workspace, arc));
	};
	/** Opening an arc shows it on the map. */
	const onOpenChange = (id: string, to: boolean) => {
		setOpen((was) => ({ ...was, [id]: to }));
		if (arcs && to) show(id as ArcHandle);
	};
	/** An arc shown on the map (its list, ⇧↑ ⇧↓, H, a card's "From" line) opens in the list. */
	const showArc = (arc: ArcHandle) => {
		show(arc);
		setOpen((was) => (was[arc] ? was : { ...was, [arc]: true }));
	};
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

	const columns: CourseColumns = {
		view,
		standing,
		busy,
		onContinue,
		groups,
		shown,
		showArc,
		open,
		onOpenChange,
		onCheck,
		checking: starting,
		marked: markedOf(pointed),
		onPoint: pointFrom("list"),
		listRef: list,
		onEnterMap: (to) => drawing.current?.focus(to),
		onExitTop: () => action()?.focus(),
	};

	return (
		<PageFrame className="h-full">
			<div ref={headerBox} className="contents" onKeyDown={onHeaderKeyDown}>
				{head(columns)}
			</div>
			{map.topics.length === 0 ? (
				<p data-slot="course-notice" className="flex min-h-8 items-center text-body text-muted-foreground">
					Topics appear as you study this course.
				</p>
			) : (
				<LinkedColumns
					data-slot="course-split"
					list={listOf(columns)}
					map={
						<SplitMap
							key={map.workspace}
							ref={drawing}
							map={map}
							arc={shownArc ?? undefined}
							arcs={arcs?.map((a) => a.arc) ?? null}
							index={mapIndex}
							said={view.said}
							layout={layout}
							wholeLayout={wholeLayout}
							lit={lit}
							aim={aim}
							reveal={revealOf(pointed)}
							onPoint={pointFrom("map")}
							onLeave={(to) => list.current?.focus(to)}
							onOpenArc={showArc}
						/>
					}
				/>
			)}
		</PageFrame>
	);
}
