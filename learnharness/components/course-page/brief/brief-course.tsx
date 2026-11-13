"use client";

import { useMemo } from "react";
import { CourseFrame } from "@/components/course-page/course-frame";
import { CourseHeader } from "@/components/course-page/course-header";
import type { CourseView } from "@/components/course-page/course-model";
import { BriefAnswer } from "./brief-answer";
import { BriefMap } from "./brief-map";
import { BriefMistake } from "./brief-mistake";
import { briefAnswers, briefMistake, mapAim, standingParts } from "./brief-model";
import { StandingBar } from "./standing-bar";
import { useShortWindow } from "./use-short-window";

/** Topics each answer shows before "Show N more": three, two in a short window. */
const LIMIT = { tall: 3, short: 2 };

/**
 * The course page candidate "brief" (spec: brief-course.md): three
 * answers, then the picture. One column of Home's width that fits the
 * window: the shared header, the standing bar, the one mistake the engine
 * can name, the three answers side by side with hairlines between them
 * (Fix first, Review, Next), then the course's map in the rest of the
 * window.
 */
export function BriefCourse({ workspace, initialConfigured }: { workspace: string; initialConfigured: boolean }) {
	return (
		<CourseFrame workspace={workspace} initialConfigured={initialConfigured} className="mx-auto flex h-full w-full max-w-[60rem] flex-col gap-6 px-8 pt-5 pb-6">
			{({ view, busy, onContinue }) => (
				<>
					<CourseHeader view={view} busy={busy} onContinue={onContinue} />
					<BriefBody view={view} />
				</>
			)}
		</CourseFrame>
	);
}

/** Everything under the header; an empty course says so in one line. */
function BriefBody({ view }: { view: CourseView }) {
	const parts = useMemo(() => standingParts(view.course), [view.course]);
	const answers = useMemo(() => briefAnswers(view), [view]);
	const mistake = useMemo(() => briefMistake(answers), [answers]);
	const aim = useMemo(() => mapAim(view, answers), [view, answers]);
	const limit = useShortWindow() ? LIMIT.short : LIMIT.tall;

	if (view.course.map.topics.length === 0) {
		return (
			<p data-slot="brief-empty" className="text-row text-muted-foreground">
				Topics appear as you study this course.
			</p>
		);
	}
	return (
		<>
			<div className="flex shrink-0 flex-col gap-4">
				<StandingBar parts={parts} />
				{mistake && <BriefMistake mistake={mistake} />}
			</div>
			{/* Each answer has 24px either side of its hairlines; the outer ones reach past the column, so the three are one width. */}
			<div data-slot="brief-answers" className="-mx-6 grid shrink-0 grid-cols-3 divide-x divide-border/50">
				{answers.map((answer) => (
					<BriefAnswer key={answer.id} answer={answer} limit={limit} className="px-6" />
				))}
			</div>
			<BriefMap map={view.course.map} aim={aim} />
		</>
	);
}
