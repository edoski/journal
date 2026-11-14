import Link from "next/link";
import { CircleXIcon, ClockIcon, HistoryIcon, type LucideIcon } from "lucide-react";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { PageFact, PageHead } from "@/components/page-frame/page-frame";
import { arcHref, courseHref } from "@/components/unit-inbox/unit-href";
import type { HeadMark, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { SLIP_ICON } from "@/components/slip-icons";

/** One icon per kind of mark, the ones the map's nodes and Today's rows
 *  use; a slip wears its own (`SLIP_ICON`). */
const MARK_ICON: Record<HeadMark["kind"], LucideIcon> = { slip: CircleXIcon, review: HistoryIcon };

/** The course and the arc above the title: muted, full ink on hover, a
 *  ring on keyboard focus. */
const EYEBROW_LINK =
	"rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none";

/** A pause for a screen reader between the line's facts, which the eye
 *  separates by space and icons. */
const PAUSE = <span className="sr-only">. </span>;

/**
 * The topic page's head (spec: topic-head.md), the shared page head
 * (`PageHead`, page-frame.md) the course page wears: the course, which
 * opens the course's page, then in a course with arcs the topic's arc,
 * which opens the course page with that arc unfolded; the topic; the standing line, the pie Home's
 * rows and the map draw leading where he stands in words, then why it
 * needs him and when he last studied it, each an icon and a few words;
 * and what went wrong when the engine can say. The page's action is in
 * the history's Now, so the head has no button.
 */
export function TopicHead({ facts, children }: { facts: TopicFacts; children?: React.ReactNode }) {
	const { standing, marks, studied, mistake } = facts;
	return (
		<PageHead
			eyebrow={
				<>
					<Link href={courseHref(facts.course.workspace)} data-slot="topic-course-link" className={EYEBROW_LINK}>
						<MathText>{facts.course.title}</MathText>
					</Link>
					{facts.arc && (
						<>
							<span aria-hidden> · </span>
							<span className="sr-only">, </span>
							<Link href={arcHref(facts.course.workspace, facts.arc.handle)} data-slot="topic-arc-link" className={EYEBROW_LINK}>
								<MathText>{facts.arc.title}</MathText>
							</Link>
						</>
					)}
				</>
			}
			title={<MathText>{facts.topic.title}</MathText>}
			standing={
				standing && (
					<>
						<PageFact icon={<TopicGlyph standing={standing} />} data-kind="standing">
							{standing.words}
						</PageFact>
						{marks.map((mark) => {
							const Icon = mark.slip ? SLIP_ICON[mark.slip] : MARK_ICON[mark.kind];
							return (
								<PageFact key={mark.kind} icon={<Icon aria-hidden className="size-4 shrink-0" />} data-kind={mark.kind}>
									{PAUSE}
									<MathText>{mark.words}</MathText>
								</PageFact>
							);
						})}
						{studied && (
							<PageFact icon={<ClockIcon aria-hidden className="size-4 shrink-0" />} data-kind="studied">
								{PAUSE}
								{studied}
							</PageFact>
						)}
					</>
				)
			}
		>
			{mistake && (
				<p data-slot="unit-gap" className="text-row text-foreground/90">
					<MathText>{mistake}</MathText>
				</p>
			)}
			{children}
		</PageHead>
	);
}
