import { Hint } from "@/components/ui/hint";
import { courseProgress } from "@/components/study-home/agenda-rows/row-facts";
import type { StudyCourse } from "@/src/core";
import { courseShareWords } from "@/components/study-words";
import { CourseMark } from "@/components/unit-inbox/unit-row";

/** The badge's side, its corner and the progress line's width, in px. */
const BADGE = { side: 40, corner: 10, line: 2 };

/** A rounded square's outline from the middle of its top edge, clockwise,
 *  so a share of it reads as a ring filling from twelve o'clock. Pure. */
function squareFromTop(inset: number): string {
	const a = inset;
	const b = BADGE.side - inset;
	const r = BADGE.corner - inset;
	const mid = BADGE.side / 2;
	return `M${mid} ${a} H${b - r} A${r} ${r} 0 0 1 ${b} ${a + r} V${b - r} A${r} ${r} 0 0 1 ${b - r} ${b} H${a + r} A${r} ${r} 0 0 1 ${a} ${b - r} V${a + r} A${r} ${r} 0 0 1 ${a + r} ${a} Z`;
}

/**
 * A course leading a two-line row, Home's Today rows and the course page's
 * Now (spec: hybrid.md): the course's mark (`CourseMark`) at 40px, with how
 * far along the course he is as a line that runs round its edge from twelve
 * o'clock, the share of topics he can do on his own (`courseProgress`). Its
 * count shows on hover and reads to a screen reader.
 */
export function CourseBadge({ course }: { course: StudyCourse }) {
	const progress = courseProgress(course);
	const share = progress ? Math.min(1, progress.solid / progress.of) : 0;
	const words = progress ? courseShareWords(progress.solid, progress.of) : course.map.title;
	const outline = squareFromTop(BADGE.line / 2);
	return (
		<Hint label={words} side="left">
			<span data-slot="course-badge" role="img" aria-label={words} className="relative flex shrink-0 text-muted-foreground">
				<CourseMark title={course.map.title} size="badge" />
				<svg aria-hidden viewBox={`0 0 ${BADGE.side} ${BADGE.side}`} className="absolute inset-0 size-full">
					<path d={outline} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={BADGE.line} />
					{share > 0 && (
						<path data-slot="today-progress" d={outline} fill="none" stroke="currentColor" strokeWidth={BADGE.line} strokeLinecap="round" pathLength={1} strokeDasharray={share >= 1 ? undefined : `${share} 1`} />
					)}
				</svg>
			</span>
		</Hint>
	);
}
