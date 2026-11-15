"use client";

import Link from "next/link";
import type { CourseMapArc, StudyCourse } from "@/src/core";
import { blurAfterPointerClick } from "@/components/focus-hygiene";
import { arcHref, courseHref } from "@/components/unit-inbox/unit-href";
import { CourseMark, rowSurface } from "@/components/unit-inbox/unit-row";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

/**
 * A course among the search's results (spec: unit-inbox.md, Search), in
 * the shelf row's anatomy (36px): the course's mark, greyed until hovered,
 * and its name. A click opens the course's page. With an `arc`, the row is
 * that arc, "Derivatives, in Calculus I", and opens the course page with
 * the arc unfolded.
 */
export function CourseResultRow({ course, arc, active }: { course: StudyCourse; arc?: CourseMapArc; active: boolean }) {
	const { workspace, title } = course.map;
	return (
		<li data-slot="course-result" data-arc={arc?.handle} className="group/sidebar-row relative list-none">
			<Link
				href={arc ? arcHref(workspace, arc.handle) : courseHref(workspace)}
				onClick={blurAfterPointerClick}
				aria-current={active ? "page" : undefined}
				data-sidebar-row={arc ? `arc:${workspace}#${arc.handle}` : `course:${workspace}`}
				data-testid="course-result"
				className={cn(rowSurface(active), "flex h-9 items-center gap-2 px-2.5")}
			>
				<CourseMark title={title} className={cn(!active && "opacity-40 grayscale group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0")} />
				<span
					className={cn("min-w-0 flex-1 truncate text-control", active ? "text-foreground" : "text-muted-foreground group-hover/sidebar-row:text-foreground")}
				>
					<MathText>{arc ? `${arc.title}, in ${title}` : title}</MathText>
				</span>
			</Link>
		</li>
	);
}
