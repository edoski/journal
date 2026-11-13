"use client";

import { useRef } from "react";
import { CourseFrame } from "@/components/course-page/course-frame";
import { CourseHeader } from "@/components/course-page/course-header";
import { ListGroups } from "@/components/course-page/list/list-groups";
import { onListClick, onListKeyDown } from "@/components/course-page/list/list-keys";
import { ListWhere } from "@/components/course-page/list/list-where";
import { useListEntry } from "@/components/course-page/list/use-list-entry";

/**
 * The course page candidate "list" (spec: list-course.md): every topic of
 * the course once, in the order he would act. One column the topic page's
 * width under the shared header and where he was: Needs you, Learning, the
 * next topics not started, and Known folded; no map. The arrows walk it,
 * and the wheel scrolls it with no bar showing.
 */
export function ListCourse({ workspace, initialConfigured }: { workspace: string; initialConfigured: boolean }) {
	const root = useRef<HTMLDivElement>(null);
	useListEntry(root);
	return (
		<CourseFrame workspace={workspace} initialConfigured={initialConfigured} className="mx-auto flex w-full max-w-[46rem] flex-col gap-6 px-6 pt-5 pb-6">
			{({ view, busy, onContinue }) => (
				<div ref={root} data-slot="course-list" onKeyDown={onListKeyDown} onClick={onListClick} className="flex flex-col gap-6">
					<div data-slot="course-list-top" className="flex flex-col gap-2">
						<CourseHeader view={view} busy={busy} onContinue={onContinue} />
						<ListWhere view={view} />
					</div>
					<ListGroups view={view} />
				</div>
			)}
		</CourseFrame>
	);
}
