"use client";

import { PlusIcon } from "lucide-react";
import type { CourseSummary } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { courseLine, type CourseLine } from "@/components/start/course-facts";

/** Today's courses (spec: course-lines.md): one entry per course with the
 *  engine's facts (exam countdown, reviews due, the open task's step) and
 *  its two ways in, Review and Continue. */
export function CourseLines({
	courses,
	disabled,
	onReview,
	onContinue,
	onNewCourse,
}: {
	courses: readonly CourseSummary[];
	disabled: boolean;
	onReview: (line: CourseLine) => void;
	onContinue: (line: CourseLine) => void;
	onNewCourse: () => void;
}) {
	if (courses.length === 0) {
		return (
			<div data-slot="course-lines" className="flex items-center justify-between gap-4 px-4">
				<p className="text-row text-muted-foreground">No courses yet.</p>
				<Button variant="quiet" data-slot="course-action" onClick={onNewCourse} className="h-8 gap-1.5 px-3 text-row font-normal">
					<PlusIcon className="size-4" />
					New course
				</Button>
			</div>
		);
	}
	return (
		<ul aria-label="Courses" data-slot="course-lines" className="flex flex-col gap-1">
			{courses.map((course) => {
				const line = courseLine(course);
				const facts = [line.exam, line.reviews].filter(Boolean).join(" · ");
				return (
					<li key={line.workspace} data-slot="course-line" className="flex min-h-14 items-center gap-4 pl-4 pr-2">
						<div className="min-w-0 flex-1">
							<p className="flex min-w-0 items-baseline gap-2 text-row">
								<span className="shrink-0 font-medium text-foreground">{line.title}</span>
								{facts && <span className="truncate text-muted-foreground">{facts}</span>}
							</p>
							{line.next && <p className="truncate text-row text-muted-foreground">{line.next}</p>}
						</div>
						<div className="flex shrink-0 items-center gap-1">
							{line.review && (
								<Button
									variant="quiet"
									data-slot="course-action"
									disabled={disabled}
									aria-label={`Review ${line.title}`}
									onClick={() => onReview(line)}
									className="h-8 px-3 text-row font-normal"
								>
									Review
								</Button>
							)}
							{line.continue && (
								<Hint label={line.continue.hint}>
									<Button
										variant="quiet"
										data-slot="course-action"
										disabled={disabled}
										aria-label={`Continue ${line.title}`}
										onClick={() => onContinue(line)}
										className="h-8 px-3 text-row font-normal"
									>
										Continue
									</Button>
								</Hint>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
