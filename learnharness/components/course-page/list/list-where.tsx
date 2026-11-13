"use client";

import { BookmarkIcon, MapPinIcon, type LucideIcon } from "lucide-react";
import { CURRENT_TAG } from "@/components/course-map/topic-map/topic-standing";
import type { CourseView } from "@/components/course-page/course-model";
import { listWhere } from "@/components/course-page/list/list-plan";
import { MathText } from "@/components/ui/math-text";

/** One line in the header's next line's anatomy: a 16px muted mark, the
 *  thing in full ink, then a few muted words saying what it is to him. */
function Line({ slot, icon: Icon, title, tag }: { slot: string; icon: LucideIcon; title: string; tag: string }) {
	return (
		<p data-slot={slot} className="flex h-5 min-w-0 items-center gap-1.5 text-row text-foreground">
			<Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			<span className="max-w-1/2 shrink-0 truncate">
				<MathText>{title}</MathText>
			</span>
			<span className="ml-1 min-w-0 truncate text-muted-foreground">
				<MathText>{tag}</MathText>
			</span>
		</p>
	);
}

/**
 * Where he was, under the course's header (spec: list-course.md): the
 * topic he is at, "You are here" (the map's tag), and the open task at its
 * step in Today's words. Each line is left out where the header's next
 * line already names it, so back after two weeks he reads where he was
 * before any row.
 */
export function ListWhere({ view }: { view: CourseView }) {
	const { here, task } = listWhere(view);
	if (!here && !task) return null;
	return (
		<>
			{here && <Line slot="course-list-here" icon={MapPinIcon} title={here.title} tag={CURRENT_TAG} />}
			{task && <Line slot="course-list-task" icon={BookmarkIcon} title={task.title} tag={task.step} />}
		</>
	);
}
