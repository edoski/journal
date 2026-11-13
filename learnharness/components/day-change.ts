"use client";

import { useEffect, useRef } from "react";

/** The local calendar day of `now`, as "YYYY-MM-DD". */
export function localDay(now: Date): string {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Milliseconds from `now` to the next local midnight. */
export function msToMidnight(now: Date): number {
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return next.getTime() - now.getTime();
}

interface ResumeBridge {
	lh?: { onResume?: (cb: () => void) => () => void };
}

/**
 * Calls `onDayChange` when the local day turns over while the window is
 * open, so "today" (the due reviews, the calendar's today) never shows
 * yesterday. A calendar day is a real time event: one timer to the next
 * local midnight, re-armed each time. A machine that slept through
 * midnight is caught when it wakes (Electron's resume) or the window shows
 * again; both check the day instead of trusting the timer.
 */
export function useDayChange(onDayChange: () => void): void {
	const latest = useRef(onDayChange);
	latest.current = onDayChange;
	useEffect(() => {
		let day = localDay(new Date());
		let timer: ReturnType<typeof setTimeout> | undefined;
		const check = () => {
			const now = new Date();
			if (localDay(now) !== day) {
				day = localDay(now);
				latest.current();
			}
			clearTimeout(timer);
			timer = setTimeout(check, msToMidnight(now));
		};
		const onVisible = () => document.visibilityState === "visible" && check();
		document.addEventListener("visibilitychange", onVisible);
		const offResume = (window as Window & ResumeBridge).lh?.onResume?.(check);
		check();
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
			offResume?.();
		};
	}, []);
}
