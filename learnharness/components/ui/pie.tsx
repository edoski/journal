import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** The wedge of the 16px pie, from twelve o'clock clockwise, for a share
 *  under one. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + 5 * Math.sin(angle);
	const y = 8 - 5 * Math.cos(angle);
	return `M8 8 L8 3 A5 5 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/** How the pie is inked: muted, the warning ink for a topic that slips,
 *  or dashed and fainter for one not started. */
export type PieTone = "muted" | "warning" | "empty";

const INK: Record<PieTone, string> = { muted: "text-muted-foreground", warning: "text-warning", empty: "text-muted-foreground/60" };

/**
 * The app's one progress pie (spec: pie.md), as Things draws a project: a
 * thin 16px ring with a wedge that fills clockwise from twelve o'clock as
 * `share` goes from 0 to 1, full at 1. `tone` "empty" draws the ring
 * dashed with no wedge (a topic not started). Home's course rows and the
 * course page's header draw a course with it, and the topic map, the
 * course page's rows and the topic page draw a topic (`TopicGlyph`).
 */
export function Pie({ share, tone = "muted", className, ...svg }: { share: number; tone?: PieTone } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	const empty = tone === "empty";
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", INK[tone], className)} {...svg}>
			<circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={empty ? "2.85 2.85" : undefined} />
			{!empty && (share >= 1 ? <circle cx="8" cy="8" r="5" fill="currentColor" /> : share > 0 && <path d={wedge(share)} fill="currentColor" />)}
		</svg>
	);
}
