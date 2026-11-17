"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { currentArc, type ArcHandle, type ChatListItem, type StudyCourse, type TopicHandle } from "@/src/core";
import { shownArcs } from "@/components/course-page/course-model";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { MapFrame, type MapView } from "@/components/course-map/map-frame";
import { Hint } from "@/components/ui/hint";
import { MathText, mathPlain } from "@/components/ui/math-text";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { courseHref } from "@/components/unit-inbox/unit-href";
import { sidebarSays, type Said } from "@/components/unit-inbox/sidebar-says";
import { cn } from "@/lib/utils";

/**
 * The selected course's map on Home (spec: home-map.md): course tabs over
 * the topic map, embedded as it is in the maps' frame (`MapFrame`, the
 * course page's map's too), its faded edges, Whole course and Enlarge. Every
 * course's map stays drawn and the chosen one shows, so a change of course
 * crossfades instead of drawing a map afresh; the tabs' underline slides to the chosen course. The enlarge
 * control lets the map take over Home for a moment; it and Esc bring Home
 * back. Enlarged, a course too big to open whole has the maps' Whole course
 * control (the frame's) that zooms out to every topic, and back to where he is. Enlarged or not, it is only the map: no List view and no More menu
 * (Edo, 12 Nov 2026). A course with arcs draws one arc (`TopicMap`'s
 * `arc`), with its arc list left of the map (`ArcMap`, as on the course page): the arc he picked
 * on the list, by ⇧↑ or ⇧↓ or on a card's "From" line, else the arc Home's follow names (`arc`, the Today row he
 * points at, as the course tab slides to its course; without it, the one
 * arc `highlight`'s topics lie in), else where he is (`currentArc`). Once
 * the follow names another arc, a pick is dropped: a press always shows
 * its arc, and pointing at another row follows it again. Enlarged, its Whole course shows every arc.
 * `framed` (the topics of the Today row he points at) brings them into
 * view on the chosen course's map (`TopicMap`'s `framed`).
 */
export function HomeMap({
	courses,
	chats,
	workspace,
	onSelect,
	highlight = null,
	marked = null,
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
	/** The topic whose card glows on the chosen course's map, the Today row he points at (`useMapTie`). */
	marked?: TopicHandle | null;
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
	const [opensWhole, setOpensWhole] = useState<ReadonlyMap<string, boolean>>(new Map());
	const chosenCourse = courses.find((c) => c.map.workspace === chosen)!;
	// The arc he picked on the map, per course, for the visit.
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
		// His press wins over the row Home follows (the top one at rest), until he points at another row.
		return picked.get(course.map.workspace) ?? followedHere ?? currentArc(course.map) ?? undefined;
	};
	const pick = useCallback((arc: ArcHandle) => setPicked((was) => new Map(was).set(chosen, arc)), [chosen]);
	return (
		<MapFrame
			aria-label="Course map"
			data-slot="home-map"
			data-enlarged={enlarged || undefined}
			lead={<CourseTabs courses={courses} workspace={chosen} onSelect={onSelect} />}
			arcs={shownArcs(chosenCourse.map)}
			value={arcOf(chosenCourse, true) ?? null}
			here={currentArc(chosenCourse.map)}
			onArc={pick}
			opensWhole={opensWhole.get(chosen) ?? null}
			enlarged={enlarged}
			onEnlarge={onEnlarge}
			back="Back to Home"
			enlargeSlot="home-map-enlarge"
		>
			{(view) =>
				courses.map((course) => {
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
								arc={shown && view.whole ? undefined : arcOf(course, shown)}
								said={said.get(course.map.workspace)!}
								highlight={shown ? highlight : null}
								marked={shown ? marked : null}
								framed={shown ? framed : null}
								whole={shown && view.whole}
								margin={view.margin}
								onOpenArc={view.pick}
								onOpensWhole={(fits) =>
									setOpensWhole((was) => (was.get(course.map.workspace) === fits ? was : new Map(was).set(course.map.workspace, fits)))
								}
							/>
						</div>
					);
				})
			}
		</MapFrame>
	);
}

/** The courses as underline tabs, the bar sliding to the chosen one (`line`, tabs.md).
 *  Pressing the chosen tab again opens its course page (Edo's notes, 15
 *  Nov 2026, N4: the header's "Course page" link went), as c does. */
function CourseTabs({ courses, workspace, onSelect }: { courses: readonly StudyCourse[]; workspace: string; onSelect: (workspace: string) => void }) {
	const router = useRouter();
	// Radix chooses a tab on mouse down, so by its click every pressed tab is chosen: whether it already was is read at pointer down.
	const pressedChosen = useRef(false);
	const list = useRef<HTMLDivElement>(null);
	return (
		<Tabs value={workspace} onValueChange={onSelect}>
			<TabsList
				ref={list}
				variant="line"
				aria-label="Course"
				data-slot="home-map-tabs"
				// ↓ goes into the map beneath, to its card that takes focus
				// (You are here): the page's arrows chose the full-width
				// Today row below it (round 7).
				onKeyDown={(e) => {
					if (e.key !== "ArrowDown" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
					const card = list.current?.closest('[data-slot="home-map"]')?.querySelector<HTMLElement>('[data-slot="home-map-course"][data-shown] a[tabindex="0"]');
					if (!card) return;
					e.preventDefault();
					card.focus({ preventScroll: true });
				}}
			>
				{courses.map((c) => {
					const chosen = c.map.workspace === workspace;
					const title = <MathText>{c.map.title}</MathText>;
					return (
						<TabsTrigger
							key={c.map.workspace}
							value={c.map.workspace}
							onPointerDown={() => {
								pressedChosen.current = chosen;
							}}
							// A click from the keyboard (Enter) has no pointer press before it.
							onClick={(e) => {
								if (e.detail === 0 ? chosen : pressedChosen.current) router.push(courseHref(c.map.workspace));
							}}
							className="lh-no-drag"
						>
							{/* On the label, not the tab: a tooltip trigger writes its own data-state over the tab's. */}
							{chosen ? (
								<Hint label={`${mathPlain(c.map.title)}'s course page`} binding="c" side="bottom">
									<span>{title}</span>
								</Hint>
							) : (
								title
							)}
						</TabsTrigger>
					);
				})}
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
	marked,
	framed,
	whole,
	margin,
	onOpenArc,
	onOpensWhole,
}: {
	course: StudyCourse;
	arc: ArcHandle | undefined;
	said: ReadonlyMap<TopicHandle, Said>;
	highlight: ReadonlySet<TopicHandle> | null;
	marked: TopicHandle | null;
	framed: ReadonlySet<TopicHandle> | null;
	whole: boolean;
	margin: MapView["margin"];
	onOpenArc: (arc: ArcHandle) => void;
	onOpensWhole: (fits: boolean) => void;
}) {
	const { map } = course;
	if (map.topics.length === 0) return <p className="m-auto text-body text-muted-foreground">Topics appear as you study this course.</p>;
	// As much room as the fade, so a topic at the edge scrolls clear of it.
	return <TopicMap map={map} arc={arc} said={said} margin={margin} highlight={highlight} marked={marked} framed={framed} whole={whole} onOpenArc={onOpenArc} onOpensWhole={onOpensWhole} />;
}

/** The one arc a set of lit topics lies in, or undefined when they span
 *  more (a review mixes arcs) or there are none. Pure. */
export function litArc(course: StudyCourse, lit: ReadonlySet<TopicHandle> | null): ArcHandle | undefined {
	if (!lit || lit.size === 0) return undefined;
	const arcs = new Set(course.map.topics.filter((t) => lit.has(t.handle)).map((t) => t.arc));
	const [only] = arcs;
	return arcs.size === 1 && only ? only : undefined;
}
