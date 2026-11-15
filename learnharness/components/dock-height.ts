"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The composer's block overlays the transcript's foot, so the transcript
 *  keeps a spacer as tall as it: the block's height is reported before
 *  paint and on every resize (a growing field, the window, the column),
 *  with the scroller's classic scrollbar gutter, which the overlay leaves
 *  uncovered (zero with macOS overlay scrollbars). */
export function useDockReserve({ scrollRef, blockRef, onHeight, onScrollbarInset }: {
	scrollRef: RefObject<HTMLElement | null>;
	blockRef: RefObject<HTMLElement | null>;
	onHeight: (height: number) => void;
	onScrollbarInset: (inset: number) => void;
}) {
	useIsoLayoutEffect(() => {
		const column = scrollRef.current;
		const block = blockRef.current;
		if (!column || !block) return;
		const measure = () => {
			onScrollbarInset(Math.round((column.offsetWidth - column.clientWidth) / 2));
			onHeight(block.getBoundingClientRect().height);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(column);
		observer.observe(block);
		window.addEventListener("resize", measure);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [scrollRef, blockRef, onHeight, onScrollbarInset]);
}

/** Overlay and transcript are siblings. Keep native scrolling in an actual
 * scroll container (including the short-window viewport), then forward only
 * at its edge. overflow:hidden/visible boxes cannot consume the wheel. */
export function forwardDockWheel(event: WheelEvent, root: HTMLElement, transcript: HTMLElement) {
	if (event.deltaY === 0) return;
	for (let n = event.target as HTMLElement | null; n && n !== root; n = n.parentElement) {
		if (!(n instanceof HTMLElement) || !/^(auto|scroll)$/.test(getComputedStyle(n).overflowY)) continue;
		if (n.scrollHeight - n.clientHeight < 2) continue;
		if (event.deltaY < 0 ? n.scrollTop > 0 : n.scrollTop < n.scrollHeight - n.clientHeight - 0.5) return;
	}
	event.preventDefault();
	transcript.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? transcript.clientHeight : 1);
}
