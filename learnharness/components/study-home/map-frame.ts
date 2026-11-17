/** A mask that fades a map's edges into the page, `x` px in from the sides
 *  and `y` px from the top and bottom, so a cropped drawing never ends on a
 *  hard line. */
export function mapFade(x: number, y: number): React.CSSProperties {
	return {
		maskImage: `linear-gradient(to right, transparent, #000 ${x}px, #000 calc(100% - ${x}px), transparent), linear-gradient(to bottom, transparent, #000 ${y}px, #000 calc(100% - ${y}px), transparent)`,
		maskComposite: "intersect",
		WebkitMaskComposite: "source-in",
	};
}

/** The fade of a map pane beside a list (the topic page's lesson map and
 *  the map of what a topic builds on): Home's map frame's, slimmer at the
 *  sides of this narrower column. */
export const PANE_FADE = { x: 24, y: 40 } as const;
