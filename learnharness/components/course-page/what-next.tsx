"use client";

import Link from "next/link";
import type { StudyCourse } from "@/src/core";
import { ArcPill, type PillArc } from "@/components/course-map/arc-pill";
import { Button } from "@/components/ui/button";
import { MathLine } from "@/components/ui/math-line";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import type { Why } from "@/components/study-home/agenda-rows/row-facts";
import { arcShare, type WhatNext as Next } from "@/components/course-page/course-model";
import type { CourseMapArc } from "@/src/core";

/** The labels of the block's two rows. */
export const PICK_UP_WORDS = "Pick up";
export const THEN_WORDS = "Then";

/** Today's hybrid row (../study-home/agenda-rows/hybrid/hybrid.md): the
 *  pie beside two lines, each line's end flush right. */
const ROW = "-mx-3 flex h-14 w-[calc(100%+1.5rem)] items-center gap-4 rounded-lg px-3 text-left font-normal whitespace-normal";
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** A row's two lines: what the row is and why now (the reason's icon and
 *  words, flush right), then the topic or lesson and its arc's pill (flush
 *  right). The reason and the title give way before the pill. */
function Lines({ label, why, title, arc }: { label: string; why: Why | null; title: string; arc: PillArc | null }) {
	return (
		<span className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="flex min-w-0 items-center gap-3">
				<span className="shrink-0 text-callout text-muted-foreground">{label}</span>
				{/* The line holds only the label and the reason, so the reason takes the line, past Today's row cap. */}
				<span className="ml-auto flex min-w-0 justify-end [&>*]:min-w-0 [&_[data-slot=today-why]]:max-w-full">
					<WhyMark why={why} />
				</span>
			</span>
			<span className="flex min-w-0 items-center gap-3">
				<MathLine className="min-w-0 flex-1 text-headline text-foreground">{title}</MathLine>
				{arc && <ArcPill arc={arc} className="max-w-3/5 shrink-0" />}
			</span>
		</span>
	);
}

/**
 * Where he picks up and what comes next (spec: course-page.md, "What
 * next"), above a course's arcs, in Today's row style: Pick up, the
 * course's first line on Today, which opens as Today's line does; Then,
 * the next new topic the plan starts and why then, which opens its page.
 * Each row's first line says what it is and why now, its second the
 * topic and its arc's pill (left out when the reason already names it). Nothing when there
 * is nothing to say.
 */
export function WhatNextRows({ next, course, busy, onContinue }: { next: Next | null; course: StudyCourse; busy: boolean; onContinue: (workspace: string) => void }) {
	if (!next) return null;
	const { pickUp, then } = next;
	const pill = (arc: CourseMapArc | null): PillArc | null => (arc ? { handle: arc.handle, title: arc.title, share: arcShare(course, arc.handle) } : null);
	const thenArc = pill(then && !then.whyNamesArc ? then.arc : null);
	const lead = pickUp ? (pickUp.line.lead ?? pickUp.line.topics[0] ?? null) : null;
	return (
		<ul data-slot="what-next" aria-label="What next" className="mb-3 flex shrink-0 flex-col border-b border-border/50 pb-2">
			{pickUp && (
				<li className={HAIRLINE}>
					<LineTarget row={pickUp.line.row} busy={busy} onContinue={onContinue} data-slot="what-next-pick-up" className={ROW}>
						<span className="flex shrink-0">{lead ? <TopicGlyph standing={standingOf(lead)} /> : <ProgressRing course={course} />}</span>
						<Lines label={PICK_UP_WORDS} why={pickUp.line.why} title={pickUp.line.title} arc={pill(pickUp.arc)} />
					</LineTarget>
				</li>
			)}
			{then && (
				<li className={HAIRLINE}>
					<Button variant="quiet" asChild data-slot="what-next-then" className={ROW}>
						<Link href={then.href}>
							<span className="flex shrink-0">
								<TopicGlyph standing={standingOf(then.topic)} />
							</span>
							<Lines label={THEN_WORDS} why={{ kind: "next", short: then.why }} title={then.topic.title} arc={thenArc} />
						</Link>
					</Button>
				</li>
			)}
		</ul>
	);
}
