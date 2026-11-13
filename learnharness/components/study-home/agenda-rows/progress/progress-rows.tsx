import { LineTarget } from "@/components/study-home/agenda-rows/line-target";
import { courseProgress, courseTitle, foldLines, lessonTitle, lineKey, type RowsProps } from "@/components/study-home/agenda-rows/row-facts";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import type { StudyCourse } from "@/src/core";

/** Ring, course, lesson: the same columns on every tile. */
const TILE =
	"grid h-14 w-full grid-cols-[1rem_9rem_minmax(0,1fr)] items-center justify-items-start gap-x-4 rounded-lg bg-card px-4 text-left font-normal whitespace-normal hover:bg-accent";

/**
 * Agenda rows "progress" (spec: progress.md): each course its own tile,
 * led by a ring that fills as the course's topics get taught.
 */
export function ProgressRows({ rows, busy, onContinue }: RowsProps) {
	const { shown, also } = foldLines(rows);
	return (
		<ul data-slot="progress-rows" className="flex flex-col gap-1.5">
			{shown.map((row) => (
				<li key={lineKey(row)}>
					<LineTarget row={row} busy={busy} onContinue={onContinue} data-slot="today-line" className={TILE}>
						{row.course ? <ProgressPie course={row.course} /> : <span />}
						<span className="w-full truncate text-row text-foreground">{courseTitle(row)}</span>
						<span className="w-full truncate text-row font-medium text-foreground">{lessonTitle(row)}</span>
					</LineTarget>
				</li>
			))}
			{also.length > 0 && <TodayAlso rows={also} busy={busy} onContinue={onContinue} className="px-4" />}
		</ul>
	);
}

/** The wedge of a 16px pie, from twelve o'clock clockwise, for a share
 *  under one. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + 5 * Math.sin(angle);
	const y = 8 - 5 * Math.cos(angle);
	return `M8 8 L8 3 A5 5 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/** How far along the course he is, as Things draws a project: a 16px
 *  circle that fills like a pie as the course's topics get taught. The
 *  words are for a screen reader. */
function ProgressPie({ course }: { course: StudyCourse }) {
	const progress = courseProgress(course);
	if (!progress) return <span />;
	const share = progress.started / progress.of;
	return (
		<svg data-slot="today-progress" role="img" aria-label={`${progress.started} of ${progress.of} topics taught`} viewBox="0 0 16 16" className="size-4 shrink-0 text-muted-foreground">
			<circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
			{share >= 1 ? <circle cx="8" cy="8" r="5" fill="currentColor" /> : share > 0 && <path d={wedge(share)} fill="currentColor" />}
		</svg>
	);
}
