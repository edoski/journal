"use client";

import type { CourseSummary } from "@/src/core";
import { Button } from "@/components/ui/button";
import { courseLines } from "@/components/start/today-b/course-lines-facts";

/** Candidate B (spec: course-lines.md): one quiet two-line row per course
 *  saying what is next; a row starts a session in its course. */
export function CourseLinesToday({
	courses,
	busy,
	onStart,
}: {
	courses: readonly CourseSummary[];
	busy: boolean;
	onStart: (workspace: string) => void;
}) {
	return (
		<ul aria-label="Courses" data-slot="today-lines" className="flex flex-col">
			{courseLines(courses).map((line) => (
				<li key={line.workspace}>
					<Button
						variant="quiet"
						data-slot="today-line"
						disabled={busy}
						onClick={() => onStart(line.workspace)}
						className="h-auto min-h-13 w-full flex-col items-stretch gap-0.5 rounded-lg px-4 py-2 text-left font-normal whitespace-normal"
					>
						<span className="flex items-baseline justify-between gap-4">
							<span className="text-control font-medium text-foreground">{line.course}</span>
							{line.exam && <span className="shrink-0 text-row tabular-nums">{line.exam}</span>}
						</span>
						<span className="text-row">{line.next}</span>
					</Button>
				</li>
			))}
		</ul>
	);
}
