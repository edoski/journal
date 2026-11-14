"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import type { ArcHandle, ChatListItem, StudyCourse, TopicHandle } from "@/src/core";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { WholeCourseButton } from "@/components/course-map/topic-map/whole-course-button";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MathText, mathPlain } from "@/components/ui/math-text";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mapFade } from "@/components/study-home/map-frame";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { sidebarSays, type Said } from "@/components/unit-inbox/sidebar-says";
import { cn } from "@/lib/utils";

/** How far the fade reaches in from the sides and from the top and bottom. */
const FADE = { x: 64, y: 40 };

/** The map's edges fade into the page on every side, like a vignette. */
const VIGNETTE = mapFade(FADE.x, FADE.y);

/**
 * The selected course's map on Home (spec: home-map.md): course tabs over
 * the topic map, embedded as it is and framed with faded edges. Every
 * course's map stays drawn and the chosen one shows, so a change of course
 * crossfades instead of drawing a map afresh; the tabs' underline slides to the chosen course. The enlarge
 * control lets the map take over Home for a moment; it and Esc bring Home
 * back. Enlarged, a course too big to open whole has the maps' Whole course
 * control (`WholeCourseButton`, and "-") that zooms out to every topic, and back to where he is. Enlarged or not, it is only the map: no List view and no More menu
 * (Edo, 12 Nov 2026).
 */
export function HomeMap({
	courses,
	chats,
	workspace,
	onSelect,
	highlight = null,
	enlarged,
	onEnlarge,
}: {
	courses: readonly StudyCourse[];
	/** Every session, for what the sidebar says on each card (`sidebarSays`). */
	chats: readonly ChatListItem[];
	/** The course whose map shows. */
	workspace: string;
	onSelect: (workspace: string) => void;
	/** Topics to light on the chosen course's map; null lights none. */
	highlight?: ReadonlySet<TopicHandle> | null;
	/** The arc of the chosen course Home's follow shows (the Today row he
	 *  points at, `litArc`); null shows where he is. Unset, the map follows
	 *  `highlight` itself. */
	arc?: ArcHandle | null;
	enlarged: boolean;
	onEnlarge: (enlarged: boolean) => void;
}) {
	const said = useMemo(() => new Map(courses.map((c) => [c.map.workspace, sidebarSays(courses, chats, c.map.workspace)])), [courses, chats]);
	const chosen = courses.some((c) => c.map.workspace === workspace) ? workspace : courses[0]!.map.workspace;
	const chosenTitle = mathPlain(courses.find((c) => c.map.workspace === chosen)!.map.title);
	// The enlarged map's zoom out: the whole course, until he zooms back in or leaves the enlarged map.
	const [whole, setWhole] = useState(false);
	const [opensWhole, setOpensWhole] = useState<ReadonlyMap<string, boolean>>(new Map());
	const canZoomOut = enlarged && opensWhole.get(chosen) === false;
	const zoomedOut = canZoomOut && whole;
	useEffect(() => {
		if (!enlarged) setWhole(false);
	}, [enlarged]);
	const toggleWhole = useCallback(() => setWhole((w) => !w), []);
	useEffect(() => {
		if (!enlarged) return;
		// Anything open over the map claims Esc first (Radix marks it handled).
		const onKey = (e: KeyboardEvent) => {
			if (!e.defaultPrevented && e.key === "Escape") onEnlarge(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [enlarged, onEnlarge]);

	return (
		<section aria-label="Course map" data-slot="home-map" data-enlarged={enlarged || undefined} className="relative flex min-h-0 flex-1 flex-col gap-2">
			<div className="flex h-8 shrink-0 items-center justify-between gap-4">
				<CourseTabs courses={courses} workspace={chosen} onSelect={onSelect} />
				<div className="flex shrink-0 items-center gap-1">
					{canZoomOut && <WholeCourseButton whole={zoomedOut} onToggle={toggleWhole} />}
					<Hint label={`${chosenTitle}'s course page`} side="bottom">
						<Button variant="quiet" size="sm" asChild data-slot="home-map-course-page" className="lh-no-drag text-label font-normal">
							<Link href={courseHref(chosen)}>
								Course page
								<ArrowRightIcon aria-hidden className="size-3.5" />
							</Link>
						</Button>
					</Hint>
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
			</div>
			<div data-slot="home-map-frame" className="relative flex min-h-0 flex-1 flex-col" style={VIGNETTE}>
				{courses.map((course) => {
					const shown = course.map.workspace === chosen;
					return (
						<div
							key={course.map.workspace}
							data-slot="home-map-course"
							data-shown={shown || undefined}
							aria-hidden={!shown || undefined}
							inert={!shown}
							className={cn(
								"absolute inset-0 flex flex-col transition-opacity duration-200 ease-out motion-reduce:transition-none",
								shown ? "opacity-100" : "pointer-events-none opacity-0",
							)}
						>
							<CourseDrawing
								course={course}
								said={said.get(course.map.workspace)!}
								highlight={shown ? highlight : null}
								whole={shown && zoomedOut}
								onOpensWhole={(fits) =>
									setOpensWhole((was) => (was.get(course.map.workspace) === fits ? was : new Map(was).set(course.map.workspace, fits)))
								}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}

/** The courses as underline tabs, the underline sliding to the chosen one. */
function CourseTabs({ courses, workspace, onSelect }: { courses: readonly StudyCourse[]; workspace: string; onSelect: (workspace: string) => void }) {
	const list = useRef<HTMLDivElement>(null);
	const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
	useLayoutEffect(() => {
		const place = () => {
			const tab = list.current?.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]');
			if (tab) setBar({ left: tab.offsetLeft, width: tab.offsetWidth });
		};
		place();
		const observer = new ResizeObserver(place);
		if (list.current) observer.observe(list.current);
		return () => observer.disconnect();
	}, [workspace, courses]);
	return (
		<Tabs value={workspace} onValueChange={onSelect}>
			<TabsList
				ref={list}
				variant="line"
				aria-label="Course"
				data-slot="home-map-tabs"
				className="relative [&_[data-slot=tabs-trigger]]:after:hidden"
			>
				{courses.map((c) => (
					<TabsTrigger key={c.map.workspace} value={c.map.workspace} className="lh-no-drag">
						<MathText>{c.map.title}</MathText>
					</TabsTrigger>
				))}
				{bar && (
					<span
						aria-hidden="true"
						data-slot="home-map-tab-bar"
						className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
						style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
					/>
				)}
			</TabsList>
		</Tabs>
	);
}

/** One course's map, drawn once and kept. */
function CourseDrawing({
	course,
	said,
	highlight,
	whole,
	onOpensWhole,
}: {
	course: StudyCourse;
	said: ReadonlyMap<TopicHandle, Said>;
	highlight: ReadonlySet<TopicHandle> | null;
	whole: boolean;
	onOpensWhole: (fits: boolean) => void;
}) {
	const { map } = course;
	if (map.topics.length === 0) return <p className="m-auto text-row text-muted-foreground">Topics appear as you study this course.</p>;
	// As much room as the fade, so a topic at the edge scrolls clear of it.
	return <TopicMap map={map} said={said} margin={FADE} highlight={highlight} whole={whole} onOpensWhole={onOpensWhole} />;
}
