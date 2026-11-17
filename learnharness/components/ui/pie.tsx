import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** The outline the pie draws: the whole its share is of, a full solid
 *  circle in the pie's own ink (spec: pie.md). */
const OUTLINE = { r: 7.25, width: 1.5 };

/** The wedge reaches this far from the centre, 1.5 inside the outline's
 *  inner edge. */
const WEDGE = 5;

/** The wedge of a share under one, from twelve o'clock clockwise. Pure. */
function wedge(share: number): string {
	const angle = share * 2 * Math.PI;
	const x = 8 + WEDGE * Math.sin(angle);
	const y = 8 - WEDGE * Math.cos(angle);
	return `M8 8 L8 ${8 - WEDGE} A${WEDGE} ${WEDGE} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}

/** How the pie is inked: muted, the warning ink for a topic that slips,
 *  or fainter for one not started. */
export type PieTone = "muted" | "warning" | "empty";

const INK: Record<PieTone, string> = { muted: "text-muted-foreground", warning: "text-warning", empty: "text-muted-foreground/60" };

/**
 * Where he stands on a topic, as Things draws a project (spec: pie.md), an
 * amount at rest: a full, solid outline in the ink, with a wedge that fills
 * clockwise from twelve o'clock as `share` goes from 0 to 1, a full disc at
 * 1. Nothing started is the outline alone; `tone` "empty" draws it fainter.
 * Never animated and never dashed: a partial arc with no whole around it,
 * or a dashed ring, is a loading spinner's own glyph. The topic map, the
 * course page's rows, the sidebar and the topic page draw a topic with it
 * (`TopicGlyph`).
 */
export function Pie({ share, tone = "muted", className, ...svg }: { share: number; tone?: PieTone } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
	const amount = tone === "empty" ? 0 : Math.min(1, Math.max(0, share));
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", INK[tone], className)} {...svg}>
			<circle data-part="outline" cx="8" cy="8" r={OUTLINE.r} fill="none" stroke="currentColor" strokeWidth={OUTLINE.width} />
			{amount >= 1 ? <circle data-part="share" cx="8" cy="8" r={WEDGE} fill="currentColor" /> : amount > 0 && <path data-part="share" d={wedge(amount)} fill="currentColor" />}
		</svg>
	);
}
