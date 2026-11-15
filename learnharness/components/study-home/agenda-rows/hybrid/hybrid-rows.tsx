import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressRing } from "@/components/study-home/agenda-rows/progress-ring";
import { courseTitle, foldLines, lessonTitle, lineKey, pointProps, studiedLabel, whyOf, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { WhyMark } from "@/components/study-home/agenda-rows/why-mark";
import { rowStandings } from "@/components/study-home/agenda-rows/row-aside";
import { cn } from "@/lib/utils";
import { MathLine } from "@/components/ui/math-line";

/** The pie beside both lines; the course line with when he last studied
 *  it at its end, then the lesson line with why now at its end. The ends
 *  sit flush right, so each lines up down the list. */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-lg px-3 text-left font-normal whitespace-normal data-[pointed]:bg-fill-hover";
const COLUMNS = "grid-cols-[1rem_minmax(0,1fr)_auto]";
/** With the standing: its own column before the ends, as wide on every
 *  row, so the facts line up down the list. */
const COLUMNS_ASIDE = "grid-cols-[1rem_minmax(0,1fr)_10rem_auto]";

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
	const asides = standing ? rowStandings(rows) : null;
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row, i) => {
				// A standing is the lesson's, on the lesson line.
				const fact = asides && <AsideCell words={asides[i] ?? null} />;
				const blank = asides && <span />;
				return (
					<li key={lineKey(row)} className={HAIRLINE}>
						<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={cn(ROW, asides ? COLUMNS_ASIDE : COLUMNS)} {...pointProps(row, point)}>
							<span className="row-span-2">{row.course && <ProgressRing course={row.course} />}</span>
							<MathLine className="text-label text-muted-foreground">{courseTitle(row)}</MathLine>
							{blank}
							<span data-slot="today-when" className="justify-self-end text-label text-muted-foreground tabular-nums">
								{studiedLabel(row)}
							</span>
							<MathLine className="text-control font-medium text-foreground">{lessonTitle(row)}</MathLine>
							{fact}
							<WhyMark why={whyOf(row)} />
						</LineTarget>
					</li>
				);
			})}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}

/** The standing's cell; empty where the row has none. */
function AsideCell({ words }: { words: string | null }) {
	return (
		<span data-slot={words ? "today-aside" : undefined} className="truncate text-label text-muted-foreground">
			{words}
		</span>
	);
}
