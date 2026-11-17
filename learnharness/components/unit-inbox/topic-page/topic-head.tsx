import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { PageFact, PageHead } from "@/components/page-frame/page-frame";
import { arcHref, courseHref } from "@/components/unit-inbox/unit-href";
import type { HeadMark, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import type { Fact } from "@/components/unit-inbox/fact-icon";
import { FactIcon } from "@/components/unit-inbox/status-mark";

/** A mark as the fact it states, its icon the one every surface wears for
 *  it: a slip by its own kind (a miss when the engine names none), else
 *  the review. */
const markFact = (mark: HeadMark): Fact => (mark.kind === "slip" ? { kind: "slip", slip: mark.slip ?? "lapsed" } : { kind: "review" });

/** A pause for a screen reader between the line's facts, which the eye
 *  separates by space and icons. */
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

/**
 * The topic page's head (spec: topic-head.md), the course page's head's
 * twin (`PageHead`, compact, page-frame.md): the topic's title in the
 * course page's title's place, level with the rail's open button, with no
 * line above it, so the two pages' columns start at the same height. Under
 * it, one line: where the topic sits as linked words (the course, then its
 * arc, never a pill), then where he stands, the pie Home's rows and the map
 * draw with its words, then its marks, each an icon and a few words. The
 * mistake, when the engine can say, follows. The page's action is in the
 * history's Now, so the head has no button.
 */
export function TopicHead({ facts, children }: { facts: TopicFacts; children?: React.ReactNode }) {
	const { standing, marks, mistake } = facts;
	return (
		<PageHead
			compact
			title={<MathText>{facts.topic.title}</MathText>}
			standing={
				<>
					<Place facts={facts} />
					{standing && (
						<PageFact icon={<TopicGlyph standing={standing} />} data-kind="standing">
							{PAUSE}
							{standing.words}
						</PageFact>
					)}
					{marks.map((mark) => (
						<PageFact key={mark.kind} icon={<FactIcon fact={markFact(mark)} className="size-4" />} data-kind={mark.kind}>
							{PAUSE}
							<MathText>{mark.words}</MathText>
						</PageFact>
					))}
				</>
			}
		>
			{mistake && (
				<p data-slot="unit-gap" className="text-body text-foreground/90">
					<MathText>{mistake}</MathText>
				</p>
			)}
			{children}
		</PageHead>
	);
}
