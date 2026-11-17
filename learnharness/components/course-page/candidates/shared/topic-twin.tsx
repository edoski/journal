"use client";

import Link from "next/link";
import { ChevronRightIcon, CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { PageFact, PageHead } from "@/components/page-frame/page-frame";
import { arcHref, courseHref } from "@/components/unit-inbox/unit-href";
import type { HeadMark, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { SLIP_ICON } from "@/components/slip-icons";

const MARK_ICON: Record<HeadMark["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };
const PAUSE = <span className="sr-only">. </span>;
const LINK = "rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/** Where the topic sits, as linked words: the course, then its arc, each
 *  opening its place on the course page. No ring: beside the topic's pie it
 *  would read as a second standing. */
function Place({ facts }: { facts: TopicFacts }) {
	const { course, arc } = facts;
	return (
		<span data-slot="topic-place" className="inline-flex h-5 min-w-0 items-center gap-1.5 whitespace-nowrap">
			<Link href={courseHref(course.workspace)} data-slot="topic-course-link" className={LINK}>
				<MathText>{course.title}</MathText>
			</Link>
			{arc && (
				<>
					<ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
					<Link href={arcHref(course.workspace, arc.handle)} data-slot="topic-arc-link" className={`${LINK} min-w-0 truncate`}>
						<MathText>{arc.title}</MathText>
					</Link>
				</>
			)}
		</span>
	);
}

/** Where he stands on the topic and what marks it, each an icon and a few words. */
function Standing({ facts }: { facts: TopicFacts }) {
	const { standing, marks } = facts;
	return (
		<>
			{standing && (
				<PageFact icon={<TopicGlyph standing={standing} />} data-kind="standing">
					{PAUSE}
					{standing.words}
				</PageFact>
			)}
			{marks.map((mark) => {
				const Icon = mark.slip ? SLIP_ICON[mark.slip] : MARK_ICON[mark.kind];
				return (
					<PageFact key={mark.kind} icon={<Icon aria-hidden className="size-4 shrink-0" />} data-kind={mark.kind}>
						{PAUSE}
						<MathText>{mark.words}</MathText>
					</PageFact>
				);
			})}
		</>
	);
}

/**
 * The topic page's head as the course page's candidates draw it (spec:
 * candidates.md, "The topic page"): the course page's head, its title in
 * the same place, level with the rail's open button, with no line above
 * it. Under the title, where the topic sits as linked words (the course,
 * then its arc, never a pill) and where he stands on it, each an icon and
 * a few words. `lines` "two" (Overview) puts the place on its own line over
 * the standing, as Overview's course head puts the next step over its
 * facts; "one" (Agenda, Road) runs them on one line, as their compact
 * course heads do. The mistake, when the engine can say, follows.
 */
export function TopicTwinHead({ facts, lines, children }: { facts: TopicFacts; lines: "one" | "two"; children?: React.ReactNode }) {
	const mistake = facts.mistake && (
		<p data-slot="unit-gap" className="text-body text-foreground/90">
			<MathText>{facts.mistake}</MathText>
		</p>
	);
	if (lines === "two") {
		return (
			<PageHead
				title={<MathText>{facts.topic.title}</MathText>}
				lead={
					<span className="flex min-w-0 font-normal text-muted-foreground text-body">
						<Place facts={facts} />
					</span>
				}
				standing={<Standing facts={facts} />}
			>
				{mistake}
				{children}
			</PageHead>
		);
	}
	return (
		<PageHead
			compact
			title={<MathText>{facts.topic.title}</MathText>}
			standing={
				<>
					<Place facts={facts} />
					<Standing facts={facts} />
				</>
			}
		>
			{mistake}
			{children}
		</PageHead>
	);
}
