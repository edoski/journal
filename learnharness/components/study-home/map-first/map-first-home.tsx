"use client";

import { useState } from "react";
import { Maximize2Icon } from "lucide-react";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { DayHeading } from "@/components/study-home/day-heading";
import { HomeFrame, type HomeReady } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { LessonButton } from "@/components/study-home/lesson-button";
import { LessonText } from "@/components/study-home/lesson-text";
import { mapFade } from "@/components/study-home/map-frame";
import { Button, buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { StudyCourse } from "@/src/core";

const FADE = mapFade(48, 24);

/**
 * The map-first study home (spec: map-first-home.md): the course map on
 * top in one card with the course tabs, then today's lessons. The tabs are
 * the page's one selection: the picked course's map shows, and its lesson
 * holds the primary action.
 */
export function MapFirstHome({ initialConfigured }: { initialConfigured: boolean }) {
	const [enlarged, setEnlarged] = useState(false);
	return (
		<HomeFrame
			initialConfigured={initialConfigured}
			quiet={enlarged}
			className={cn("mx-auto flex h-full w-full flex-col gap-5 px-8 pt-13 pb-6", !enlarged && "max-w-[60rem]")}
		>
			{(home) => <MapFirstBody home={home} enlarged={enlarged} onEnlarge={setEnlarged} />}
		</HomeFrame>
	);
}

function MapFirstBody({ home, enlarged, onEnlarge }: { home: HomeReady; enlarged: boolean; onEnlarge: (enlarged: boolean) => void }) {
	const { lessons, courses, busy, onContinue } = home;
	const [workspace, setWorkspace] = useState(() => courses[0]!.map.workspace);

	if (enlarged) {
		return <HomeMap courses={courses} workspace={workspace} onSelect={setWorkspace} enlarged onEnlarge={onEnlarge} />;
	}
	return (
		<>
			<DayHeading />
			<MapCard courses={courses} workspace={workspace} onSelect={setWorkspace} onEnlarge={() => onEnlarge(true)} />
			<ul data-slot="lesson-list" aria-label="Today’s lessons" className="-mx-3 flex min-h-0 shrink flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{lessons.map((lesson) => {
					const picked = lesson.course?.map.workspace === workspace;
					return (
						<li key={lesson.key}>
							<LessonButton
								lesson={lesson}
								busy={busy}
								onContinue={onContinue}
								variant="quiet"
								data-slot="lesson-row"
								data-picked={picked || undefined}
								className={cn(
									"grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-lg px-3 py-2.5 text-left font-normal whitespace-normal",
									picked && "bg-fill-selected hover:bg-fill-selected",
								)}
							>
								<LessonText lesson={lesson} />
								{picked && (
									<span aria-hidden="true" data-slot="lesson-open" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
										{lesson.action}
									</span>
								)}
							</LessonButton>
						</li>
					);
				})}
			</ul>
		</>
	);
}

/** The course map in a card: the course tabs, a line that says where the
 *  learner is, the control that enlarges it, and the picked course's
 *  topic map. */
function MapCard({
	courses,
	workspace,
	onSelect,
	onEnlarge,
}: {
	courses: readonly StudyCourse[];
	workspace: string;
	onSelect: (workspace: string) => void;
	onEnlarge: () => void;
}) {
	const course = courses.find((c) => c.map.workspace === workspace) ?? courses[0]!;
	const { map } = course;
	const current = map.topics.find((t) => t.handle === map.current);
	return (
		<section aria-label="Course map" data-slot="home-map" className="-mx-3 flex max-h-[26rem] min-h-56 flex-1 flex-col rounded-lg border border-border">
			<div className="flex h-12 shrink-0 items-center gap-4 pr-2 pl-2">
				<Tabs value={map.workspace} onValueChange={onSelect} className="shrink-0">
					<TabsList aria-label="Course" data-slot="home-map-tabs">
						{courses.map((c) => (
							<TabsTrigger key={c.map.workspace} value={c.map.workspace} className="lh-no-drag">
								{c.map.title}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{current && <p className="ml-auto min-w-0 truncate text-label text-muted-foreground">You are at {current.title}</p>}
				<Hint label="Enlarge map" side="left">
					<Button
						variant="quiet"
						size="icon-row"
						data-slot="home-map-enlarge"
						aria-label="Enlarge map"
						onClick={onEnlarge}
						className={cn("lh-no-drag shrink-0", !current && "ml-auto")}
					>
						<Maximize2Icon />
					</Button>
				</Hint>
			</div>
			<div data-slot="home-map-frame" className="relative flex min-h-0 flex-1 flex-col" style={FADE}>
				{map.topics.length > 0 ? (
					<TopicMap key={map.workspace} map={map} />
				) : (
					<p className="m-auto text-row text-muted-foreground">Topics appear as you study this course.</p>
				)}
			</div>
		</section>
	);
}
