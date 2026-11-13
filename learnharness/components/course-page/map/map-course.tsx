"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { TopicHandle } from "@/src/core";
import { CourseFrame } from "@/components/course-page/course-frame";
import { CourseHeader } from "@/components/course-page/course-header";
import type { CourseView } from "@/components/course-page/course-model";
import { CourseLegend } from "./course-legend";
import { CourseMapPane, type CourseMapPaneHandle } from "./course-map-pane";
import { legendFacts, legendLight, litFact, NOTHING_LIT } from "./map-plan";
import { isNoteFact, type NoteFact } from "./topic-note";

/**
 * The course page candidate "map" (spec: map-course.md): the whole course
 * in one picture. Under the shared header, one line of the page's groups,
 * each its map mark and its count, which lights its topics on the map, then
 * the topic map given the rest of the window.
 */
export function MapCourse({ workspace, initialConfigured }: { workspace: string; initialConfigured: boolean }) {
	return (
		<CourseFrame workspace={workspace} initialConfigured={initialConfigured} className="flex h-full w-full flex-col px-8 pt-5">
			{({ view, busy, onContinue }) => (
				<>
					<CourseHeader view={view} busy={busy} onContinue={onContinue} />
					<CourseMapBody view={view} />
				</>
			)}
		</CourseFrame>
	);
}

/** The legend and the map, or one sentence for a course with no topics. */
function CourseMapBody({ view }: { view: CourseView }) {
	const { map } = view.course;
	const facts = useMemo(() => legendFacts(view.groups), [view.groups]);
	const [light, dispatch] = useReducer(legendLight, NOTHING_LIT);
	const pane = useRef<CourseMapPaneHandle>(null);
	const legend = useRef<HTMLDivElement>(null);
	const shown = litFact(light);
	const lit = facts.find((f) => f.id === shown) ?? null;
	// The facts a node leaves unsaid ("Back Fri 13 Nov", "At part (c)"), under the lit group's topics.
	const notes = useMemo(() => {
		const group = view.groups.find((g) => g.id === shown);
		return group ? new Map(group.topics.flatMap((t): [TopicHandle, NoteFact][] => (isNoteFact(t.fact) ? [[t.topic.handle, t.fact]] : []))) : null;
	}, [view.groups, shown]);
	const anyLit = shown !== null || light.pinned !== null;

	// Esc lets go of whatever the legend lit, from anywhere on the page. A
	// lit map is a surfaced layer, so it claims the Esc at the document, as
	// the app's one-Esc rule asks (keyboard-shortcuts.tsx).
	useEffect(() => {
		if (!anyLit) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			event.stopPropagation();
			dispatch({ type: "escape" });
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [anyLit]);

	if (map.topics.length === 0) {
		return (
			<p data-slot="course-map-empty" className="mt-2 text-row text-muted-foreground">
				No topics yet. They appear as you study this course.
			</p>
		);
	}
	return (
		<>
			<CourseLegend
				ref={legend}
				facts={facts}
				pinned={light.pinned}
				onPin={(id) => dispatch({ type: "press", id })}
				onPoint={(id) => dispatch({ type: "point", id })}
				onFocusFact={(id) => dispatch({ type: "focus", id })}
				onLeave={() => pane.current?.focus()}
			/>
			<CourseMapPane
				ref={pane}
				map={map}
				highlight={lit?.topics ?? null}
				reveal={lit?.topics ?? null}
				notes={notes}
				startAt={view.next.lesson.topics[0] ?? null}
				onTop={() => legend.current?.querySelector<HTMLButtonElement>("[data-slot=course-legend-fact][data-state=on], [data-slot=course-legend-fact]")?.focus()}
			/>
		</>
	);
}
