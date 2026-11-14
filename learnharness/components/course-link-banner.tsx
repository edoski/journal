"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CourseControl, CoursesUnavailable, useCourseChoice, type CourseChoice } from "@/components/course-picker";
import { Button } from "@/components/ui/button";
import { DOCK_SURFACE } from "@/components/lesson/dock-surface";
import { LESSON_COLUMN } from "@/components/lesson/lesson-column";

/** The banner's pure body (the render-test seam): one line on the dock
 *  surface, the course chooser and one Link action at its end. */
export function CourseLinkBody({ choice, busy, error, onLink }: {
	choice: CourseChoice;
	busy: boolean;
	error: string | null;
	onLink: () => void;
}) {
	return (
		<div data-testid="course-link-banner" data-slot="dock-surface" className={`pointer-events-auto p-2 pl-4 ${DOCK_SURFACE}`}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<p className="min-w-0 flex-1 text-row text-muted-foreground">Link this session to a course to continue.</p>
				{choice.state.status === "unavailable" ? (
					<CoursesUnavailable reason={choice.state.reason} />
				) : (
					<CourseControl choice={choice} />
				)}
				{choice.state.status === "ready" && (
					<Button
						type="button"
						data-testid="course-link"
						onClick={onLink}
						disabled={busy}
						className="h-8 rounded-full px-3.5 text-row font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
					>
						{busy ? "Linking…" : "Link"}
					</Button>
				)}
			</div>
			{error && <p role="alert" className="px-0 pb-1 pt-2 text-row text-danger">{error}</p>}
		</div>
	);
}

/** Shown in place of the composer and the question and practice docks on a
 *  session with no course. Linking writes the course and reloads the page,
 *  which then renders the session like any other. */
export function CourseLinkBanner({ chatId }: { chatId: string }) {
	const router = useRouter();
	const choice = useCourseChoice({ remember: false });
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const link = async () => {
		const workspace = choice.requireCourse();
		if (!workspace || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/course`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workspace }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? "The course could not be linked");
			}
			router.refresh();
		} catch (err) {
			setError((err as Error).message);
			setBusy(false);
		}
	};
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-0">
			<div className="h-24 bg-gradient-to-t from-background via-background/85 to-transparent" />
			<div className="bg-background pb-5">
				<div className={LESSON_COLUMN}>
					<CourseLinkBody choice={choice} busy={busy} error={error} onLink={() => void link()} />
				</div>
			</div>
		</div>
	);
}
