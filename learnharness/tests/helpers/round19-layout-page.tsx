/** Round 19's layout cases for a real browser, inside the app's frame
 *  (bundled by tests/helpers/browser-shell.ts), by `?case=`:
 *  - `home`: Home's column (`homeColumn`, `HomeBody`) on the demo's 8 Nov,
 *    Linear Algebra cut into twelve arcs, as Edo's courses are, so the map
 *    lists them beside it (carry-in 4: at zoom 1.25 and up the map ran over
 *    Today's heading).
 *  - `head`: the course page's head on Linear Algebra's 8 Nov, its readiness
 *    fact naming what the final review leaves out, then Studied (m13 b).
 *  - `lines`: Calculus I's map in a frame that shows one card, "You are
 *    here" on Improper integrals, every other card out of view (m13 a);
 *    with `&tall`, a frame that shows the whole chain. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider, type NotifySource } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WindowPage } from "@/components/page-frame/window-page";
import { PageFrame, PageHead } from "@/components/page-frame/page-frame";
import { HomeBody, homeColumn } from "@/components/study-home/study-home";
import { lessonOf } from "@/components/study-home/lesson-facts";
import { needsYouNow } from "@/components/study-home/needs-you";
import { ReadyFact } from "@/components/course-page/course-head/ready-fact";
import { finalReviewLineWords } from "@/components/study-words";
import { finalReviewMisses } from "@/components/course-page/course-head/head-facts";
import { StudiedFact } from "@/components/course-page/course-head/head-parts";
import { TopicMap } from "@/components/course-map/topic-map/topic-map";
import { MAP_FADE, vignette } from "@/components/course-map/map-fade";
import { cn } from "@/lib/utils";
import type { CourseView } from "@/components/course-page/course-model";
import type { ArcHandle, CourseMap, StudyCourse, TopicHandle } from "@/src/core";
import { CHATS, COURSES, LINALG, TODAY, arc, topic } from "../fixtures/now-demo";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const quiet = (): NotifySource => ({ onEvent() {}, onOpen() {}, close() {} });
const h = (handle: string) => handle as TopicHandle;

const ARC_TITLES = [
	"Vectors and the geometry of $\\mathbb{R}^n$",
	"Linear systems and Gaussian elimination",
	"Matrix algebra and inverses",
	"Determinants and volume",
	"Vector spaces and subspaces",
	"Linear independence, bases and dimension",
	"Rank, kernel and the column space",
	"Linear maps and their matrices",
	"Eigenvalues and eigenvectors",
	"Diagonalization and similar matrices",
	"Inner products and orthogonality",
	"Least squares and orthogonal projection",
];
/** Linear Algebra in twelve arcs, each of its topics in an arc of its own, "You are here" on Rank in the seventh. */
const LINALG_12: StudyCourse = {
	...LINALG,
	map: {
		...LINALG.map,
		arcs: ARC_TITLES.map((title, i) => arc(`a${i + 1}`, title, i < 6 ? "ready" : "learning")),
		currentArc: "a7" as ArcHandle,
		topics: LINALG.map.topics.map((t, i) => ({ ...t, arc: `a${[1, 6, 7, 4, 9, 10][i]}` as ArcHandle })),
	},
};
const courses = COURSES.map((c) => (c.map.workspace === LINALG.map.workspace ? LINALG_12 : c));
const { rows } = needsYouNow(courses, CHATS, TODAY);
const ready = { rows, lessons: rows.map(lessonOf), courses, chats: CHATS, done: ["Eigenvalues lesson"], exam: null, misfit: null, asks: [], busy: false, onContinue: () => {} };

/** Linear Algebra's head on the demo's 8 Nov (round 19, 2 `43b`). */
const headCourse = { ...LINALG, map: { ...LINALG.map, exam: { date: "2026-12-03", daysLeft: 25, finalReview: "2026-11-27", doesNotFit: [], unreviewed: [h("det")], reasons: {} } } } as StudyCourse;
const headView = { course: headCourse, chats: [] } as unknown as CourseView;
const SHORT = finalReviewLineWords(headCourse.map.exam!, finalReviewMisses(headCourse.map).map((t) => t.title));

/** Calculus I after a full day: a chain of eight topics, "You are here" on the last, Improper integrals. */
const CALC_CHAIN = ["Limits", "Continuity", "Derivatives", "Chain rule", "Implicit differentiation", "Riemann sums", "Fundamental theorem of calculus", "Improper integrals"];
const calculus: CourseMap = {
	workspace: "/s/calc",
	title: "Calculus I",
	today: TODAY,
	revision: 1,
	exam: null,
	current: h("t7"),
	focus: null,
	tasks: [],
	topics: CALC_CHAIN.map((title, i) => topic(`t${i}`, title, "independent")),
	edges: [
		...CALC_CHAIN.slice(1).map((_, i) => ({ kind: "needs" as const, prerequisite: h(`t${i}`), topic: h(`t${i + 1}`) })),
		{ kind: "needs" as const, prerequisite: h("t2"), topic: h("t5") },
		{ kind: "needs" as const, prerequisite: h("t0"), topic: h("t6") },
		{ kind: "needs" as const, prerequisite: h("t4"), topic: h("t7") },
	],
};

function Case() {
	const which = new URLSearchParams(location.search).get("case");
	if (which === "home") {
		return (
			<WindowPage>
				<main data-slot="study-home" className="min-h-0 flex-1 overflow-hidden">
					<div className={homeColumn(false)}>
						<HomeBody ready={ready} enlarged={false} onEnlarge={() => {}} />
					</div>
				</main>
			</WindowPage>
		);
	}
	if (which === "head") {
		return (
			<WindowPage>
				<PageFrame>
					<PageHead
						compact
						title={<span data-slot="course-title">Linear Algebra</span>}
						standing={
							<>
								<ReadyFact view={headView} ready={{ kind: "short", words: SHORT }} />
								<StudiedFact words="Studied today" session={{ id: "chat_eigen", title: "Eigenvalues lesson" }} />
							</>
						}
					/>
				</PageFrame>
			</WindowPage>
		);
	}
	// A frame as tall as one card and its tag, as Home's map was after the day (2 `42-home-after`); `tall`, the whole chain.
	const tall = new URLSearchParams(location.search).has("tall");
	return (
		<div data-slot="lines-frame" className={cn("relative flex w-[900px] flex-col", tall ? "h-[1400px]" : "h-[200px]")} style={vignette("page")}>
			<TopicMap map={calculus} said={new Map()} margin={MAP_FADE.page} />
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<ServerEventsProvider connect={quiet}>
			<TooltipProvider>
				<AppearanceProvider>
					<SidebarProvider initial={{ open: true, width: 256 }}>
						<ActivityProvider>
							<AppShell>
								<Case />
							</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</TooltipProvider>
		</ServerEventsProvider>
	</AppRouterContext.Provider>,
);
