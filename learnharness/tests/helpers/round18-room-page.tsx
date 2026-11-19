/** Home's two places round 18's m11 found cut with room to spare, each at
 *  its width in the app at 1512×982 with the sidebar open: "Also today"
 *  across Today's 1208px column, longer than one line, and the arc list
 *  beside Home's map (256px), Probability's twelve arcs. Bundled by
 *  tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TodayAlso } from "@/components/study-home/agenda-rows/today-also";
import { ArcIndex } from "@/components/course-map/arc-index";
import type { TodayRow } from "@/components/study-home/study-facts";
import type { ArcHandle, CourseMapArc, StudyCourse } from "@/src/core";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const course = (workspace: string, title: string) =>
	({ map: { workspace, title, today: "2026-11-10", revision: 1, exam: null, current: null, focus: null, tasks: [], topics: [], edges: [] }, unready: null, due: [], lastActiveDaysAgo: 0, newToday: [] }) as unknown as StudyCourse;
const CALC = course("/s/calc", "Calculus I");
const LA = course("/s/la", "Linear Algebra");
/** Home on 10 Nov (1 `57`): lessons folded into Also today, more than one line holds. */
const ALSO: TodayRow[] = [
	{ kind: "course", course: CALC, step: { kind: "task", key: "limits", title: "The precise $\\varepsilon$–$\\delta$ definition of a limit and its use in proofs of continuity", updated: null, topics: [] } },
	{ kind: "course", course: LA, step: { kind: "task", key: "sheet-4", title: "Problem sheet 4: rank and nullity", updated: null, topics: [] } },
	{ kind: "course", course: LA, step: { kind: "task", key: "rank-practice", title: "Rank practice", updated: null, topics: [] } },
	{ kind: "course", course: LA, step: { kind: "task", key: "eigen", title: "Eigenvalues and eigenvectors lesson", updated: null, topics: [] } },
];
const ARCS: CourseMapArc[] = [
	"Discrete probability and the uniform distribution",
	"Combinatorics and the binomial distribution",
	"Discrete conditional probability and independence",
	"Important distributions",
	"Expected value and variance",
	"Continuous probability densities",
	"Paradoxes and continuous conditioning",
	"Important densities and their simulation",
	"Continuous random variables and covariance",
	"Sums of random variables",
	"Law of large numbers",
	"Central limit theorem",
].map((title, i) => ({ handle: `arc-${i + 1}` as ArcHandle, title, state: "learning", entry: [] }));

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<TooltipProvider>
			<div data-testid="sidebar" className="flex flex-col gap-8 p-4">
				<ul data-place="also" className="w-[1208px]">
					<TodayAlso rows={ALSO} busy={false} onContinue={() => {}} />
				</ul>
				<div data-place="arcs" className="w-64">
					<ArcIndex arcs={ARCS} value={"arc-5" as ArcHandle} here={"arc-5" as ArcHandle} onSelect={() => {}} />
				</div>
			</div>
		</TooltipProvider>
	</AppRouterContext.Provider>,
);
