"use client";

import Link from "next/link";
import type { StudyCourse } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { CourseMark, rowSurface } from "@/components/unit-inbox/unit-row";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/**
 * A course among the search's results (spec: unit-inbox.md, Search), in
 * the shelf row's anatomy (36px): the course's mark, greyed until hovered,
 * and its name. A click opens the course's page.
 */
export function CourseResultRow({ course, active }: { course: StudyCourse; active: boolean }) {
	const { workspace, title } = course.map;
	return (
		<li data-slot="course-result" className="group/sidebar-row relative list-none">
			<Link
				href={courseHref(workspace)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={`course:${workspace}`}
				data-testid="course-result"
				className={cn(rowSurface(active), "flex h-9 items-center gap-2 px-2.5")}
			>
				<CourseMark title={title} className={cn(!active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")} />
				<span
					className={cn("min-w-0 flex-1 truncate text-control", active ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground")}
				>
					<MathText>{title}</MathText>
				</span>
			</Link>
		</li>
	);
}
