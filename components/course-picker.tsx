"use client";

import { useEffect, useState } from "react";
import { GraduationCapIcon } from "lucide-react";
import { courseLabel, type CourseListing, type CourseSummary } from "@/src/core";

/** Where the last picked course is remembered (per device). */
const COURSE_CHOICE_KEY = "lh:course";

/** The registered courses plus the remembered pick. `courses` is null until
 *  the engine answered, and stays null when it cannot run: no picker then. */
export function useCourseChoice(): {
	courses: CourseSummary[] | null;
	workspace: string;
	choose: (workspace: string) => void;
} {
	const [courses, setCourses] = useState<CourseSummary[] | null>(null);
	const [workspace, setWorkspace] = useState("");
	useEffect(() => {
		let live = true;
		void fetch("/api/courses")
			.then((r) => r.json() as Promise<CourseListing>)
			.then((listing) => {
				if (!live || !listing.available || listing.courses.length === 0) return;
				setCourses(listing.courses);
				const remembered = localStorage.getItem(COURSE_CHOICE_KEY) ?? "";
				if (listing.courses.some((c) => c.workspace === remembered)) setWorkspace(remembered);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);
	const choose = (next: string) => {
		setWorkspace(next);
		if (next) localStorage.setItem(COURSE_CHOICE_KEY, next);
		else localStorage.removeItem(COURSE_CHOICE_KEY);
	};
	return { courses, workspace, choose };
}

/** The composer row's course pill: which course record the new session
 *  studies from and saves into. "No course" keeps no record at all. */
export function CoursePicker({ courses, workspace, onChange }: {
	courses: readonly CourseSummary[];
	workspace: string;
	onChange: (workspace: string) => void;
}) {
	return (
		<label
			data-testid="course-picker"
			className={
				"relative flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-xs transition-colors hover:bg-accent " +
				(workspace ? "border-border bg-card text-foreground" : "border-dashed border-border/80 text-muted-foreground hover:text-foreground")
			}
		>
			<GraduationCapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
			<span className="max-w-[16rem] truncate">
				{courseLabel(courses.find((c) => c.workspace === workspace) ?? { workspace: "", title: "No course" })}
			</span>
			<select
				aria-label="Course"
				value={workspace}
				onChange={(e) => onChange(e.target.value)}
				className="absolute inset-0 cursor-pointer opacity-0"
			>
				<option value="">No course</option>
				{courses.map((c) => (
					<option key={c.workspace} value={c.workspace}>
						{courseLabel(c)}
						{c.due > 0 ? ` (${c.due} due)` : ""}
					</option>
				))}
			</select>
		</label>
	);
}
