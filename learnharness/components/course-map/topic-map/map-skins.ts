"use client";

import { CURRENT_SKIN, type MapSkin } from "./map-skin";
import { useMapStyle, type MapStyle } from "./map-style";
import { TREE_SKIN } from "./canvas/canvas-skin";

/** Every map style's drawing, Current first. */
const SKINS: Record<MapStyle, MapSkin> = {
	current: CURRENT_SKIN,
	tree: TREE_SKIN,
};

/** The drawing every course map uses, from the map's switch (map-style.ts). */
export function useMapSkin(): { style: MapStyle; skin: MapSkin } {
	const style = useMapStyle();
	return { style, skin: SKINS[style] };
}
