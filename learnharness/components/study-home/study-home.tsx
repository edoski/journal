"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeFrame, type HomeReady } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { neighbourCourse, useHomeKeys } from "@/components/study-home/home-keys";
import { followedRow, lineKey } from "@/components/study-home/agenda-rows/row-facts";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { TodayRow } from "@/components/study-home/study-facts";
import { Today } from "@/components/study-home/today";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { cn } from "@/lib/utils";
import { PAGE_COLUMN } from "@/components/page-frame/page-frame";
import type { TopicHandle } from "@/src/core";
import { useMapTie, type PointBy } from "@/components/course-map/use-map-tie";

/** The map's share of the column while Today shows: enough to see where
 *  the current topic sits, so Today's rows lead (Edo, 12 Nov 2026). */
const MAP_SHARE = "basis-1/2";

/**
 * The agenda study home (spec: study-home.md): what to study now, in one
 * window. A course's map on top behind course tabs, then Today, a line per step of today's plan. The
 * map follows Today: it shows the course of the line he points at, with
 * that line's topics lit and, in a course with arcs, the arc they lie in
 * shown on the map (home-map.md); while he points at the line, its first
 * topic's card glows and the map brings its topics into view, through the
 * maps' one tie (`useMapTie`, the course page's and the topic page's).
 */
export function StudyHome() {
	const [enlarged, setEnlarged] = useState(false);

	return (
		<HomeFrame quiet={enlarged} className={cn("flex h-full flex-col gap-5", HOME_FRAME, enlarged ? "max-w-none" : HOME_WIDTH)}>
			{(ready) => <HomeBody ready={ready} enlarged={enlarged} onEnlarge={setEnlarged} />}
		</HomeFrame>
	);
}

/** Home's column: as wide as the course page's frame (`PageFrame`), so the
 *  map has room and the rows room for the standing (Edo's notes, 15 Nov
 *  2026, N1). The map enlarged takes the whole window's width. */
export const HOME_WIDTH = "max-w-[80rem]";

/** Home's edges: the pages' own column (`PAGE_COLUMN`). Its first row, the
 *  course tabs (32px), is centred on the band's centre line
 *  (`--lh-band-centre`), as a lesson's top bar and the calendar's toolbar are, so the folded rail's
 *  open button and the traffic lights stand on the same line (Edo, 16 Nov
 *  2026: the button "should be vertically aligned with the course page
 *  titles on the homepage"). */
const HOME_FRAME = cn(PAGE_COLUMN, "pt-[calc(var(--lh-band-centre)-1rem)]");

/** What picks the map's course: a Today line he points at, or a tab he chose. */
type Chosen = { by: "line"; key: string } | { by: "tab"; workspace: string };

export function HomeBody({ ready, enlarged, onEnlarge }: { ready: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void }) {
	const { rows, courses, chats, done, exam, busy, onContinue } = ready;
	const router = useRouter();
	const [chosen, setChosen] = useState<Chosen | null>(null);
	// The line he points at, once the pointer rests or the focus lands, moves the map to its course and lights its
	// topics alone (the maps' tie, `useMapTie`); the map stays on that line once he leaves it.
	const tie = useMapTie({ onHold: (at) => setChosen({ by: "line", key: at.key }) });

	const followed = chosen?.by !== "tab" ? followedRow(rows, chosen?.by === "line" ? chosen.key : null) : null;
	const workspace = chosen?.by === "tab" ? chosen.workspace : (followed?.course?.map.workspace ?? courses[0]!.map.workspace);
	const lesson = useMemo(() => (followed ? lessonOf(followed) : null), [followed]);
	const followedTopics = useMemo<ReadonlySet<TopicHandle> | null>(() => (lesson?.topics.length ? new Set(lesson.topics) : null), [lesson]);
	// Only the line the map follows wears its fill while he points at it, so no row has a card behind it at rest.
	const pointed = followed && tie.pointed?.key === lineKey(followed) ? tie.pointed.key : null;
	useHomeKeys({
		moveCourse: (step) => {
			const next = neighbourCourse(
				courses.map((c) => c.map.workspace),
				workspace,
				step,
			);
			if (next) setChosen({ by: "tab", workspace: next });
			return next !== null;
		},
		enlarge: () => onEnlarge(!enlarged),
		openCoursePage: (line) => {
			const course = rows.find((row) => lineKey(row) === line)?.course;
			if (course) router.push(courseHref(course.map.workspace));
		},
		openShownCoursePage: () => router.push(courseHref(workspace)),
	});

	const onPoint = (row: TodayRow, by: PointBy) => tie.point("list", { key: lineKey(row), topics: lessonOf(row).topics }, by);

	return (
		<>
			<div className={cn("flex min-h-0 flex-col", enlarged ? "flex-1" : cn(MAP_SHARE, "min-h-48 shrink"))}>
				<HomeMap
					courses={courses}
					chats={chats}
					workspace={workspace}
					onSelect={(ws) => setChosen({ by: "tab", workspace: ws })}
					highlight={tie.lights.lit ?? followedTopics}
					marked={tie.lights.glow}
					framed={enlarged ? null : tie.lights.framed}
					arc={lesson?.place?.handle ?? null}
					enlarged={enlarged}
					onEnlarge={onEnlarge}
				/>
			</div>
			{!enlarged && (
				<Today
					rows={rows}
					done={done}
					exam={exam}
					busy={busy}
					onContinue={onContinue}
					pointed={pointed}
					onPoint={onPoint}
					onPointEnd={(by) => tie.point("list", null, by)}
				/>
			)}
		</>
	);
}
