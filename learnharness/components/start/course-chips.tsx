"use client";

import { PlusIcon } from "lucide-react";
import type { CourseSummary } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { courseChip, type CourseChip } from "@/components/start/course-facts";
import { cn } from "@/lib/utils";

const CHIP = "h-8 rounded-full border border-border px-3 text-row font-normal";

/** Today's courses (spec: course-chips.md): one chip per course under the
 *  composer; a chip starts a session in its course and the tutor takes it
 *  from there (reviews due, then the open task). */
export function CourseChips({
	courses,
	disabled,
	onStart,
	onNewCourse,
}: {
	courses: readonly CourseSummary[];
	disabled: boolean;
	onStart: (chip: CourseChip) => void;
	onNewCourse: () => void;
}) {
	if (courses.length === 0) {
		return (
			<div data-slot="course-chips" className="flex justify-center">
				<Button variant="quiet" data-slot="course-chip" disabled={disabled} onClick={onNewCourse} className={cn(CHIP, "gap-1.5")}>
					<PlusIcon />
					New course
				</Button>
			</div>
		);
	}
	return (
		<ul aria-label="Courses" data-slot="course-chips" className="flex flex-wrap justify-center gap-2">
			{courses.map((course) => {
				const chip = courseChip(course);
				const button = (
					<Button
						variant="quiet"
						data-slot="course-chip"
						disabled={disabled}
						aria-label={chip.hint ? `${chip.title}: ${chip.hint}` : chip.title}
						onClick={() => onStart(chip)}
						className={CHIP}
					>
						{chip.title}
						{chip.due && <span className="-ml-1 tabular-nums">· {chip.due}</span>}
					</Button>
				);
				return <li key={chip.workspace}>{chip.hint ? <Hint label={chip.hint}>{button}</Hint> : button}</li>;
			})}
		</ul>
	);
}
