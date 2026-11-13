import { Hint } from "@/components/ui/hint";
import { courseProgress } from "@/components/study-home/agenda-rows/row-facts";
import type { StudyCourse } from "@/src/core";

/** The wedge of a 16px pie, from twelve o'clock clockwise, for a share
 *  under one. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + 5 * Math.sin(angle);
	const y = 8 - 5 * Math.cos(angle);
	return `M8 8 L8 3 A5 5 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/** How far along the course he is, as Things draws a project: a 16px
 *  circle that fills like a pie with the share of topics he can do on his
 *  own (`courseProgress`). Its count shows on hover and reads to a screen
 *  reader. */
export function ProgressPie({ course }: { course: StudyCourse }) {
	const progress = courseProgress(course);
	if (!progress) return <span />;
	const share = progress.solid / progress.of;
	const words = `${progress.solid} of ${progress.of} topics you can do on your own`;
	return (
		// The span takes the hover: a button's own icons ignore the pointer.
		<Hint label={words} side="left">
			<span className="inline-flex size-4 shrink-0">
				<svg data-slot="today-progress" role="img" aria-label={words} viewBox="0 0 16 16" className="size-4 text-muted-foreground">
					<circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
					{share >= 1 ? <circle cx="8" cy="8" r="5" fill="currentColor" /> : share > 0 && <path d={wedge(share)} fill="currentColor" />}
				</svg>
			</span>
		</Hint>
	);
}
