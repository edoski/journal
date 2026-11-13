"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

/** Which of an area's edges have more of its content past them. */
export interface ScrollEdges {
	top: boolean;
	bottom: boolean;
	left: boolean;
	right: boolean;
}

const NONE: ScrollEdges = { top: false, bottom: false, left: false, right: false };

/** Within this many pixels of an end counts as at it (sub-pixel layout). */
const SLACK = 1;

/**
 * The edges of a scrolling area that have more content past them, kept as
 * it scrolls and as it or its content resizes, so the area can fade only
 * those edges. `measure` re-reads them on demand.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): [ScrollEdges, () => void] {
	const [edges, setEdges] = useState<ScrollEdges>(NONE);
	const measure = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		const next = {
			top: el.scrollTop > SLACK,
			bottom: el.scrollTop + el.clientHeight < el.scrollHeight - SLACK,
			left: el.scrollLeft > SLACK,
			right: el.scrollLeft + el.clientWidth < el.scrollWidth - SLACK,
		};
		setEdges((was) => (was.top === next.top && was.bottom === next.bottom && was.left === next.left && was.right === next.right ? was : next));
	}, [ref]);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		if (el.firstElementChild) observer.observe(el.firstElementChild);
		el.addEventListener("scroll", measure, { passive: true });
		return () => {
			observer.disconnect();
			el.removeEventListener("scroll", measure);
		};
	}, [ref, measure]);
	return [edges, measure];
}
