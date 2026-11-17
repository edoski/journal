/** A course's map as Home and the course page draw it (`TopicMap`), for a
 *  real browser: Probability's second arc on the seed's 8 Nov, with "You
 *  are here" on Random variables and distributions, the course's longest
 *  title. Bundled by tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import type { ArcHandle, CourseMap, CourseMapTopic, TopicHandle } from "@/src/core";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, arc: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "assisted", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], arc: arc as ArcHandle, right: "unaided", ...over }) as CourseMapTopic;
const course = {
	workspace: "/study/probability",
	title: "Probability",
	today: "2026-11-08",
	revision: 1,
	exam: null,
	current: h("rv"),
	focus: null,
	tasks: [],
	topics: [
		topic("cond", "Conditional probability", "a1"),
		topic("independent", "Independent events", "a1"),
		topic("rv", "Random variables and distributions", "a2"),
		topic("binomial", "Binomial distribution", "a2"),
		topic("poisson", "Poisson distribution", "a3", { level: "new", introduced: null, right: undefined }),
	],
	edges: [
		{ kind: "needs", prerequisite: h("cond"), topic: h("independent") },
		{ kind: "needs", prerequisite: h("independent"), topic: h("rv") },
		{ kind: "needs", prerequisite: h("rv"), topic: h("binomial") },
		{ kind: "needs", prerequisite: h("binomial"), topic: h("poisson") },
	],
	arcs: [
		{ handle: "a1", title: "Conditional probability", state: "ready", entry: [] },
		{ handle: "a2", title: "Random variables and the Binomial", state: "learning", entry: [h("independent")] },
		{ handle: "a3", title: "Expectation of named distributions", state: "learning", entry: [h("binomial")] },
	],
	currentArc: "a2",
} as unknown as CourseMap;

const arc = (new URLSearchParams(location.search).get("arc") ?? "a2") as ArcHandle;
createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<TooltipProvider>
			<div data-testid="sidebar" className="h-dvh w-[60rem]">
				<TopicMap map={course} arc={arc} said={new Map()} />
			</div>
		</TooltipProvider>
	</AppRouterContext.Provider>,
);
