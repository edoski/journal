"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { LinkedColumns } from "@/components/linked-columns/linked-columns";
import { currentArc, type ArcHandle, type CourseStanding, type TopicHandle } from "@/src/core";
import { useMapSkin } from "@/components/course-map/topic-map/map-skins";
import { drawingOf } from "@/components/course-map/topic-map/map-skin";
import { ArcStrip } from "@/components/course-map/arc-strip";
import { ArcSelector } from "@/components/course-map/arc-selector";
import { useStartArcCheck } from "@/components/unit-inbox/start-unit";
import { CourseFrame } from "@/components/course-page/course-frame";
import { PageFrame } from "@/components/page-frame/page-frame";
import { CourseHead, arcOnPage } from "@/components/course-page/course-head/course-head";
import { openingArc, type CourseArcSection, type CourseView } from "@/components/course-page/course-model";
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
 * and the map draws one arc under the arc strip: opening an arc, or a tab
 * of the strip, shows it on the map, and a tab opens its arc in the list.
 * Above its arcs, where he picks up and what comes next (`WhatNextRows`).
 */
export function SplitCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{({ view, standing, busy, onContinue }) => <SplitBody view={view} standing={standing} busy={busy} onContinue={onContinue} />}</CourseFrame>;
}

/** The page under its head. */
function SplitBody({ view, standing, busy, onContinue }: { view: CourseView; standing: CourseStanding | null; busy: boolean; onContinue: (workspace: string) => void }) {
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
	// The map style's own drawing (map-style.ts), which sizes the pane's surface.
	const { style, skin } = useMapSkin();
	const wholeLayout = useMemo(() => drawingOf(skin, map, undefined).layout, [skin, map]);
	const layout = useMemo(() => (shown ? drawingOf(skin, map, shown.arc.handle).layout : wholeLayout), [skin, shown, map, wholeLayout]);
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
	/** A tab of the strip shows its arc and opens it in the list. */
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

	return (
		<PageFrame className="h-full">
			<div ref={headerBox} className="contents" onKeyDown={onHeaderKeyDown}>
				<CourseHead view={view} standing={standing} busy={busy} onContinue={onContinue} />
			</div>
			{map.topics.length === 0 ? (
				<p data-slot="course-notice" className="flex min-h-8 items-center text-body text-muted-foreground">
					Topics appear as you study this course.
				</p>
			) : (
				<LinkedColumns
					data-slot="course-split"
					list={
						<>
						<WhatNextRows next={view.whatNext} course={view.course} busy={busy} onContinue={onContinue} />
						<SplitList
							ref={list}
							groups={groups}
							arcs={arcs}
							open={open}
							onOpenChange={onOpenChange}
							onCheck={onCheck}
							checking={starting}
							marked={markedOf(pointed)}
							onPoint={pointFrom("list")}
							onEnterMap={(to) => drawing.current?.focus(to)}
							onExitTop={() => action()?.focus()}
						/>
						</>
					}
					map={
						<SplitMap
							key={map.workspace}
							ref={drawing}
							map={map}
							arc={shownArc ?? undefined}
							header={
								arcs &&
								// Every map style but Current names the arcs with the quiet selector (arc-selector.md).
								(style === "current" ? (
									<ArcStrip arcs={arcs.map((a) => ({ handle: a.arc.handle, title: a.arc.title, share: a.share }))} value={shownArc} onSelect={showArc} />
								) : (
									<ArcSelector arcs={arcs.map((a) => ({ handle: a.arc.handle, title: a.arc.title, share: a.share }))} value={shownArc} here={currentArc(map)} onSelect={showArc} />
								))
							}
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
