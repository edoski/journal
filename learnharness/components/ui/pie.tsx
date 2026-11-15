import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** The outline every progress glyph draws: the whole its share is of, a
 *  full solid circle in the glyph's own ink (spec: pie.md). */
const OUTLINE = { r: 7.25, width: 1.5 };

/** A topic's wedge reaches this far from the centre, 1.5 inside the
 *  outline's inner edge. */
const WEDGE = 5;

/** A course's band: inside the outline with a 1px gap, its centre hollow. */
const BAND = { r: 4.25, width: 2.5 };

/** The wedge of a share under one, from twelve o'clock clockwise. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + WEDGE * Math.sin(angle);
	const y = 8 - WEDGE * Math.cos(angle);
	return `M8 8 L8 ${8 - WEDGE} A${WEDGE} ${WEDGE} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/**
 * The app's one progress glyph (spec: pie.md), an amount at rest: a full,
 * solid outline in the ink, and the share drawn inside it from twelve
 * o'clock clockwise, a wedge from the centre (`shape` "wedge") or a band
 * with its centre hollow (`shape` "band"). Nothing started is the outline
 * alone. Never animated and never dashed: a partial arc with no whole
 * around it, or a dashed ring, is a loading spinner's own glyph.
 */
function Progress({ share, shape, className, ...svg }: { share: number; shape: "wedge" | "band" } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	const amount = Math.min(1, Math.max(0, share));
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} {...svg}>
			<circle data-part="outline" cx="8" cy="8" r={OUTLINE.r} fill="none" stroke="currentColor" strokeWidth={OUTLINE.width} />
			{amount > 0 &&
				(shape === "wedge" ? (
					amount >= 1 ? (
						<circle data-part="share" cx="8" cy="8" r={WEDGE} fill="currentColor" />
					) : (
						<path data-part="share" d={wedge(amount)} fill="currentColor" />
					)
				) : (
					<circle
						data-part="share"
						cx="8"
						cy="8"
						r={BAND.r}
						fill="none"
						stroke="currentColor"
						strokeWidth={BAND.width}
						pathLength={1}
						strokeDasharray={amount >= 1 ? undefined : `${amount} 1`}
						transform="rotate(-90 8 8)"
					/>
				))}
		</svg>
	);
}

/** How the pie is inked: muted, the warning ink for a topic that slips,
 *  or fainter for one not started. */
export type PieTone = "muted" | "warning" | "empty";

const INK: Record<PieTone, string> = { muted: "text-muted-foreground", warning: "text-warning", empty: "text-muted-foreground/60" };

/**
 * Where he stands on a topic, as Things draws a project: the outline with
 * a wedge that fills clockwise from twelve o'clock as `share` goes from 0
 * to 1, a full disc at 1. `tone` "empty" is a topic not started: the
 * outline alone, fainter. The topic map, the course page's rows, the
 * sidebar and the topic page draw a topic with it (`TopicGlyph`).
 */
export function Pie({ share, tone = "muted", className, ...svg }: { share: number; tone?: PieTone } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	return <Progress share={tone === "empty" ? 0 : share} shape="wedge" className={cn(INK[tone], className)} {...svg} />;
}

/**
 * How far along a whole course (or arc) is: the same outline with a band
 * inside it that fills clockwise from twelve o'clock, closed at 1. Its
 * centre stays hollow where a topic's pie is filled, so a course's share
 * on a Today row is never read as the topic's standing on the map above
 * it (Edo, 14 Nov 2026).
 */
export function Ring({ share, className, ...svg }: { share: number } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	return <Progress share={share} shape="band" className={cn("text-foreground/80", className)} {...svg} />;
}
