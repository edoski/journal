"use client";

import { PlusIcon } from "lucide-react";
import type { CourseState } from "@/components/course-picker";
import type { TodayVariant } from "@/components/design-variant";
import { Button } from "@/components/ui/button";
import { NextStepToday } from "@/components/start/today-a/next-step";
import { CourseLinesToday } from "@/components/start/today-b/course-lines";
import { SuggestionsToday } from "@/components/start/today-c/suggestions";

/**
 * What is waiting, under Today's composer (spec: today-waiting.md). The one
 * branch between the Explore candidates: shipping one deletes the others,
 * this switch and the registry entry. Nothing while the engine is being
 * asked or cannot run (the screen says why); the first-course action with
 * no course.
 */
export function TodayWaiting({
	variant,
	state,
	busy,
	onStart,
	onSuggest,
	onNewCourse,
}: {
	variant: TodayVariant;
	state: CourseState;
	busy: boolean;
	/** Start a session in the course with the open-ended opening. */
	onStart: (workspace: string) => void;
	/** Put a request in the composer with its course chosen. */
	onSuggest: (request: string, workspace: string) => void;
	onNewCourse: () => void;
}) {
	if (state.status !== "ready") return null;
	if (state.courses.length === 0) {
		return (
			<div data-slot="today-first-course" className="px-4">
				<Button variant="quiet" disabled={busy} onClick={onNewCourse} className="-ml-3 h-8 gap-1.5 px-3 text-row font-normal text-link hover:text-link">
					<PlusIcon className="size-3.5" />
					Add your first course
				</Button>
			</div>
		);
	}
	switch (variant) {
		case "a":
			return <NextStepToday courses={state.courses} busy={busy} onStart={onStart} />;
		case "b":
			return <CourseLinesToday courses={state.courses} busy={busy} onStart={onStart} />;
		case "c":
			return <SuggestionsToday courses={state.courses} busy={busy} onSuggest={onSuggest} />;
	}
}
