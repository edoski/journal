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

/** The course map's scroll box inside a frame on Home: no scrollbars, and a
 *  drawing shorter than the frame sits at its middle. */
export const MAP_BOX = "grid [align-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
