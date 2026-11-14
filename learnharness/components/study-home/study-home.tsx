"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HomeFrame, type HomeReady } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { followedRow, lineKey } from "@/components/study-home/agenda-rows/row-facts";
import { lessonOf } from "@/components/study-home/lesson-facts";
import type { TodayRow } from "@/components/study-home/study-facts";
import { Today } from "@/components/study-home/today";
import { cn } from "@/lib/utils";
import type { TopicHandle } from "@/src/core";

/** The map's share of the column while Today shows: enough to see where
 *  the current topic sits, so Today's rows lead (Edo, 12 Nov 2026). */
const MAP_SHARE = "basis-1/2";

/** How long the pointer rests on a Today line before the map follows it, so
 *  crossing lines on the way up to the map does not flip it course by course. */
const FOLLOW_DWELL_MS = 150;

/**
 * The agenda study home (spec: study-home.md): what to study now, in one
 * window. A course's map on top behind course tabs, then Today, one line per course. The
 * map follows Today: it shows the course of the line he points at, with
 * that line's topics lit and, in a course with arcs, the arc they lie in
 * picked on the map's arc strip (home-map.md).
 */
export function StudyHome() {
	const [enlarged, setEnlarged] = useState(false);

	return (
		<HomeFrame
			quiet={enlarged}
			className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[60rem]")}
		>
			{(ready) => <HomeBody ready={ready} enlarged={enlarged} onEnlarge={setEnlarged} />}
		</HomeFrame>
	);
}

/** What picks the map's course: a Today line he points at, or a tab he chose. */
type Chosen = { by: "line"; key: string } | { by: "tab"; workspace: string };

function HomeBody({ ready, enlarged, onEnlarge }: { ready: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void }) {
	const { rows, courses, chats, done, busy, onContinue } = ready;
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
					arc={lesson?.place?.handle ?? null}
					enlarged={enlarged}
					onEnlarge={onEnlarge}
				/>
			</div>
			{!enlarged && (
				<Today
					rows={rows}
					done={done}
					busy={busy}
					onContinue={onContinue}
					pointed={followed && pointingAt === lineKey(followed) ? pointingAt : null}
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
