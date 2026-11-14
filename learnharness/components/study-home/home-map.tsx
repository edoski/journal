"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { currentArc, type ArcHandle, type ChatListItem, type StudyCourse, type TopicHandle } from "@/src/core";
import { ArcStrip } from "@/components/course-map/arc-strip";
import { arcShare, shownArcs } from "@/components/course-page/course-model";
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
 * (Edo, 12 Nov 2026). A course with arcs draws one arc (`TopicMap`'s
 * `arc`), with the arc strip under the course tabs: the arc Home's follow
 * names (`arc`, the Today row he points at, as the course tab slides to
 * its course; without it, the one arc `highlight`'s topics lie in), else
 * the arc he picked on the strip, else where he is (`currentArc`). Once
 * the follow names an arc, a pick is dropped, so leaving the row returns
 * to the arc of You are here. Enlarged, its Whole course shows every arc.
 * `framed` (the topics of the Today row he points at) brings them into
 * view on the chosen course's map (`TopicMap`'s `framed`).
 */
export function HomeMap({
	courses,
	chats,
	workspace,
	onSelect,
	highlight = null,
	framed = null,
	arc: followed,
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
	/** Topics the chosen course's map brings into view while he points at
	 *  their Today row; null while he points at none. */
	framed?: ReadonlySet<TopicHandle> | null;
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
	const chosenCourse = courses.find((c) => c.map.workspace === chosen)!;
	const arcs = shownArcs(chosenCourse.map);
	// The arc he picked on the strip, per course, for the visit.
	const [picked, setPicked] = useState<ReadonlyMap<string, ArcHandle>>(new Map());
	const follow = (followed === undefined ? litArc(chosenCourse, highlight) : followed) ?? null;
	// A row he points at drops the pick, so leaving it returns to where he is.
	const [lastFollow, setLastFollow] = useState(follow);
	if (lastFollow !== follow) {
		setLastFollow(follow);
		if (follow && picked.size > 0) setPicked(new Map());
	}
	const arcOf = (course: StudyCourse, shown: boolean): ArcHandle | undefined => {
		const own = shownArcs(course.map);
		if (!own) return undefined;
		const followedHere = shown && follow && own.some((a) => a.handle === follow) ? follow : null;
		return followedHere ?? picked.get(course.map.workspace) ?? currentArc(course.map) ?? undefined;
	};
	const shownArc = arcOf(chosenCourse, true);
	const canZoomOut = enlarged && (arcs !== null || opensWhole.get(chosen) === false);
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
			{arcs && (
				<ArcStrip
					quiet
					className="shrink-0"
					arcs={arcs.map((a) => ({ handle: a.handle, title: a.title, share: arcShare(chosenCourse, a.handle) }))}
					value={shownArc ?? null}
					onSelect={(arc) => {
						setPicked((was) => new Map(was).set(chosen, arc));
						setWhole(false);
					}}
				/>
			)}
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
								arc={shown && zoomedOut ? undefined : arcOf(course, shown)}
								said={said.get(course.map.workspace)!}
								highlight={shown ? highlight : null}
								framed={shown ? framed : null}
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
	arc,
	said,
	highlight,
	framed,
	whole,
	onOpensWhole,
}: {
	course: StudyCourse;
	arc: ArcHandle | undefined;
	said: ReadonlyMap<TopicHandle, Said>;
	highlight: ReadonlySet<TopicHandle> | null;
	framed: ReadonlySet<TopicHandle> | null;
	whole: boolean;
	onOpensWhole: (fits: boolean) => void;
}) {
	const { map } = course;
	if (map.topics.length === 0) return <p className="m-auto text-row text-muted-foreground">Topics appear as you study this course.</p>;
	// As much room as the fade, so a topic at the edge scrolls clear of it.
	return <TopicMap map={map} arc={arc} said={said} margin={FADE} highlight={highlight} framed={framed} whole={whole} onOpensWhole={onOpensWhole} />;
}

/** The one arc a set of lit topics lies in, or undefined when they span
 *  more (a review mixes arcs) or there are none. Pure. */
export function litArc(course: StudyCourse, lit: ReadonlySet<TopicHandle> | null): ArcHandle | undefined {
	if (!lit || lit.size === 0) return undefined;
	const arcs = new Set(course.map.topics.filter((t) => lit.has(t.handle)).map((t) => t.arc));
	const [only] = arcs;
	return arcs.size === 1 && only ? only : undefined;
}
