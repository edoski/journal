"use client";

import { MISTAKE_WORDS } from "@/components/study-words";
import { useStartUnit } from "@/components/unit-inbox/start-unit";
import { CourseGroup } from "@/components/course-page/course-group";
import { MistakeLine } from "@/components/course-page/standing/mistake-list";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";

/** Mistakes to fix, under the list (the `arcs` candidate): one quiet group
 *  of the open mistakes, newest first, open on arrival and folded by its
 *  header. Absent when none is open. */
export function MistakesSection({ rows }: { rows: readonly MistakeRow[] }) {
	const { start, starting } = useStartUnit();
	if (rows.length === 0) return null;
	return (
		<CourseGroup
			data-slot="course-mistakes"
			title={MISTAKE_WORDS.title}
			items={rows}
			foldable
			className="mt-4"
			renderItem={(row) => <MistakeLine key={row.topic.handle} row={row} start={start} starting={starting} />}
		/>
	);
}
