"use client";

import { useMemo } from "react";
import { ArcPill } from "@/components/course-map/arc-strip";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { PageHead } from "@/components/page-frame/page-frame";
import type { CourseStanding } from "@/src/core";
import type { CourseView } from "@/components/course-page/course-model";
import { ContextButton, CourseAction, ExamFact, LessonError, StudiedFact } from "@/components/course-page/course-head/head-parts";
import { useCourseRunup } from "@/components/course-page/course-head/use-course-runup";
import { ExamGapLine } from "@/components/course-page/course-head/exam-gaps";
import { ReadyLine } from "@/components/course-page/standing/ready-line";
import { MistakesPress } from "@/components/course-page/standing/mistakes-press";
import { examReady, mistakeRows } from "@/components/course-page/standing/standing-model";

/**
 * The course page's head (spec: course-head.md): the head answers "am I
 * ready for the exam, and where not?" from the engine's `standing`, as a
 * project's health leads Linear's project page; `standing` is read with
 * the page by the course frame. Under the title, the
 * readiness line (`ReadyLine`), which the exam's run-up repeats word for
 * word (`ExamFact`), then what the exam's plan leaves out
 * (`ExamGapLine`); then the arc he is in as its pill, the exam (its
 * run-up on press) and when he last studied (his last session on press).
 * Mistakes, before Context, opens the open mistakes.
 */
export function CourseHead({ view, standing, busy, onContinue }: { view: CourseView; standing: CourseStanding | null; busy: boolean; onContinue: (workspace: string) => void }) {
	const { course, facts, arcs, chats } = view;
	const runup = useCourseRunup(course.map.workspace);
	const rows = useMemo(() => (standing ? mistakeRows(standing, course, chats, arcs) : []), [standing, course, chats, arcs]);
	const ready = useMemo(() => (standing?.readiness ? examReady(standing.readiness, course.map, arcs) : null), [standing, course.map, arcs]);
	const here = arcs?.find((a) => a.current) ?? null;
	return (
		<PageHead
			title={<span data-slot="course-title">{course.map.title}</span>}
			actions={
				<>
					<MistakesPress rows={rows} />
					<ContextButton course={course} />
					<CourseAction view={view} busy={busy} onContinue={onContinue} />
				</>
			}
			lead={
				<div className="flex min-w-0 flex-col gap-0.5">
					<ReadyLine course={course} ready={ready} />
					<ExamGapLine course={course} />
				</div>
			}
			standing={
				<>
					{here && (
						<span data-slot="course-arc-here" className="inline-flex h-5 min-w-0 items-center">
							<ArcPill arc={{ handle: here.arc.handle, title: here.arc.title, share: here.share }} href={arcOnPage(course.map.workspace, here.arc.handle)} />
						</span>
					)}
					{facts.exam && <ExamFact course={course} runup={runup} words={facts.exam} ready={ready} />}
					{facts.studied && <StudiedFact words={facts.studied} session={facts.lastSession} />}
				</>
			}
		>
			<LessonError />
		</PageHead>
	);
}

/** The course page with one arc shown and open: `?arc=<handle>`. */
export function arcOnPage(workspace: string, arc: string): string {
	return `${courseHref(workspace)}?arc=${encodeURIComponent(arc)}`;
}
