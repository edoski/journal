"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useHomeVariant, type HomeVariant } from "@/components/design-variant";
import type { TopicHandle } from "@/src/core";

/** The map's share of the column while Today shows: enough to see where
 *  the current topic sits, so Today's rows lead (Edo, 12 Nov 2026). */
const MAP_SHARE = "basis-1/2";

/** How long the pointer rests on a Today line before the map follows it, so
 *  crossing lines on the way up to the map does not flip it course by course. */
const FOLLOW_DWELL_MS = 150;

/**
 * The agenda study home (spec: study-home.md): what to study now, in one
 * window. A course's map on top behind course tabs, then Today, a line per step of today's plan. The
 * map follows Today: it shows the course of the line he points at, with
 * that line's topics lit and, in a course with arcs, the arc they lie in
 * picked on the map's arc strip (home-map.md); while he points at the line,
 * the map brings those topics into view.
 */
export function StudyHome() {
	const [enlarged, setEnlarged] = useState(false);
	const variant = useHomeVariant();

	return (
		<HomeFrame quiet={enlarged} className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && HOME_WIDTH[variant])}>
			{(ready) => <HomeBody ready={ready} enlarged={enlarged} onEnlarge={setEnlarged} standing={variant === "proposed"} />}
		</HomeFrame>
	);
}

/** Home's column by variant: Current as it was; Proposed as wide as the
 *  course page's frame (`PageFrame`), so the map has more room and the
 *  rows room for the standing (Edo's notes, 15 Nov 2026, N1). */
export const HOME_WIDTH: Record<HomeVariant, string> = {
	current: "max-w-[60rem]",
	proposed: "max-w-[80rem]",
};

/** What picks the map's course: a Today line he points at, or a tab he chose. */
type Chosen = { by: "line"; key: string } | { by: "tab"; workspace: string };

export function HomeBody({ ready, enlarged, onEnlarge, standing = false }: { ready: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void; standing?: boolean }) {
	const { rows, courses, chats, done, exam, busy, onContinue } = ready;
	const router = useRouter();
	const [chosen, setChosen] = useState<Chosen | null>(null);
	// The line under the pointer or holding focus, if any: only then does the line the map follows wear its fill, so
	// no row has a card behind it at rest.
	const [pointingAt, setPointingAt] = useState<string | null>(null);
	const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(dwell.current), []);

	const followed = chosen?.by !== "tab" ? followedRow(rows, chosen?.by === "line" ? chosen.key : null) : null;
	const workspace = chosen?.by === "tab" ? chosen.workspace : (followed?.course?.map.workspace ?? courses[0]!.map.workspace);
	const lesson = useMemo(() => (followed ? lessonOf(followed) : null), [followed]);
	const highlight = useMemo<ReadonlySet<TopicHandle> | null>(() => (lesson?.topics.length ? new Set(lesson.topics) : null), [lesson]);
	const pointed = followed && pointingAt === lineKey(followed) ? pointingAt : null;
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

	const onPoint = (row: TodayRow, by: "pointer" | "focus") => {
		clearTimeout(dwell.current);
		setPointingAt(lineKey(row));
		const pick = () => setChosen({ by: "line", key: lineKey(row) });
		if (by === "focus") pick();
		else dwell.current = setTimeout(pick, FOLLOW_DWELL_MS);
	};

	return (
		<>
			<div className={cn("flex min-h-0 flex-col", enlarged ? "flex-1" : cn(MAP_SHARE, "min-h-48 shrink"))}>
				<HomeMap
					courses={courses}
					chats={chats}
					workspace={workspace}
					onSelect={(ws) => setChosen({ by: "tab", workspace: ws })}
					highlight={highlight}
					framed={pointed && !enlarged ? highlight : null}
					arc={lesson?.place?.handle ?? null}
					enlarged={enlarged}
					onEnlarge={onEnlarge}
				/>
			</div>
			{!enlarged && (
				<Today
					standing={standing}
					rows={rows}
					done={done}
					exam={exam}
					busy={busy}
					onContinue={onContinue}
					pointed={pointed}
					onPoint={onPoint}
					onPointEnd={() => {
						clearTimeout(dwell.current);
						setPointingAt(null);
					}}
				/>
			)}
		</>
	);
}
