import Link from "next/link";
import { CircleXIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { courseHref } from "@/components/unit-inbox/unit-href";
import type { HeadMark, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";

/** One icon per kind of mark, the ones the map's nodes and Today's rows use. */
const MARK_ICON: Record<HeadMark["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };

/** A pause for a screen reader between the line's parts, which the eye
 *  separates by space and icons. */
const PAUSE = <span className="sr-only">. </span>;

/**
 * The topic page's head (spec: topic-head.md), every line on the
 * column's one left edge: the course, which opens the course's page; the
 * topic; the pie Home's rows and the map draw, leading where he stands in
 * words, then why it needs him as icons and a few words, and when he last
 * studied it flush right; and what went wrong when the engine can say.
 * The page's action is in the history's Now, so the head has no button.
 */
export function TopicHead({ facts }: { facts: TopicFacts }) {
	const { standing, marks, studied, mistake } = facts;
	return (
		<header data-slot="topic-head" className="flex flex-col gap-1">
			<p className="text-label text-muted-foreground">
				<Link
					href={courseHref(facts.course.workspace)}
					data-slot="topic-course-link"
					className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<MathText>{facts.course.title}</MathText>
				</Link>
			</p>
			<div className="flex min-h-8 items-center">
				<h1 className="text-heading font-medium text-foreground">
					<MathText>{facts.topic.title}</MathText>
				</h1>
			</div>
			{standing && (
				<div data-slot="unit-standing" className="flex min-h-5 items-center gap-4 text-row text-muted-foreground">
					<p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
						<span data-slot="topic-standing-words" className="inline-flex items-center gap-1.5">
							<TopicGlyph standing={standing} />
							{standing.words}
						</span>
						{marks.map((mark) => {
							const Icon = MARK_ICON[mark.kind];
							return (
								<span key={mark.kind} data-slot="topic-mark" data-kind={mark.kind} className="inline-flex items-center gap-1.5">
									{PAUSE}
									<Icon aria-hidden className="size-3.5 shrink-0" />
									<MathText>{mark.words}</MathText>
								</span>
							);
						})}
					</p>
					{studied && (
						<p data-slot="topic-studied" className="shrink-0 text-label tabular-nums">
							{studied}
						</p>
					)}
				</div>
			)}
			{mistake && (
				<p data-slot="unit-gap" className="text-row text-foreground/90">
					<MathText>{mistake}</MathText>
				</p>
			)}
		</header>
	);
}
