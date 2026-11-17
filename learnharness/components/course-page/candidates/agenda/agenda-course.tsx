"use client";

import { CourseFrame } from "@/components/course-page/course-frame";
import { SplitBody, type CourseColumns } from "@/components/course-page/split/split-course";
import { SplitList } from "@/components/course-page/split/split-list";
import { AgendaHead } from "@/components/course-page/candidates/agenda/agenda-head";
import { AgendaNext } from "@/components/course-page/candidates/agenda/agenda-next";
import { AgendaArc } from "@/components/course-page/candidates/agenda/agenda-arc";

/** Agenda's left column: Now and Then, then the arc the map shows and its
 *  topics (the map's list of arcs is the course's), or a course's four
 *  groups when it has no arcs. */
function AgendaList(c: CourseColumns) {
	return (
		<>
			<AgendaNext {...c} />
			<SplitList
				ref={c.listRef}
				groups={c.groups}
				arcs={c.view.arcs && c.shown ? [c.shown] : null}
				open={c.open}
				onOpenChange={c.onOpenChange}
				onCheck={c.onCheck}
				checking={c.checking}
				marked={c.marked}
				onPoint={c.onPoint}
				onEnterMap={c.onEnterMap}
				onExitTop={c.onExitTop}
				arcLine={AgendaArc}
			/>
		</>
	);
}

/**
 * The course page's Agenda candidate (spec: agenda.md): the left column
 * answers only "what now", as Anki's deck overview and the topic page's
 * Now do, and leaves the course's parts to the map's list of arcs: Now,
 * with the press; Then; and the arc the map shows. The head is the title
 * and one line, the exam and whether he is ready.
 */
export function AgendaCourse({ workspace }: { workspace: string }) {
	return <CourseFrame workspace={workspace}>{(ready) => <SplitBody {...ready} head={(c) => <AgendaHead {...c} />} list={AgendaList} />}</CourseFrame>;
}
