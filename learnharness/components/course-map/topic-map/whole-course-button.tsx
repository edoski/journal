"use client";

import { useEffect } from "react";
import { LocateFixedIcon, ZoomOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * A course map's zoom out (spec: topic-map.md, Whole course): "Whole
 * course" shows every topic, then "Back to where you are" returns to the
 * opening view. "-" does the same while it shows, unless a field has the
 * key. A page renders it only when the map opens on less than the whole
 * course, and holds `whole` itself.
 */
export function WholeCourseButton({ whole, onToggle, className }: { whole: boolean; onToggle: () => void; className?: string }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.key !== "-" || e.metaKey || e.ctrlKey || e.altKey) return;
			if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable=true]")) return;
			onToggle();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onToggle]);
	const label = whole ? "Back to where you are" : "Whole course";
	return (
		<Hint label={label} binding="-" side="bottom">
			<Button
				variant="quiet"
				size="sm"
				data-slot="course-map-whole"
				aria-pressed={whole}
				onClick={onToggle}
				className={cn("lh-no-drag text-label font-normal", className)}
			>
				{whole ? <LocateFixedIcon aria-hidden className="size-3.5" /> : <ZoomOutIcon aria-hidden className="size-3.5" />}
				{label}
			</Button>
		</Hint>
	);
}
