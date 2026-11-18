/** Sidebar cards as the sidebar draws them at its default width (256px,
 *  its list's 8px padding), one per course and session status, for a
 *  real browser. Bundled by tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { RowCard } from "@/components/unit-inbox/row-card";
import { StatusMark } from "@/components/unit-inbox/status-mark";
import { CourseMark } from "@/components/unit-inbox/unit-row";
import { pausedWords } from "@/components/nav/session-state";
import { TUTOR_WRITING, leftOffWords } from "@/components/study-words";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
export const COURSES = ["Linear Algebra", "Real Analysis", "Probability", "Calculus I"];
/** Each status with the kind the sidebar gives it, so it wears its icon. */
export const STATUSES: { kind: string; words: string }[] = [
	{ kind: "stopped", words: pausedWords({ stopped: true }) },
	{ kind: "stopped", words: pausedWords({ failed: true }) },
	{ kind: "stopped", words: pausedWords({}) },
	{ kind: "your-turn", words: "Your turn" },
	{ kind: "working", words: TUTOR_WRITING },
	{ kind: "task", words: leftOffWords(8, "2026-11-18") },
	{ kind: "task", words: leftOffWords(1, "2026-11-18") },
	{ kind: "review", words: "Due since 13 Nov" },
	{ kind: "next", words: "Planned today" },
];

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<div data-testid="sidebar" className="w-64">
			<ul className="flex flex-col gap-px p-2">
				{COURSES.flatMap((course) =>
					STATUSES.map((status, i) => (
						<RowCard
							key={`${course}:${i}`}
							href="/chat/x"
							active={i === 0}
							rowKey={`${course}:${i}`}
							mark={<CourseMark title={course} />}
							course={course}
							status={<StatusMark data-slot="why-mark" size="slot" fact={{ kind: status.kind } as never} words={status.words} />}
							title="Eigenvalues and eigenvectors"
						/>
					)),
				)}
			</ul>
		</div>
	</AppRouterContext.Provider>,
);
