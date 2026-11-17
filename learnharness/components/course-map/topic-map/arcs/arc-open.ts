"use client";

import { createContext, useContext } from "react";
import type { ArcHandle } from "@/src/core";

/** What a map's arc marks may do (`TopicMap`, for `grouped` styles): open an
 *  arc folded to one card, or fold the one opened back; and the course's
 *  workspace, for a mark that links to the arc's place on its course page. */
export interface ArcOpen {
	opened: ArcHandle | null;
	open: (arc: ArcHandle | null) => void;
	/** The map moves its own camera; false on the course page, which scrolls it and shows an arc by its address. */
	ownCamera: boolean;
	workspace: string;
}

export const ArcOpenContext = createContext<ArcOpen | null>(null);

export function useArcOpen(): ArcOpen | null {
	return useContext(ArcOpenContext);
}
