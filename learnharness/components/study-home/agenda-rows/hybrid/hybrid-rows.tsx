import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { CourseBadge } from "@/components/study-home/agenda-rows/course-badge";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { lineTopics } from "@/components/study-home/needs-you";
import { rowStatus, rowWords, type RowStatus } from "@/components/study-home/agenda-rows/row-standing";
import { reasonMark } from "@/components/unit-inbox/fact-icon";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";

/** The badge or pie beside both lines: the course line, then the lesson
 *  line with the row's one status at its end, flush right and whole, so
 *  the statuses line up down the list and the title gives way first. The
 *  hover fill's corners are at 8, as every other row with a hover fill
 *  (the sidebar's, the course page's, Settings'). */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-md px-3 text-left font-normal whitespace-normal data-[pointed]:bg-fill-hover";
/** The first column at the badge's width (40px), so both lines start at
 *  one edge beside it, and the status column as wide as its words, so they
 *  show whole (round 11, 1 N14: "Not right last time: Matrix multipli…" cut
 *  beside an empty column). */
const COLUMNS = "grid-cols-[2.5rem_minmax(0,1fr)_auto]";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/**
 * Agenda rows "hybrid" (spec: hybrid.md): the course's progress, the
 * course and the lesson, and one status, where he stands or why the row
 * is there (`rowStatus`), as an icon and a few words.
 */
export function HybridRows({ rows, busy, onContinue, ...point }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => (
				<li key={lineKey(row)} className={HAIRLINE}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" data-topics={lineTopics(row).join(" ")} className={cn(ROW, COLUMNS)} {...pointProps(row, point)}>
						{/* The course's badge at the row's height with its progress round its edge, where a lone ring read as a checkbox. */}
						<span className="row-span-2 self-center">{row.course && <CourseBadge course={row.course} />}</span>
						<MathLine className="col-span-2 text-callout text-muted-foreground">{courseTitle(row)}</MathLine>
						<MathLine className="text-headline text-foreground">{lessonTitle(row)}</MathLine>
						<RowMark status={rowStatus(row)} />
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}

/** The row's one status, flush right and whole: why the row is there
 *  (`reasonMark`, a new topic by why it starts), else, on its topic, the
 *  map's pie and the slip he would act on or where he stands (`rowWords`);
 *  nothing to say, an empty cell. */
export function RowMark({ status }: { status: RowStatus | null }) {
	if (!status) return <span />;
	if (status.kind === "standing") {
		const { facts } = status;
		return <StatusMark data-slot="today-standing" data-slip={facts.slip?.key} fact={{ kind: "standing", standing: facts.standing }} words={rowWords(facts)} whole className="justify-self-end" />;
	}
	return <StatusMark data-slot="today-why" data-starts={status.why.starts?.kind} {...reasonMark(status.why)} whole className="justify-self-end" />;
}
