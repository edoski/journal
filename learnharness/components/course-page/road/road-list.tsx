"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { ArcHandle, StudyCourse } from "@/src/core";
import { ExamFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import type { CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { BLOCK, Rail, RoadArc, type ArcLineProps } from "@/components/course-page/road/road-arc";
import { arcStarts, examStop } from "@/components/course-page/road/road-model";
import { useStartScope } from "@/components/start/start-scope";
import { arcCheckCreation } from "@/components/unit-inbox/start-unit";
import type { CourseArcSection } from "@/components/course-page/course-model";
import { cn } from "@/lib/utils";

/** The exam as a row on the road's track: its day, its run-up on press. */
function ExamStop({ course, words }: { course: StudyCourse; words: string }) {
	const runup = useCourseRunup(course.map.workspace);
	return (
		<div data-slot="road-exam" className={cn(BLOCK, "flex h-7 items-center gap-2 text-callout text-foreground")}>
			<Rail />
			<CalendarIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
			<ExamFact course={course} runup={runup} words={words} ready={null} className="[&>svg]:hidden" />
		</div>
	);
}

/** How long the walk rests on an arc before the map shows it. */
const MAP_FOLLOW_MS = 120;

/** What every line of the road reads: the course, the arc the map shows, where the exam sits. */
const Road = createContext<{
	course: StudyCourse;
	shown: ArcHandle | null;
	exam: string | null;
	stopBefore: ArcHandle | null;
	past: ReadonlySet<ArcHandle>;
	order: readonly ArcHandle[];
} | null>(null);

/** One arc of the road, with the facts the road gives it, and the exam's row before it when the plan reaches the exam there. */
function RoadLine(props: ArcLineProps) {
	const road = useContext(Road)!;
	const { handle } = props.section.arc;
	return (
		<>
			{road.exam !== null && road.stopBefore === handle && <ExamStop course={road.course} words={road.exam} />}
			<RoadArc {...props} number={road.order.indexOf(handle) + 1} starts={arcStarts(props.section, road.course.map.today)} shown={road.shown === handle} past={road.past.has(handle)} />
		</>
	);
}

/**
 * The course page's left column, the road (spec: road.md): every arc of the
 * course in study order on one track, as the map's arc list draws them (the
 * map beside it lists none), the exam a row where the plan reaches it; a
 * course's four groups when it has no arcs. Check it starts the arc's check
 * through the page's one start (`StartScope`).
 */
export function RoadList(c: CourseColumns) {
	const { course, arcs, facts } = c.view;
	const stop = useMemo(() => (arcs ? examStop(course.map, arcs) : null), [course.map, arcs]);
	const { start, starting } = useStartScope();
	const onCheck = (section: CourseArcSection) =>
		start(arcCheckCreation(course.map.workspace, section.arc, section.topics.filter((t) => t.topic.excluded === undefined).map((t) => t.topic.handle)), { key: section.arc.handle });
	// One arc open at a time, the one the map shows: opening another shows it and closes the last; closing it
	// leaves none open (Edo, 17 Nov 2026: "only one is open at a time").
	const shownHandle = c.shown?.arc.handle ?? null;
	const [openArc, setOpenArc] = useState<string | null>(shownHandle);
	useEffect(() => setOpenArc(shownHandle), [shownHandle]);
	const open = arcs ? (openArc ? { [openArc]: true } : {}) : c.open;
	// The list opens at once; the map, whose redraw is the slow part, follows once the walk rests on an arc,
	// so arrows held down never outrun the list.
	const follow = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(follow.current), []);
	const onOpenChange = (id: string, to: boolean) => {
		if (!arcs) return c.onOpenChange(id, to);
		if (to) {
			setOpenArc(id);
			clearTimeout(follow.current);
			follow.current = setTimeout(() => c.showArc(id as ArcHandle), MAP_FOLLOW_MS);
		} else if (openArc === id) setOpenArc(null);
	};
	const road = useMemo(
		() => ({
			course,
			shown: c.shown?.arc.handle ?? null,
			exam: stop ? facts.exam : null,
			stopBefore: stop?.stopBefore ?? null,
			past: stop?.past ?? new Set<ArcHandle>(),
			order: arcs?.map((a) => a.arc.handle) ?? [],
		}),
		[course, c.shown, stop, facts.exam, arcs],
	);
	return (
		<Road.Provider value={road}>
			<SplitList
				ref={c.listRef}
				groups={c.groups}
				arcs={arcs}
				open={open}
				onOpenChange={onOpenChange}
				onCheck={onCheck}
				checking={starting}
				marked={c.marked}
				onPoint={c.onPoint}
				onEnterMap={c.onEnterMap}
				onExitTop={c.onExitTop}
				arcLine={RoadLine}
				after={arcs && road.exam && stop && stop.stopBefore === null ? <ExamStop course={course} words={road.exam} /> : undefined}
			/>
		</Road.Provider>
	);
}
