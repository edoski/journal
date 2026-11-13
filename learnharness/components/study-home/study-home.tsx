"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useOverviewVariant } from "@/components/design-variant";
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
 * window. A course's map on top behind course tabs, then Today, one line per course. Under the
 * Overview switch's follow the map shows the course of the Today line he
 * points at, with that line's topics lit (home-map.md).
 */
export function StudyHome({ initialConfigured }: { initialConfigured: boolean }) {
	const [enlarged, setEnlarged] = useState(false);

	return (
		<HomeFrame
			initialConfigured={initialConfigured}
			quiet={enlarged}
			className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[60rem]")}
		>
			{(ready) => <HomeBody ready={ready} enlarged={enlarged} onEnlarge={setEnlarged} />}
		</HomeFrame>
	);
}

/** What picks the map's course: a Today line he points at, or a tab he chose. */
type Chosen = { by: "line"; key: string } | { by: "tab"; workspace: string };

/** Up and Down walk Today's lines from anywhere on Home that is not a
 *  field, the map or the sidebar: from nothing focused, Down takes the
 *  first line and Up the last. Tab is off app-wide (Edo's ruling), so this
 *  is how the keyboard reaches them. */
function useLineKeys(enabled: boolean) {
	useEffect(() => {
		if (!enabled) return;
		const onKey = (event: KeyboardEvent) => {
			if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			const lines = [...document.querySelectorAll<HTMLElement>('[data-slot="today"] [data-slot="today-line"]')];
			if (lines.length === 0) return;
			const active = document.activeElement as HTMLElement | null;
			const at = active ? lines.indexOf(active) : -1;
			if (at < 0 && active && active !== document.body) return;
			event.preventDefault();
			const next = at < 0 ? (event.key === "ArrowDown" ? 0 : lines.length - 1) : Math.min(lines.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)));
			lines[next]!.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enabled]);
}

function HomeBody({ ready, enlarged, onEnlarge }: { ready: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void }) {
	const { rows, courses, today, busy, onStart, onContinue } = ready;
	const follow = useOverviewVariant() === "follow";
	const [chosen, setChosen] = useState<Chosen | null>(null);
	const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(dwell.current), []);
	useLineKeys(!enlarged);

	const followed = follow && chosen?.by !== "tab" ? followedRow(rows, chosen?.by === "line" ? chosen.key : null) : null;
	const workspace = chosen?.by === "tab" ? chosen.workspace : (followed?.course?.map.workspace ?? courses[0]!.map.workspace);
	const highlight = useMemo<ReadonlySet<TopicHandle> | null>(() => {
		const topics = followed ? lessonOf(followed).topics : [];
		return topics.length ? new Set(topics) : null;
	}, [followed]);

	const onPoint = (row: TodayRow, by: "pointer" | "focus") => {
		clearTimeout(dwell.current);
		const pick = () => setChosen({ by: "line", key: lineKey(row) });
		if (by === "focus") pick();
		else dwell.current = setTimeout(pick, FOLLOW_DWELL_MS);
	};

	return (
		<>
			<div className={cn("flex min-h-0 flex-col", enlarged ? "flex-1" : cn(MAP_SHARE, "min-h-48 shrink"))}>
				<HomeMap
					courses={courses}
					workspace={workspace}
					onSelect={(ws) => setChosen({ by: "tab", workspace: ws })}
					highlight={highlight}
					enlarged={enlarged}
					onEnlarge={onEnlarge}
					onStudy={(topic, ws) => onStart(topic.title, ws)}
					busy={busy}
				/>
			</div>
			{!enlarged && (
				<Today
					rows={rows}
					today={today}
					busy={busy}
					onContinue={onContinue}
					{...(follow && { pointed: followed ? lineKey(followed) : null, onPoint, onPointEnd: () => clearTimeout(dwell.current) })}
				/>
			)}
		</>
	);
}
