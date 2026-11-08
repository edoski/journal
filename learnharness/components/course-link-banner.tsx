"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CourseControl, useCourseChoice, type CourseChoice } from "@/components/course-picker";

const DOCK = "mx-auto w-full max-w-[46rem] px-4";

/** The banner's pure body: the render-test seam. */
export function CourseLinkBody({ choice, busy, error, onLink }: {
	choice: CourseChoice;
	busy: boolean;
	error: string | null;
	onLink: () => void;
}) {
	return (
		<div data-testid="course-link-banner" className="pointer-events-auto rounded-2xl border bg-card p-4 shadow-lg">
			<p className="text-sm text-card-foreground">
				This session has no course yet. Pick the course it belongs to, to continue.
			</p>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<CourseControl choice={choice} />
				{choice.state.status === "ready" && (
					<button
						type="button"
						data-testid="course-link"
						onClick={onLink}
						disabled={busy}
						className="rounded-sm border border-border bg-card px-3 py-1.5 font-ui text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40"
					>
						{busy ? "Linking…" : "Link"}
					</button>
				)}
			</div>
			{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
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
				<div className={DOCK}>
					<CourseLinkBody choice={choice} busy={busy} error={error} onLink={() => void link()} />
				</div>
			</div>
		</div>
	);
}
