"use client";

import { useMemo, useState } from "react";
import { Maximize2Icon } from "lucide-react";
import { CourseMapDrawing } from "@/components/course-map/course-map-drawing";
import { layoutCourseMap } from "@/components/course-map/course-map-layout";
import { DayHeading } from "@/components/study-home/day-heading";
import { HomeFrame, type HomeReady } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { LessonButton } from "@/components/study-home/lesson-button";
import type { Lesson } from "@/components/study-home/lesson-facts";
import { LessonText } from "@/components/study-home/lesson-text";
import { MAP_BOX, mapFade } from "@/components/study-home/map-frame";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { CourseMapTopic, StudyCourse } from "@/src/core";

const FADE = mapFade(32, 24);

/**
 * The split study home (spec: split-home.md): today's lessons on the left,
 * and beside them the map of the picked lesson's course. Picking a lesson
 * is the page's one selection; the picked lesson holds the primary action.
 */
export function SplitHome({ initialConfigured }: { initialConfigured: boolean }) {
	const [enlarged, setEnlarged] = useState(false);
	return (
		<HomeFrame
			initialConfigured={initialConfigured}
			quiet={enlarged}
			className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[72rem]")}
		>
			{(home) => <SplitBody home={home} enlarged={enlarged} onEnlarge={setEnlarged} />}
		</HomeFrame>
	);
}

function SplitBody({ home, enlarged, onEnlarge }: { home: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void }) {
	const { lessons, courses, busy, onStart, onContinue } = home;
	const [pickedKey, setPickedKey] = useState(() => lessons[0]!.key);
	const picked = lessons.find((l) => l.key === pickedKey) ?? lessons[0]!;
	const onStudy = (topic: CourseMapTopic, workspace: string) => onStart(topic.title, workspace);

	if (enlarged) {
		return (
			<HomeMap
				courses={courses}
				workspace={(picked.course ?? courses[0]!).map.workspace}
				onSelect={(workspace) => setPickedKey((lessons.find((l) => l.course?.map.workspace === workspace) ?? picked).key)}
				enlarged
				onEnlarge={onEnlarge}
				onStudy={onStudy}
				busy={busy}
			/>
		);
	}
	return (
		<>
			<DayHeading />
			<div className="grid max-h-[42rem] min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8">
				<ul data-slot="lesson-list" aria-label="Today’s lessons" className="-mx-3 flex min-h-0 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{lessons.map((lesson) => (
						<li key={lesson.key}>
							<LessonRow lesson={lesson} picked={lesson === picked} onPick={() => setPickedKey(lesson.key)} busy={busy} onContinue={onContinue} />
						</li>
					))}
				</ul>
				<MapPane course={picked.course} onEnlarge={() => onEnlarge(true)} onStudy={onStudy} busy={busy} />
			</div>
		</>
	);
}

/** A lesson in the list. Pressing it picks it, which brings its course's
 *  map beside the list; the picked lesson shows the button that opens it. */
function LessonRow({
	lesson,
	picked,
	onPick,
	busy,
	onContinue,
}: {
	lesson: Lesson;
	picked: boolean;
	onPick: () => void;
	busy: boolean;
	onContinue: (workspace: string) => void;
}) {
	return (
		<div data-slot="lesson-row" data-picked={picked || undefined} className={cn("relative rounded-lg", picked && "bg-fill-selected")}>
			<Button
				variant="quiet"
				aria-pressed={picked}
				onClick={onPick}
				className={cn("h-auto w-full justify-start rounded-lg py-3 pr-24 pl-3 text-left font-normal whitespace-normal", picked && "hover:bg-transparent")}
			>
				<LessonText lesson={lesson} />
			</Button>
			{picked && (
				<LessonButton lesson={lesson} busy={busy} onContinue={onContinue} size="sm" data-slot="lesson-open" className="absolute top-1/2 right-3 -translate-y-1/2 font-normal transition-colors">
					{lesson.action}
				</LessonButton>
			)}
		</div>
	);
}

/** The picked lesson's course as a map with no frame: the course map with
 *  its camera on the current topic, faded at its edges, and the control
 *  that enlarges it at its top right. */
function MapPane({
	course,
	onEnlarge,
	onStudy,
	busy,
}: {
	course: StudyCourse | null;
	onEnlarge: () => void;
	onStudy: (topic: CourseMapTopic, workspace: string) => void;
	busy: boolean;
}) {
	const layout = useMemo(() => (course ? layoutCourseMap(course.map.topics, course.map.edges) : null), [course]);
	if (!course || !layout) {
		return (
			<section aria-label="Course map" data-slot="split-map" className="flex min-h-0 flex-col">
				<p className="m-auto text-row text-muted-foreground">This lesson has no course, so it has no map.</p>
			</section>
		);
	}
	const { map } = course;
	return (
		<section aria-label={`${map.title} map`} data-slot="split-map" className="relative flex min-h-0 flex-col">
			<Hint label="Enlarge map" side="left">
				<Button variant="quiet" size="icon-row" data-slot="home-map-enlarge" aria-label="Enlarge map" onClick={onEnlarge} className="lh-no-drag absolute top-0 right-0 z-10">
					<Maximize2Icon />
				</Button>
			</Hint>
			<div data-slot="home-map-frame" className="relative flex min-h-0 flex-1 flex-col" style={FADE}>
				{map.topics.length > 0 ? (
					<CourseMapDrawing
						key={map.workspace}
						map={map}
						layout={layout}
						jumpRequest={0}
						onStudy={(topic) => onStudy(topic, map.workspace)}
						busy={busy}
						anchor={0.5}
						className={MAP_BOX}
					/>
				) : (
					<p className="m-auto text-row text-muted-foreground">Topics appear as you study this course.</p>
				)}
			</div>
		</section>
	);
}
