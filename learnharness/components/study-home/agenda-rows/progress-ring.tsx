import { Hint } from "@/components/ui/hint";
import { Ring } from "@/components/ui/pie";
import { courseProgress } from "@/components/study-home/agenda-rows/row-facts";
import type { StudyCourse } from "@/src/core";
import { courseShareWords } from "@/components/study-words";

/** How far along the course he is, drawn with the app's progress ring
 *  (`../../ui/pie.md`), never a topic's pie: the share of topics he can do
 *  on his own (`courseProgress`). Its count shows on hover and reads to a
 *  screen reader. */
export function ProgressRing({ course }: { course: StudyCourse }) {
	const progress = courseProgress(course);
	if (!progress) return <span />;
	const share = progress.solid / progress.of;
	const words = courseShareWords(progress.solid, progress.of);
	return (
		// The span takes the hover: a button's own icons ignore the pointer.
		<Hint label={words} side="left">
			<span className="inline-flex size-4 shrink-0">
				<Ring data-slot="today-progress" role="img" aria-label={words} share={share} />
			</span>
		</Hint>
	);
}
