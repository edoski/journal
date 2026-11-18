"use client";

import { useEffect, useRef, useState } from "react";
import { Hint } from "@/components/ui/hint";
import {
	clampSidebarWidth,
	maxSidebarWidth,
	SIDEBAR_KEY_STEP,
	SIDEBAR_MIN_WIDTH,
	storeSidebarWidth,
	useSidebarMaxWidth,
} from "@/components/unit-inbox/sidebar-width";

interface Drag {
	pointer: number;
	startX: number;
	start: number;
	x: number;
	width: number;
	frame: number | null;
}

/**
 * The sidebar's right edge as a handle (spec: unit-inbox.md), T3 Code's
 * rail: drag it to resize, double-click it for the default width, or focus
 * it and use the arrow keys, Home and End. While dragging, the width is
 * written straight to the sidebar's `--sidebar-width` with its slide
 * turned off, and kept once the pointer lets go.
 */
export function SidebarResizeHandle({ width, sidebarId, sidebar }: { width: number; sidebarId: string; sidebar: React.RefObject<HTMLElement | null> }) {
	const drag = useRef<Drag | null>(null);
	const [dragging, setDragging] = useState(false);

	const show = (next: number) => sidebar.current?.style.setProperty("--sidebar-width", `${next}px`);

	const finish = (commit: boolean) => {
		const d = drag.current;
		if (!d) return;
		drag.current = null;
		if (d.frame !== null) cancelAnimationFrame(d.frame);
		document.body.style.removeProperty("cursor");
		document.body.style.removeProperty("user-select");
		sidebar.current?.style.removeProperty("transition-duration");
		setDragging(false);
		if (!commit) return show(d.start);
		const final = clampSidebarWidth(d.start + d.x - d.startX, window.innerWidth);
		show(final);
		if (final !== d.start) storeSidebarWidth(final);
	};
	const finishRef = useRef(finish);
	finishRef.current = finish;

	useEffect(() => {
		const onBlur = () => finishRef.current(true);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("blur", onBlur);
			finishRef.current(false);
		};
	}, []);

	const max = useSidebarMaxWidth();
	const step = (next: number) => storeSidebarWidth(clampSidebarWidth(next, window.innerWidth));

	return (
		<div className="relative z-20 w-0 shrink-0">
			<Hint label="Drag to resize" side="right">
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize sidebar"
					aria-controls={sidebarId}
					aria-valuenow={width}
					aria-valuemin={SIDEBAR_MIN_WIDTH}
					aria-valuemax={max}
					tabIndex={0}
					data-slot="sidebar-resize"
					data-dragging={dragging || undefined}
					className="lh-no-drag absolute top-13 bottom-0 -left-2 w-4 cursor-w-resize touch-none outline-none after:absolute after:inset-y-0 after:left-[7px] after:w-0.5 after:transition-colors after:duration-150 hover:after:bg-border focus-visible:after:bg-ring data-dragging:after:bg-border motion-reduce:after:transition-none"
					onPointerDown={(e) => {
						if (e.button !== 0 || drag.current) return;
						e.currentTarget.setPointerCapture(e.pointerId);
						e.preventDefault();
						drag.current = { pointer: e.pointerId, startX: e.clientX, start: width, x: e.clientX, width, frame: null };
						sidebar.current?.style.setProperty("transition-duration", "0ms");
						document.body.style.cursor = "col-resize";
						document.body.style.userSelect = "none";
						setDragging(true);
					}}
					onPointerMove={(e) => {
						const d = drag.current;
						if (!d || d.pointer !== e.pointerId) return;
						d.x = e.clientX;
						if (d.frame !== null) return;
						d.frame = requestAnimationFrame(() => {
							d.frame = null;
							d.width = clampSidebarWidth(d.start + d.x - d.startX, window.innerWidth);
							show(d.width);
						});
					}}
					onPointerUp={(e) => {
						if (drag.current?.pointer !== e.pointerId) return;
						drag.current.x = e.clientX;
						finish(true);
					}}
					onPointerCancel={() => finish(true)}
					onLostPointerCapture={() => finish(true)}
					onDoubleClick={() => storeSidebarWidth(null)}
					onKeyDown={(e) => {
						const next =
							e.key === "ArrowLeft" ? width - SIDEBAR_KEY_STEP : e.key === "ArrowRight" ? width + SIDEBAR_KEY_STEP : e.key === "Home" ? SIDEBAR_MIN_WIDTH : e.key === "End" ? maxSidebarWidth(window.innerWidth) : null;
						if (next === null) return;
						e.preventDefault();
						step(next);
					}}
				/>
			</Hint>
		</div>
	);
}
