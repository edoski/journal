"use client";

import { CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { CourseReadiness, StudyCourse } from "@/src/core";
import { ArcPill } from "@/components/course-map/arc-strip";
import { MathText } from "@/components/ui/math-text";
import { READY_WORDS } from "@/components/study-words";
import type { CourseArcSection } from "@/components/course-page/course-model";
import { arcOnPage } from "@/components/course-page/course-head/pace-head";
import { examReady, type ExamReady } from "@/components/course-page/standing/standing-model";
import { cn } from "@/lib/utils";

const ICON: Record<ExamReady["kind"], typeof CircleCheckIcon> = { ready: CircleCheckIcon, notYet: CircleDotDashedIcon, short: TriangleAlertIcon };

/**
 * The head's first line, answering "am I ready for the exam?" from the
 * engine's `standing` (spec: standing/standing.md): ready; not all of it
 * fits, naming what has no room; or not ready yet. `where` names the arcs
 * not ready as their bubbles, each showing its arc on the page; `verdict`
 * leaves where to the arcs' own lines. A course the page shows without
 * arcs names the topics either way. Nothing while the engine is read; "No
 * exam day set" without an exam.
 */
export function ReadyLine({ course, readiness, arcs, mode }: { course: StudyCourse; readiness: CourseReadiness | null | undefined; arcs: readonly CourseArcSection[] | null; mode: "where" | "verdict" }) {
	const { map } = course;
	const ready = readiness ? examReady(readiness, map, arcs) : null;
	const Icon = ready ? ICON[ready.kind] : null;
	const bubbles = mode === "where" && ready?.kind === "notYet" ? ready.arcs : [];
	const words = ready?.kind === "notYet" && ready.arcs.length > 0 && mode === "verdict" ? READY_WORDS.notYet : ready?.words;
	return (
		<p data-slot="course-ready" data-kind={ready?.kind} className={cn("flex min-h-5 min-w-0 items-center gap-1.5", ready?.kind === "short" && "text-warning")}>
			{Icon && <Icon aria-hidden className={cn("size-4 shrink-0", ready?.kind !== "short" && "text-muted-foreground")} />}
			{words ? <MathText>{words}</MathText> : !map.exam && <span className="font-normal text-muted-foreground">No exam day set</span>}
			{bubbles.length > 0 && (
				<span className="ml-0.5 flex min-w-0 items-center gap-1">
					{bubbles.map((arc) => (
						<ArcPill key={arc.handle} arc={arc} href={arcOnPage(map.workspace, arc.handle)} />
					))}
				</span>
			)}
		</p>
	);
}
