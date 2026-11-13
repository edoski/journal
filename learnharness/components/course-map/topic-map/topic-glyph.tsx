import { cn } from "@/lib/utils";
import type { Standing } from "./topic-standing";

/** The wedge of the 16px pie, from twelve o'clock clockwise, for a share
 *  under one. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + 5 * Math.sin(angle);
	const y = 8 - 5 * Math.cos(angle);
	return `M8 8 L8 3 A5 5 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/**
 * Where he stands on one topic, drawn as the course's progress pie draws a
 * course (Today's rows): a 16px ring that fills as he gets closer to doing
 * the topic on his own. A dashed, empty ring is a topic not started; a
 * full one is a topic the course's pie counts; the warning ink is a topic
 * the engine calls weak. Decorative: the node's label says it in words.
 */
export function TopicGlyph({ standing, className }: { standing: Standing; className?: string }) {
	const { fill, slipping } = standing;
	return (
		<svg
			data-slot="topic-glyph"
			data-fill={fill}
			aria-hidden="true"
			viewBox="0 0 16 16"
			className={cn("size-4 shrink-0", slipping ? "text-warning" : fill === 0 ? "text-muted-foreground/60" : "text-muted-foreground", className)}
		>
			<circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={fill === 0 ? "2.85 2.85" : undefined} />
			{fill === 1 ? <circle cx="8" cy="8" r="5" fill="currentColor" /> : fill > 0 && <path d={wedge(fill)} fill="currentColor" />}
		</svg>
	);
}
