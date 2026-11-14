"use client";

import { useMemo } from "react";
import { CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { CourseView } from "@/components/course-page/course-model";
import { PaceHead } from "@/components/course-page/course-head/pace-head";
import { SplitBody } from "@/components/course-page/split/split-course";
import { useCourseStanding } from "@/components/course-page/use-course-standing";
import { ReadyLine } from "@/components/course-page/standing/ready-line";
import { MistakesPress } from "@/components/course-page/standing/mistakes-press";
import { MistakesSection } from "@/components/course-page/standing/mistakes-section";
import { mistakeRows, partWordsByArc, type PartState } from "@/components/course-page/standing/standing-model";
import type { StandingVariant } from "@/components/course-page/standing-variant";
import { cn } from "@/lib/utils";

const PART_ICON: Record<PartState, typeof CircleCheckIcon> = { ready: CircleCheckIcon, notYet: CircleDotDashedIcon, short: TriangleAlertIcon };

/**
 * The course page with its exam readiness and open mistakes (spec:
 * standing/standing.md), one candidate per value of the Exam & mistakes
 * switch, both from the engine's `standing`:
 *   - `head`: the head's first line says whether he is ready and names the
 *     arcs that are not as their bubbles; Mistakes in the head's actions
 *     opens the list;
 *   - `arcs`: the head says only whether he is ready; each arc's line says
 *     where it stands for the exam in place of its exam words; the
 *     mistakes are one quiet group under the list.
 */
export function StandingBody({ variant, view, busy, onContinue }: { variant: Exclude<StandingVariant, "current">; view: CourseView; busy: boolean; onContinue: (workspace: string) => void }) {
	const { course, arcs, chats } = view;
	const standing = useCourseStanding(course.map.workspace);
	const rows = useMemo(() => (standing ? mistakeRows(standing, course, chats, arcs) : []), [standing, course, chats, arcs]);
	const parts = useMemo(() => partWordsByArc(standing?.readiness ?? null), [standing]);
	const lead = <ReadyLine course={course} readiness={standing?.readiness} arcs={arcs} mode={variant === "head" ? "where" : "verdict"} />;
	if (variant === "head") {
		return <SplitBody view={view} busy={busy} onContinue={onContinue} header={<PaceHead view={view} busy={busy} onContinue={onContinue} lead={lead} action={<MistakesPress rows={rows} />} />} />;
	}
	return (
		<SplitBody
			view={view}
			busy={busy}
			onContinue={onContinue}
			header={<PaceHead view={view} busy={busy} onContinue={onContinue} lead={lead} />}
			arcExam={(section) => {
				const part = parts.get(section.arc.handle);
				if (!part) return undefined;
				const Icon = PART_ICON[part.state];
				return (
					<span data-slot="course-arc-exam" data-kind={part.state} className={cn("ml-1 inline-flex min-w-0 flex-1 basis-0 items-center gap-1 text-label font-normal", part.state === "short" ? "text-warning" : "text-muted-foreground")}>
						<Icon aria-hidden className="size-3.5 shrink-0" />
						<span className="min-w-0 truncate">{part.words}</span>
					</span>
				);
			}}
			after={<MistakesSection rows={rows} />}
		/>
	);
}
