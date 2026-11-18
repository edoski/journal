"use client";

import Link from "next/link";
import type { UnreadableCourse } from "@/src/core";
import { SidebarNote } from "@/components/unit-inbox/sidebar-note";
import { courseHref } from "@/components/unit-inbox/unit-href";

/** A course whose record can't be read, as the list's quiet note under
 *  Today's cards (spec: inbox-today.md), the way Home says it under Today:
 *  a fault of the course, never a card that reads as a session (round 14,
 *  4 free: "Real Analysis · Couldn't read this course's record" sat among
 *  the sessions). Its name opens its course page, which says why. */
export function UnreadableNote({ course }: { course: UnreadableCourse }) {
	return (
		<SidebarNote>
			<Link href={courseHref(course.workspace)} data-slot="unreadable-note" className="hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
				Couldn’t read {course.title}’s record
			</Link>
		</SidebarNote>
	);
}
