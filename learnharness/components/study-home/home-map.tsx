"use client";

import { useEffect, useMemo } from "react";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import type { CourseMapTopic, StudyCourse } from "@/src/core";
import { CourseMapGraph } from "@/components/course-map/course-map-graph";
import { layoutCourseMap } from "@/components/course-map/course-map-layout";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The map's edges fade into the page on every side, like a vignette. */
const VIGNETTE = {
	maskImage:
		"linear-gradient(to right, transparent, #000 64px, #000 calc(100% - 64px), transparent), linear-gradient(to bottom, transparent, #000 40px, #000 calc(100% - 40px), transparent)",
	maskComposite: "intersect",
	WebkitMaskComposite: "source-in",
} as const;

/**
 * The selected course's map on Home (spec: home-map.md): course tabs over
 * the course map, embedded as it is and framed with faded edges, its camera
 * on where the learner is. The enlarge control lets the map take over Home
 * for a moment; it and Esc bring Home back. Enlarged or not, it is only
 * the map: no List view and no More menu (Edo, 12 Nov 2026).
 */
export function HomeMap({
	courses,
	workspace,
	onSelect,
	enlarged,
	onEnlarge,
	onStudy,
	busy,
}: {
	courses: readonly StudyCourse[];
	/** The course whose map shows. */
	workspace: string;
	onSelect: (workspace: string) => void;
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
	onStudy: (topic: CourseMapTopic, workspace: string) => void;
	busy: boolean;
}) {
	const course = courses.find((c) => c.map.workspace === workspace) ?? courses[0]!;
	const { map } = course;
	const layout = useMemo(() => layoutCourseMap(map.topics, map.edges), [map]);
	useEffect(() => {
		if (!enlarged) return;
		// An open popover claims Esc first (Radix marks it handled).
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented) onEnlarge(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enlarged, onEnlarge]);

	return (
		<section aria-label="Course map" data-slot="home-map" data-enlarged={enlarged || undefined} className="relative flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex h-8 shrink-0 items-center justify-between gap-4">
				<Tabs value={map.workspace} onValueChange={onSelect}>
					<TabsList aria-label="Course" data-slot="home-map-tabs">
						{courses.map((c) => (
							<TabsTrigger key={c.map.workspace} value={c.map.workspace} className="lh-no-drag">
								{c.map.title}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<Hint label={enlarged ? "Back to Home" : "Enlarge map"} binding={enlarged ? "escape" : undefined} side="left">
					<Button
						variant="quiet"
						size="icon-row"
						data-slot="home-map-enlarge"
						aria-label={enlarged ? "Back to Home" : "Enlarge map"}
						aria-pressed={enlarged}
						onClick={() => onEnlarge(!enlarged)}
						className="lh-no-drag -mr-2"
					>
						{enlarged ? <Minimize2Icon /> : <Maximize2Icon />}
					</Button>
				</Hint>
			</div>
			<div data-slot="home-map-frame" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
				{map.topics.length > 0 ? (
					<CourseMapGraph
						key={map.workspace}
						map={map}
						layout={layout}
						// A new request when the frame grows or shrinks brings the camera back to the current topic.
						jumpRequest={enlarged ? 2 : 1}
						onStudy={(topic) => onStudy(topic, map.workspace)}
						busy={busy}
						anchor={0.5}
						className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					/>
				) : (
					<p className="m-auto text-row text-muted-foreground">Topics appear as you study this course.</p>
				)}
			</div>
		</section>
	);
}
