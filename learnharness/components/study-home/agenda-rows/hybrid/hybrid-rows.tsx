import { ArrowRightIcon, BookmarkIcon, CircleXIcon, HistoryIcon, MessageCircleQuestionIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { ProgressPie } from "@/components/study-home/agenda-rows/progress-pie";
import { courseTitle, foldLines, lessonTitle, lineKey, studiedAgo, whyOf, type RowsProps, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";

/** The pie beside both lines; the course line with when he last studied
 *  it at its end, then the lesson line with why now at its end. The ends
 *  sit flush right, so each lines up down the list. */
const ROW =
	"-mx-3 grid h-16 w-[calc(100%+1.5rem)] grid-cols-[1rem_minmax(0,1fr)_auto] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-1 rounded-lg px-3 text-left font-normal whitespace-normal";

/** A hairline above every row but the first, inset to the text's edges. */
const HAIRLINE = "relative not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-border/50";

/** One icon per kind of reason; the sidebar's own for a turn that waits
 *  and for a review. */
const WHY_ICON: Record<Why["kind"], LucideIcon> = {
	reply: MessageCircleQuestionIcon,
	missed: CircleXIcon,
	review: HistoryIcon,
	task: BookmarkIcon,
	next: ArrowRightIcon,
};

/**
 * Agenda rows "hybrid" (spec: hybrid.md): progress, recency and reason,
 * each beside what it is about. The pie leads the course; the course line
 * ends with when he last studied it; the lesson line ends with why it is
 * there today, as an icon and a few words.
 */
export function HybridRows({ rows, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="hybrid-rows" className="flex flex-col">
			{shown.map((row) => (
				<li key={lineKey(row)} className={HAIRLINE}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={ROW}>
						<span className="row-span-2">{row.course && <ProgressPie course={row.course} />}</span>
						<span className="truncate text-label text-muted-foreground">{courseTitle(row)}</span>
						<span data-slot="today-when" className="justify-self-end text-label text-muted-foreground tabular-nums">
							{studiedAgo(row)}
						</span>
						<span className="truncate text-control font-medium text-foreground">{lessonTitle(row)}</span>
						<WhyMark why={whyOf(row)} />
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className={HAIRLINE} />}
		</ul>
	);
}

/** Why the line is there: its icon, then a few words. A turn that waits
 *  wears the accent, as it does in the sidebar. */
function WhyMark({ why }: { why: Why | null }) {
	if (!why) return <span />;
	const Icon = WHY_ICON[why.kind];
	return (
		<span data-slot="today-why" data-kind={why.kind} className={cn("inline-flex max-w-56 items-center gap-1.5 justify-self-end text-label", why.kind === "reply" ? "font-medium text-link" : "text-muted-foreground")}>
			<Icon aria-hidden className="size-3.5" />
			<span className="truncate">{why.short}</span>
		</span>
	);
}
