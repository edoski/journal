"use client";

import { useState } from "react";
import { HomeFrame } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { Today } from "@/components/study-home/today";
import { cn } from "@/lib/utils";
import type { StudyCourse } from "@/src/core";

/**
 * The agenda study home (spec: study-home.md): what to study now, in one
 * window. The selected course's map on top, then Today, one line per
 * course.
 */
export function StudyHome({ initialConfigured }: { initialConfigured: boolean }) {
	const [enlarged, setEnlarged] = useState(false);

	return (
		<HomeFrame
			initialConfigured={initialConfigured}
			quiet={enlarged}
			className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[60rem]")}
		>
			{({ rows, courses, today, busy, onStart, onContinue }) => (
				<>
					<MapOnHome courses={courses} enlarged={enlarged} onEnlarge={setEnlarged} busy={busy} onStart={onStart} />
					{!enlarged && <Today rows={rows} today={today} busy={busy} onContinue={onContinue} />}
				</>
			)}
		</HomeFrame>
	);
}

/** The map of one course, with the courses as tabs in Today's order; it
 *  opens on the course of Today's first line. */
function MapOnHome({
	courses,
	enlarged,
	onEnlarge,
	busy,
	onStart,
}: {
	courses: readonly StudyCourse[];
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	busy: boolean;
	onStart: (opening: string, workspace: string) => void;
}) {
	const [workspace, setWorkspace] = useState(() => courses[0]!.map.workspace);
	return (
		<HomeMap
			courses={courses}
			workspace={workspace}
			onSelect={setWorkspace}
			enlarged={enlarged}
			onEnlarge={onEnlarge}
			onStudy={(topic, ws) => onStart(topic.title, ws)}
			busy={busy}
		/>
	);
}
