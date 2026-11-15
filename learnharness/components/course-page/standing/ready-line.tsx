"use client";

import { CircleCheckIcon, CircleDotDashedIcon, TriangleAlertIcon } from "lucide-react";
import type { StudyCourse } from "@/src/core";
import { ArcPill } from "@/components/course-map/arc-strip";
import { MathText } from "@/components/ui/math-text";
import { noExamWords } from "@/components/study-words";
import { arcOnPage } from "@/components/course-page/course-head/course-head";
import type { ExamReady } from "@/components/course-page/standing/standing-model";
import { cn } from "@/lib/utils";

const ICON: Record<ExamReady["kind"], typeof CircleCheckIcon> = { ready: CircleCheckIcon, notYet: CircleDotDashedIcon, short: TriangleAlertIcon };

/**
 * The head's first line, answering "am I ready for the exam?" from the
 * engine's `standing` as `examReady` words it (spec: standing/standing.md): ready; not all of it
 * fits, naming what has no room; or not ready yet, naming the arcs not
 * ready as their bubbles, each showing its arc on the page. A course the
 * page shows without arcs names the topics. Nothing while the engine is read;
 * without an exam, what the plan does with its reviews (`noExamWords`).
 */
export function ReadyLine({ course, ready }: { course: StudyCourse; ready: ExamReady | null }) {
	const { map } = course;
	const Icon = ready ? ICON[ready.kind] : null;
	const bubbles = ready?.kind === "notYet" ? ready.arcs : [];
	return (
		<p data-slot="course-ready" data-kind={ready?.kind} className={cn("flex min-h-5 min-w-0 items-start gap-1.5", ready?.kind === "short" && "text-warning")}>
			{Icon && <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", ready?.kind !== "short" && "text-muted-foreground")} />}
			{ready ? <MathText>{ready.words}</MathText> : !map.exam && <span className="font-normal text-muted-foreground">{noExamWords(map.topics)}</span>}
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
