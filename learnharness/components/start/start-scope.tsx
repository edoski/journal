"use client";

import { createContext, useContext } from "react";
import { SetupDialog } from "@/components/setup-dialog";
import type { LessonStart } from "@/components/start/use-lesson-start";
import { cn } from "@/lib/utils";

const outside = () => {
	throw new Error("A start outside a StartScope: draw the surface inside its page's StartScope.");
};

/** The lesson start of the surface a press sits on (the course page, the
 *  sidebar), so every press on it shares one sign-in and one failure line. */
const Scope = createContext<LessonStart>({ start: outside, take: outside, starting: null, busy: false, error: null, setupOpen: false, openSetup: outside, closeSetup: outside });

/** Gives a surface's presses its one lesson start (`useLessonStart`) and
 *  draws the sign-in it opens. */
export function StartScope({ lesson, children }: { lesson: LessonStart; children: React.ReactNode }) {
	return (
		<Scope value={lesson}>
			{children}
			<SetupDialog open={lesson.setupOpen} onClose={lesson.closeSetup} />
		</Scope>
	);
}

/** The lesson start of the surface this press sits on. */
export function useStartScope(): LessonStart {
	return useContext(Scope);
}

/** Why the surface's last start could not open the lesson, in its one place; nothing otherwise. */
export function StartFailure({ className }: { className?: string }) {
	const { error } = useStartScope();
	return error ? (
		<p role="alert" data-slot="start-failure" className={cn("text-danger", className)}>
			{error}
		</p>
	) : null;
}
