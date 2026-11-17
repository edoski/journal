"use client";

import Link from "next/link";
import { useContext, useState, type ReactNode, createContext } from "react";
import { BookOpenIcon, CalendarIcon, ClockIcon, FolderOpenIcon, HistoryIcon } from "lucide-react";
import type { CalendarCourse, StudyCourse } from "@/src/core";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";
import { MathText } from "@/components/ui/math-text";
import { dayAndNearWords, finalReviewWords, longDayWords, roadLines, roadOf, spanWords } from "@/components/calendar/calendar-facts";
import { ContextSheet } from "@/components/course-context/context-sheet";
import { ArcLabel } from "@/components/course-map/arc-label";
import { arcOnPage } from "@/components/course-page/course-head/course-head";
import type { ExamReady } from "@/components/course-page/standing/standing-model";
import { ReadyWords } from "@/components/course-page/standing/ready-line";
import { cn } from "@/lib/utils";


/** Why the head's button could not start a lesson, set by the course frame
 *  so the alert shows under the button he pressed. */
export const CourseLessonError = createContext<string | null>(null);

/** A fact of the standing line that goes somewhere: its 16px mark and
 *  words, muted at rest and in full ink under the pointer. */
export const PRESS = "inline-flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground motion-reduce:transition-none";
export const MARK = "size-4 shrink-0";

/** Context, in the page's actions: a quiet button that opens the sheet
 *  with what the tutor and the map read about the course. A head that
 *  opens it from elsewhere too passes `open` and `onOpenChange`. */
export function ContextButton({ course, open: shown, onOpenChange }: { course: StudyCourse; open?: boolean; onOpenChange?: (open: boolean) => void }) {
	const [own, setOwn] = useState(false);
	const open = shown ?? own;
	const setOpen = onOpenChange ?? setOwn;
	return (
		<>
			<Button variant="quiet" size="row" data-slot="course-context" onClick={() => setOpen(true)}>
				<FolderOpenIcon aria-hidden />
				Context
			</Button>
			<ContextSheet course={{ workspace: course.map.workspace, title: course.map.title }} open={open} onOpenChange={setOpen} />
		</>
	);
}

/** "Exam in 11 days", pressed: the exam's run-up as the engine plans it.
 *  The day, whether he is ready in the head's own words (`ready`, the
 *  readiness line's, so the two never disagree), each week's new topics,
 *  the final review, and the calendar one press away. */
export function ExamFact({ course, runup, words, ready, className }: { course: StudyCourse; runup: CalendarCourse | null; words: string; ready: ExamReady | null; className?: string }) {
	const { map } = course;
	const exam = map.exam;
	if (!exam) return null;
	const titleOf = (h: string) => map.topics.find((t) => t.handle === h)?.title ?? h;
	const road = runup ? roadOf(runup.planned, exam.date, titleOf, runup.finalReview) : [];
	const finalReview = finalReviewWords(runup?.finalReview ?? null, map.today);
	return (
		<Popover>
			<PopoverTrigger data-slot="course-exam" className={cn(PRESS, className)}>
				<CalendarIcon aria-hidden className={MARK} />
				{words}
			</PopoverTrigger>
			<PopoverContent data-slot="course-exam-runup" align="start" collisionPadding={12} className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<p className="text-headline text-foreground">{map.title} exam</p>
					<p className="text-callout text-muted-foreground">
						{dayAndNearWords(exam.date, longDayWords(exam.date), map.today)}
					</p>
					{ready && (
						<p data-slot="course-exam-ready" data-kind={ready.kind} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-callout", ready.kind === "short" ? "text-warning" : "text-muted-foreground")}>
							<ReadyWords ready={ready} workspace={map.workspace} />
							{ready.kind === "notYet" &&
								ready.arcs.map((arc) => (
									<Link key={arc.handle} href={arcOnPage(map.workspace, arc.handle)} className="group/arc min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
										<ArcLabel {...arc} />
									</Link>
								))}
						</p>
					)}
				</div>
				{(road.length > 0 || finalReview) && (
					<div data-slot="course-exam-road" className="flex flex-col gap-1.5 border-t border-border pt-3">
						<p className="text-callout text-muted-foreground">The road to it</p>
						<ol className="flex flex-col gap-1.5">
							{roadLines(road, runup?.finalReview ?? null).map((line) =>
								line.kind === "week" ? (
									<li key={line.week.from} className="flex gap-2 text-callout">
										<BookOpenIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
										<span className="min-w-0">
											<span className="text-muted-foreground">{spanWords(line.week)}</span>{" "}
											<span className="text-foreground">
												<MathText>{line.week.titles.join(", ")}</MathText>
											</span>
										</span>
									</li>
								) : (
									<li key="final" className="flex gap-2 text-callout text-muted-foreground">
										<HistoryIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
										{finalReview}
									</li>
								),
							)}
						</ol>
					</div>
				)}
				<Button asChild variant="quiet" size="xs" className="self-start text-link hover:text-link">
					<Link href="/calendar">Open the calendar</Link>
				</Button>
			</PopoverContent>
		</Popover>
	);
}

/** "Studied 2 days ago": a link to his latest session in the course, its
 *  title in the hint; plain words when he has none here. `extra` follows
 *  the words inside the link (Brief names the session). */
export function StudiedFact({ words, session, extra }: { words: string; session: { id: string; title: string } | null; extra?: ReactNode }) {
	const face = (
		<>
			<ClockIcon aria-hidden className={MARK} />
			{words}
			{extra}
		</>
	);
	if (!session) {
		return (
			<span data-slot="course-studied" className="inline-flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
				{face}
			</span>
		);
	}
	return (
		<Hint label={`Open your last session, ${session.title}`} side="bottom">
			<Link href={`/chat/${session.id}`} data-slot="course-studied" className={PRESS}>
				{face}
			</Link>
		</Hint>
	);
}

/** Why the press could not start a lesson, under the head's lines. */
export function LessonError() {
	const error = useContext(CourseLessonError);
	return error ? (
		<p role="alert" data-slot="course-lesson-error" className="flex min-h-5 items-center text-body text-danger">
			{error}
		</p>
	) : null;
}
