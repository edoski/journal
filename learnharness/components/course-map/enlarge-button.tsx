"use client";

import { useEffect, type ComponentProps } from "react";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * A course map's enlarge control (spec: topic-map.md, Enlarge), Home's and
 * the course page's: a quiet 32px icon button, Maximize 2, that lets the
 * map take over its page, then Minimize 2, `back` its label, that returns.
 * While enlarged, Esc returns too, unless something open over the map
 * claims it first (Radix marks it handled). The page holds `enlarged`.
 */
export function EnlargeButton({
	enlarged,
	onEnlarge,
	back,
	className,
	...rest
}: { enlarged: boolean; onEnlarge: (enlarged: boolean) => void; back: string } & Omit<ComponentProps<typeof Button>, "onClick" | "children">) {
	useEffect(() => {
		if (!enlarged) return;
		const onKey = (e: KeyboardEvent) => {
			if (!e.defaultPrevented && e.key === "Escape") onEnlarge(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enlarged, onEnlarge]);
	const label = enlarged ? back : "Enlarge map";
	return (
		<Hint label={label} binding={enlarged ? "escape" : undefined} side="left">
			<Button variant="quiet" size="icon-row" aria-label={label} aria-pressed={enlarged} onClick={() => onEnlarge(!enlarged)} className={cn("lh-no-drag", className)} {...rest}>
				{enlarged ? <Minimize2Icon /> : <Maximize2Icon />}
			</Button>
		</Hint>
	);
}
