import { Pie } from "@/components/ui/pie";
import type { Standing } from "./topic-standing";

/**
 * Where he stands on one topic, as the app's one pie (`../../ui/pie.md`),
 * the pie Home's rows draw a course with: it fills as he gets closer to
 * doing the topic on his own. The outline alone, fainter, is a topic not started;
 * a full one is a topic the course's ring counts; the warning ink is a
 * topic the engine calls weak. Decorative: the words beside it say it.
 */
export function TopicGlyph({ standing, className }: { standing: Standing; className?: string }) {
	const { fill, slipping } = standing;
	return (
		<Pie
			data-slot="topic-glyph"
			data-fill={fill}
			aria-hidden="true"
			share={fill}
			tone={slipping ? "warning" : fill === 0 ? "empty" : "muted"}
			className={className}
		/>
	);
}
