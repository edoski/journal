import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { CourseBadge, ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { useSystemVariant } from "@/components/design-variant";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { rowStatus, rowWords, type RowStanding } from "@/components/study-home/agenda-rows/row-standing";
import { TopicGlyph } from "@/components/course-map/topic-map/topic-glyph";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";
import { MathText } from "@/components/ui/math-text";

/** The badge or pie beside both lines: the course line, then the lesson
 *  line with the row's one status at its end, flush right and whole, so
 *  the statuses line up down the list and the title gives way first. The
 *  hover fill's corners are at 8, as every other row with a hover fill
 *  (the sidebar's, the course page's, Settings'). */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-md px-3 text-left font-normal system-current:font-normal whitespace-normal data-[pointed]:bg-fill-hover";
/** The status column as wide as its words, so they show whole (round 11,
 *  1 N14: "Not right last time: Matrix multipli…" cut beside an empty
 *  column). */
const COLUMNS = "grid-cols-[1rem_minmax(0,1fr)_auto]";

/** The same columns with the first at the badge's width (40px), so both
 *  lines start at one edge beside it. */
const COLUMNS_BADGE = "grid-cols-[2.5rem_minmax(0,1fr)_auto]";

/** A standing fact: a 14px mark, as the reason's, then its words. */
const FACT = "flex items-center justify-self-end gap-1.5 text-callout system-current:text-label text-muted-foreground";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "hybrid" (spec: hybrid.md): the course's progress, the
 * course and the lesson, and one status, where he stands or why the row
 * is there (`rowStatus`), as an icon and a few words.
 */
export function HybridRows({ rows, busy, onContinue, ...point }: RowsProps) {
	const { shown, also } = foldLines(rows);
	// The visual system's Proposed: the course's badge at the row's height with its progress round its edge, where a lone ring read as a checkbox.
	const badge = useSystemVariant() === "proposed";
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => {
				const status = rowStatus(row);
				return (
					<li key={lineKey(row)} className={HAIRLINE}>
						<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={cn(ROW, badge ? COLUMNS_BADGE : COLUMNS)} {...pointProps(row, point)}>
							{badge ? (
								<span className="row-span-2 self-center">{row.course && <CourseBadge course={row.course} />}</span>
							) : (
								<span className="row-span-2">{row.course && <ProgressRing course={row.course} />}</span>
							)}
							<MathLine className="col-span-2 text-callout system-current:text-label text-muted-foreground">{courseTitle(row)}</MathLine>
							<MathLine className="text-headline system-current:text-control system-current:font-medium text-foreground">{lessonTitle(row)}</MathLine>
							{status?.kind === "standing" ? <StandingFact facts={status.facts} /> : <WhyMark why={status?.why ?? null} whole />}
						</LineTarget>
					</li>
				);
			})}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}

/** The row's one status on its topic: the map's pie, then the slip he
 *  would act on, else where he stands (`rowWords`); empty on a row of
 *  several topics. */
export function StandingFact({ facts }: { facts: RowStanding | null }) {
	if (!facts) return <span />;
	return (
		<span data-slot="today-standing" data-slip={facts.slip?.key} className={FACT}>
			<TopicGlyph standing={facts.standing} className="size-3.5" />
			<span className="whitespace-nowrap">
				<MathText>{rowWords(facts)}</MathText>
			</span>
		</span>
	);
}
