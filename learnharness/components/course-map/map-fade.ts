import type { CSSProperties } from "react";

/** How far every map's fade reaches in, from the sides (`x`) and from the
 *  top and bottom (`y`), and so the room the map leaves inside it. */
export const MAP_FADE = {
	/** Home's map and the course page's: one frame (`MapFrame`). */
	page: { x: 64, y: 40 },
	/** A map pane in the topic page's narrower column (its lesson map, the
	 *  map of what a topic builds on): Home's fade, slimmer at the sides. */
	pane: { x: 24, y: 40 },
} as const;

/** A mask that fades a map's edges into the page, as far as `MAP_FADE`
 *  says, so a cropped drawing never ends on a hard line. */
export function vignette(fade: keyof typeof MAP_FADE): CSSProperties {
	const { x, y } = MAP_FADE[fade];
	return {
		maskImage: `linear-gradient(to right, transparent, #000 ${x}px, #000 calc(100% - ${x}px), transparent), linear-gradient(to bottom, transparent, #000 ${y}px, #000 calc(100% - ${y}px), transparent)`,
		maskComposite: "intersect",
		WebkitMaskComposite: "source-in",
	};
}
