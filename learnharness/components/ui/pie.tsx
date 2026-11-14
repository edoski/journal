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
 * The app's one pie (spec: pie.md), where he stands on a topic, as Things
 * draws a project: a thin 16px ring with a wedge that fills clockwise from
 * twelve o'clock as `share` goes from 0 to 1, full at 1. `tone` "empty"
 * draws the ring dashed with no wedge (a topic not started). The topic
 * map, the course page's rows, the sidebar and the topic page draw a topic
 * with it (`TopicGlyph`); a whole course is a `Ring`.
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

/**
 * The app's one progress ring (spec: pie.md): how far along a whole course
 * is, kept apart from a topic's `Pie` so the two never read as one thing
 * (Edo, 14 Nov 2026: Home's row pie meant the course while the map's meant
 * the topic). A 16px track at 40%, and over it a square-ended arc in
 * `currentColor` from twelve o'clock clockwise as `share` goes from 0 to 1,
 * a closed ring at 1: a firm track and square ends, so it never reads as a
 * spinner. Hollow, where a pie is filled.
 */
export function Ring({ share, className, ...svg }: { share: number } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	const arc = Math.min(1, Math.max(0, share));
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0 text-muted-foreground", className)} {...svg}>
			<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth="2.5" />
			{arc > 0 && (
				<circle
					cx="8"
					cy="8"
					r="6.25"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					pathLength={1}
					strokeDasharray={`${arc} 1`}
					transform="rotate(-90 8 8)"
				/>
			)}
		</svg>
	);
}
