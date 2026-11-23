import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { MathText } from "@/components/ui/math-text";
import { PageFact, PageHead } from "@/components/page-frame/page-frame";
import { arcHref, courseHref } from "@/components/unit-inbox/unit-href";
import type { HeadMark, TopicFacts } from "@/components/unit-inbox/topic-page/topic-facts";
import { factInk, type Fact } from "@/components/unit-inbox/fact-icon";
import { FactIcon } from "@/components/unit-inbox/status-mark";
import { Crumbs, type Crumb } from "@/components/nav/crumbs";

/** A mark as the fact it states, its icon the one every surface wears for
 *  it: a slip by its own kind (a miss when the engine names none), else
 *  the review. */
const markFact = (mark: HeadMark): Fact => (mark.kind === "slip" ? { kind: "slip", slip: mark.slip ?? "lapsed" } : { kind: "review" });

/** A pause for a screen reader between the line's facts, which the eye
 *  separates by space and icons. */
const PAUSE = <span className="sr-only">. </span>;

/** Where the topic sits, on the app's one trail: the course, then its arc,
 *  each opening its place on the course page. */
function placeOf({ course, arc }: TopicFacts): Crumb[] {
	const crumbs: Crumb[] = [{ kind: "course", title: course.title, href: courseHref(course.workspace) }];
	if (arc) crumbs.push({ kind: "arc", arc, href: arcHref(course.workspace, arc.handle) });
	return crumbs;
}

/**
 * The topic page's head (spec: topic-head.md), the course page's head's
 * twin (`PageHead`, compact, page-frame.md): the topic's title in the
 * course page's title's place, level with the rail's open button, with no
 * line above it, so the two pages' columns start at the same height. Under
 * it, one line: where the topic sits on the app's one trail (`Crumbs`: the
 * course, then its arc's label), then where he stands, the pie Home's rows and the map
 * draw with its words, then its marks, each an icon and a few words. The
 * mistake, when the engine can say, follows. The page's action is in the
 * history's Now, so the head has no button.
 */
export function TopicHead({ facts, children }: { facts: TopicFacts; children?: React.ReactNode }) {
	const { standing, now, marks, mistake } = facts;
	return (
		<PageHead
			compact
			title={<MathText>{facts.topic.title}</MathText>}
			standing={
				<>
					<Crumbs crumbs={placeOf(facts)} className="h-5" />
					{now ? (
						// The topic's own open session speaks for it, as its map card does (round 20, m4).
						<PageFact icon={<FactIcon fact={{ kind: now.kind }} className="size-4" />} data-kind="standing" data-session={now.kind} className={factInk(now.kind)}>
							{PAUSE}
							{now.words}
						</PageFact>
					) : (
						standing && (
							<PageFact icon={<TopicGlyph standing={standing} />} data-kind="standing">
								{PAUSE}
								{standing.words}
							</PageFact>
						)
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
