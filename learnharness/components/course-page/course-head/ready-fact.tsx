"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarOffIcon, CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { CourseStanding } from "@/src/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/hint";
import { ArcLabel } from "@/components/course-map/arc-label";
import { NOT_READY_ARCS_WORDS, READY_FACT_WORDS, noExamWords } from "@/components/study-words";
import type { CourseView } from "@/components/course-page/course-model";
import { arcOnPage } from "@/components/course-page/course-head/course-head";
import { MARK, PRESS } from "@/components/course-page/course-head/head-parts";
import { ExamGapLine } from "@/components/course-page/course-head/exam-gaps";
import { ReadyWords } from "@/components/course-page/standing/ready-line";
import { examReady, mistakeRows, type ExamReady } from "@/components/course-page/standing/standing-model";
import { cn } from "@/lib/utils";

const ICON: Record<ExamReady["kind"], typeof CircleCheckIcon> = { ready: CircleCheckIcon, notYet: CircleDotDashedIcon, short: TriangleAlertIcon };

/** What the head reads from the engine's standing: whether he is ready
 *  for the exam, and the open mistakes. */
export function useHeadStanding(view: CourseView, standing: CourseStanding | null) {
	const { course, arcs, chats } = view;
	const ready = useMemo(() => (standing?.readiness ? examReady(standing.readiness, course.map, arcs, standing.mistakes) : null), [standing, course.map, arcs]);
	const mistakes = useMemo(() => (standing ? mistakeRows(standing, course, chats, arcs) : []), [standing, course, chats, arcs]);
	return { ready, mistakes };
}

/**
 * Whether he is ready for the exam, as one fact of a head (spec:
 * course-head.md): an icon and a few words ("Not ready yet",
 * "Ready for the exam", "Not all of it fits" in the warning ink), never a
 * pill per arc. Pressed, it opens the whole answer under it: the readiness
 * words the run-up says (`ReadyWords`), the arcs not ready as a list, each
 * showing its arc on the page, and what the exam's plan leaves out with
 * its way in (`ExamGapLine`). A course without an exam says "No exam",
 * what the plan does with its reviews in its hint. Nothing while the
 * engine cannot say.
 */
export function ReadyFact({ view, ready }: { view: CourseView; ready: ExamReady | null }) {
	const { course, chats } = view;
	const { map } = course;
	if (!map.exam) {
		return (
			<Hint label={noExamWords(map.topics)} side="bottom">
				<span data-slot="course-ready-fact" data-kind="none" tabIndex={0} className={PRESS}>
					<CalendarOffIcon aria-hidden className={MARK} />
					{READY_FACT_WORDS.none}
				</span>
			</Hint>
		);
	}
	if (!ready) return null;
	const Icon = ICON[ready.kind];
	const arcs = ready.kind === "notYet" ? ready.arcs : [];
	return (
		<Popover>
			<PopoverTrigger data-slot="course-ready-fact" data-kind={ready.kind} className={cn(PRESS, ready.kind === "short" && "text-warning hover:text-warning data-[state=open]:text-warning")}>
				<Icon aria-hidden className={MARK} />
				{READY_FACT_WORDS[ready.kind]}
			</PopoverTrigger>
			<PopoverContent data-slot="course-ready-detail" align="start" collisionPadding={12} className="flex flex-col gap-3">
				<p className={cn("text-callout", ready.kind === "short" ? "text-warning" : "text-foreground")}>
					{arcs.length > 0 ? NOT_READY_ARCS_WORDS : <ReadyWords ready={ready} workspace={map.workspace} />}
				</p>
				{arcs.length > 0 && (
					<ul className="-mx-1 -mt-2 flex flex-col">
						{arcs.map((arc) => (
							<li key={arc.handle}>
								<Link
									href={arcOnPage(map.workspace, arc.handle)}
									className="group/arc flex h-8 min-w-0 items-center rounded-md px-1 outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
								>
									<ArcLabel {...arc} />
								</Link>
							</li>
						))}
					</ul>
				)}
				<ExamGapLine course={course} chats={chats} />
			</PopoverContent>
		</Popover>
	);
}
