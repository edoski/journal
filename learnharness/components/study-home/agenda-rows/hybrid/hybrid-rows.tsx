import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, studiedLabel, whyOf, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { rowStanding, type RowStanding } from "@/components/study-home/agenda-rows/row-standing";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { SLIP_ICON } from "@/components/slip-icons";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";
import { MathText } from "@/components/ui/math-text";

/** The pie beside both lines; the course line with when he last studied
 *  it at its end, then the lesson line with why now at its end. The ends
 *  sit flush right, so each lines up down the list. */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-lg px-3 text-left font-normal system-current:font-normal whitespace-normal data-[pointed]:bg-fill-hover";
/** Home's Proposed: the hover fill's corners at 8, as every other row with
 *  a hover fill (the sidebar's, the course page's, Settings'). */
const ROW_CORNERS = "rounded-md";
const COLUMNS = "grid-cols-[1rem_minmax(0,1fr)_auto]";
/** With the standing: its own column before the ends, its marks on the
 *  column's left edge, as wide as the longest standing words ("Right on
 *  your own, check another day"); the ends' column as wide as the reason's
 *  most (`WhyMark`'s 224), not each row's own words, so the standing starts
 *  at one edge down the list and its marks stack. */
const COLUMNS_STANDING = "grid-cols-[1rem_minmax(0,1fr)_15rem_14rem]";

/** A standing fact: a 14px mark, as the reason's, then its words. */
const FACT = "flex min-w-0 items-center gap-1.5 text-callout system-current:text-label text-muted-foreground";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "hybrid" (spec: hybrid.md): progress, recency and reason,
 * each beside what it is about. The pie leads the course; the course line
 * ends with when he last studied it; the lesson line ends with why it is
 * there today, as an icon and a few words.
 */
export function HybridRows({ rows, busy, onContinue, standing = false, ...point }: RowsProps & { standing?: boolean }) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => {
				// The slip sits on the course line, the standing on the lesson line, so it reads beside its topic.
				const facts = standing ? rowStanding(row) : undefined;
				return (
					<li key={lineKey(row)} className={HAIRLINE}>
						<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={cn(ROW, standing ? cn(COLUMNS_STANDING, ROW_CORNERS) : COLUMNS)} {...pointProps(row, point)}>
							<span className="row-span-2">{row.course && <ProgressRing course={row.course} />}</span>
							<MathLine className="text-callout system-current:text-label text-muted-foreground">{courseTitle(row)}</MathLine>
							{facts !== undefined && <SlipFact facts={facts} />}
							<span data-slot="today-when" className="justify-self-end text-callout system-current:text-label text-muted-foreground tabular-nums">
								{studiedLabel(row)}
							</span>
							<MathLine className="text-headline system-current:text-control system-current:font-medium text-foreground">{lessonTitle(row)}</MathLine>
							{facts !== undefined && <StandingFact facts={facts} />}
							<WhyMark why={whyOf(row)} />
						</LineTarget>
					</li>
				);
			})}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}

/** Why the engine calls the row's topic weak, with the slip's own icon,
 *  as the topic page's head says it; empty where it has none. */
export function SlipFact({ facts }: { facts: RowStanding | null }) {
	const slip = facts?.slip;
	if (!slip) return <span />;
	const Icon = SLIP_ICON[slip.key];
	return (
		<span data-slot="today-slip" data-slip={slip.key} className={FACT}>
			<Icon aria-hidden="true" className="size-3.5 shrink-0" />
			<span className="truncate">
				<MathText>{slip.words}</MathText>
			</span>
		</span>
	);
}

/** Where he stands on the row's topic: the map's pie and its words;
 *  empty on a row of several topics. */
export function StandingFact({ facts }: { facts: RowStanding | null }) {
	if (!facts) return <span />;
	return (
		<span data-slot="today-standing" className={FACT}>
			<TopicGlyph standing={facts.standing} className="size-3.5" />
			<span className="truncate">{facts.standing.words}</span>
		</span>
	);
}
