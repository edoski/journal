"use client";

import { createContext, useContext, useMemo, type ComponentProps } from "react";
import type { ArcHandle, StudyCourse } from "@/src/core";
import { PageHead } from "@/components/page-frame/page-frame";
import { CourseFrame } from "@/components/course-page/course-frame";
import type { CourseArc } from "@/components/course-page/course-arc";
import type { CourseTopic } from "@/components/course-page/course-model";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";
import { SplitBody, type CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { ReadyFact, useHeadStanding } from "@/components/course-page/candidates/shared/ready-fact";
import { RoadArc, TRACK } from "@/components/course-page/candidates/road/road-arc";
import { arcStarts, examStop } from "@/components/course-page/candidates/road/road-model";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Road's head (spec: road.md): the title with Mistakes, Context and the
 *  press, and one line, whether he is ready (`ReadyFact`) and when he last
 *  studied; the exam is a stop on the road below. */
function RoadHead({ view, standing, busy, onContinue }: CourseColumns) {
	const { course, facts } = view;
	const { ready, mistakes } = useHeadStanding(view, standing);
	return (
		<MistakesHead>
			<PageHead
				compact
				title={<span data-slot="course-title">{course.map.title}</span>}
				actions={
					<>
						<MistakesPress rows={mistakes} />
						<ContextButton course={course} />
						<CourseAction view={view} busy={busy} onContinue={onContinue} />
					</>
				}
				standing={
					<>
						<ReadyFact view={view} ready={ready} />
						{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
					</>
				}
			>
				<LessonError />
			</PageHead>
		</MistakesHead>
	);
}

/** The exam as a row on the road's track: its day, its run-up on press. */
function ExamStop({ course, words }: { course: StudyCourse; words: string }) {
	const runup = useCourseRunup(course.map.workspace);
	return (
		<div data-slot="road-exam" className={cn(TRACK, "flex h-7 items-center gap-2 text-callout text-foreground")}>
			<CalendarIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
			<ExamFact course={course} runup={runup} words={words} ready={null} className="[&>svg]:hidden" />
		</div>
	);
}

/** What every line of the road reads: the course, the arc the map shows, where the exam sits. */
const Road = createContext<{ course: StudyCourse; shown: ArcHandle | null; exam: string | null; stopBefore: ArcHandle | null; past: ReadonlySet<ArcHandle>; order: readonly ArcHandle[] } | null>(null);

/** One arc of the road, with the facts the road gives it, and the exam's row before it when the plan reaches the exam there. */
function RoadLine(props: ComponentProps<typeof CourseArc<CourseTopic>>) {
	const road = useContext(Road)!;
	const { handle } = props.section.arc;
	return (
		<>
			{road.exam !== null && road.stopBefore === handle && <ExamStop course={road.course} words={road.exam} />}
			<RoadArc {...props} number={road.order.indexOf(handle) + 1} starts={arcStarts(props.section, road.course.map.today)} shown={road.shown === handle} past={road.past.has(handle)} />
		</>
	);
}

/** Road's left column: every arc of the course in study order on one track, as the map's arc list draws
 *  them (the map beside it lists none), the exam a row where the plan reaches it; a course's four groups
 *  when it has no arcs. */
function RoadList(c: CourseColumns) {
	const { course, arcs, facts } = c.view;
	const stop = useMemo(() => (arcs ? examStop(course.map, arcs) : null), [course.map, arcs]);
	const road = useMemo(
		() => ({ course, shown: c.shown?.arc.handle ?? null, exam: stop ? facts.exam : null, stopBefore: stop?.stopBefore ?? null, past: stop?.past ?? new Set<ArcHandle>(), order: arcs?.map((a) => a.arc.handle) ?? [] }),
		[course, c.shown, stop, facts.exam, arcs],
	);
	return (
		<Road.Provider value={road}>
			<SplitList
				ref={c.listRef}
				groups={c.groups}
				arcs={arcs}
				open={c.open}
				onOpenChange={c.onOpenChange}
				onCheck={c.onCheck}
				checking={c.checking}
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

/**
 * The course page's Road candidate (spec: road.md): the course as a road
 * to its exam, as Things puts a deadline beside its headings and Duolingo
 * draws a path: the arcs in study order on one track, each saying only
 * what the road needs, the exam a stop where the plan reaches it, and the
 * arcs past it muted. The head is the title and one line.
 */
export function RoadCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <SplitBody {...ready} head={(c) => <RoadHead {...c} />} list={(c) => <RoadList {...c} />} mapIndex={false} />}</CourseFrame>;
}
