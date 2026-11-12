"use client";

import { useState } from "react";
import { NetworkIcon } from "lucide-react";
import { DayHeading } from "@/components/study-home/day-heading";
import { HomeFrame, type HomeReady } from "@/components/study-home/home-frame";
import { HomeMap } from "@/components/study-home/home-map";
import { LessonButton } from "@/components/study-home/lesson-button";
import { LessonText } from "@/components/study-home/lesson-text";
import { PathTrack } from "@/components/study-home/path/path-track";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The path study home (spec: path-home.md): today's lessons in one calm
 * column, each drawing its own place in its course's path. The course map
 * is one press away and takes over Home while it is open.
 */
export function PathHome({ initialConfigured }: { initialConfigured: boolean }) {
	const [mapOpen, setMapOpen] = useState(false);
	return (
		<HomeFrame
			initialConfigured={initialConfigured}
			quiet={mapOpen}
			className={cn("mx-auto flex h-full w-full flex-col px-8 pb-6", mapOpen ? "gap-5 pt-13" : "max-w-[46rem] gap-6 pt-[max(3.25rem,12vh)]")}
		>
			{(home) => <PathBody home={home} mapOpen={mapOpen} onMapOpen={setMapOpen} />}
		</HomeFrame>
	);
}

function PathBody({ home, mapOpen, onMapOpen }: { home: HomeReady; mapOpen: boolean; onMapOpen: (open: boolean) => void }) {
	const { lessons, courses, today, busy, onStart, onContinue } = home;
	const [workspace, setWorkspace] = useState(() => courses[0]!.map.workspace);

	if (mapOpen) {
		return (
			<HomeMap
				courses={courses}
				workspace={workspace}
				onSelect={setWorkspace}
				enlarged
				onEnlarge={onMapOpen}
				onStudy={(topic, ws) => onStart(topic.title, ws)}
				busy={busy}
			/>
		);
	}
	return (
		<>
			<div className="flex h-8 shrink-0 items-center justify-between gap-4">
				<DayHeading today={today} />
				<Button variant="quiet" size="sm" data-slot="home-map-open" onClick={() => onMapOpen(true)} className="lh-no-drag -mr-3 font-normal">
					<NetworkIcon />
					Course map
				</Button>
			</div>
			<ul data-slot="lesson-list" aria-label="Today’s lessons" className="-mx-3 flex min-h-0 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{lessons.map((lesson, i) => (
					<li key={lesson.key}>
						<LessonButton
							lesson={lesson}
							busy={busy}
							onContinue={onContinue}
							variant="quiet"
							data-slot="lesson-row"
							data-primary={i === 0 || undefined}
							className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-lg px-3 py-3 text-left font-normal whitespace-normal"
						>
							<span className="flex min-w-0 flex-col gap-2">
								<LessonText lesson={lesson} place={false} />
								{lesson.course && <PathTrack course={lesson.course} topics={lesson.topics} place={lesson.place} />}
							</span>
							{i === 0 && (
								<span aria-hidden="true" data-slot="lesson-open" className={cn(buttonVariants({ size: "sm" }), "font-normal")}>
									{lesson.action}
								</span>
							)}
						</LessonButton>
					</li>
				))}
			</ul>
		</>
	);
}
