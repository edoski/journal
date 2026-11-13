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

/** The ring's radius and stroke in its 28-unit box: a stroke a tenth of
 *  its width, as rings are drawn (Material 3's circular progress, 4 on 40). */
const RING_R = 12.75;
const RING_STROKE = 2.5;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * Where he stands on one topic as a 28px ring beside the title (the
 * `ring` node): its arc runs clockwise from twelve o'clock a quarter for
 * each step towards doing the topic on his own; once he can, the ring
 * closes around a check. A dashed track is a topic not
 * started; the warning ink is a topic the engine calls weak.
 * Decorative: the node's label says it in words.
 */
export function TopicRing({ standing }: { standing: Standing }) {
	const { fill, slipping } = standing;
	const ink = slipping ? "text-warning" : "text-muted-foreground";
	return (
		<svg data-slot="topic-ring" data-fill={fill} aria-hidden="true" viewBox="0 0 28 28" className={cn("size-7 shrink-0", ink)}>
			<circle
				cx="14"
				cy="14"
				r={RING_R}
				fill="none"
				stroke="currentColor"
				strokeWidth={fill === 0 ? 1.5 : RING_STROKE}
				strokeDasharray={fill === 0 ? "3 3" : undefined}
				strokeOpacity={fill === 0 ? 0.6 : fill === 1 ? 1 : 0.16}
			/>
			{fill > 0 && fill < 1 && (
				<circle
					cx="14"
					cy="14"
					r={RING_R}
					fill="none"
					stroke="currentColor"
					strokeWidth={RING_STROKE}
					strokeDasharray={`${(fill * RING_LENGTH).toFixed(2)} ${RING_LENGTH.toFixed(2)}`}
					transform="rotate(-90 14 14)"
				/>
			)}
			{fill === 1 && <path d="M9.5 14.25 12.5 17.25 18.5 11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}
		</svg>
	);
}

/**
 * Where he stands on one topic as the card's own bottom edge (the `edge`
 * node): a 3px bar across the card, filled from the left a quarter for
 * each step towards doing the topic on his own, full once he can, in the
 * warning ink while the engine calls it weak. Empty for a topic not
 * started. Decorative: the node's label says it in words.
 */
export function TopicEdge({ standing }: { standing: Standing }) {
	const { fill, slipping } = standing;
	return (
		<span data-slot="topic-edge" data-fill={fill} aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/6">
			<span className={cn("block h-full", slipping ? "bg-warning" : "bg-muted-foreground")} style={{ width: `${fill * 100}%` }} />
		</span>
	);
}
