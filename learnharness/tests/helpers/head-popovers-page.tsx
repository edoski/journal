/** The course head's two popovers for a real browser, inside the app's
 *  frame: Mistakes with Linear Algebra's four open mistakes (`?case=mistakes`)
 *  and the readiness answer when the exam's plan leaves topics out
 *  (`?case=gaps`, the 17 Nov exam eve). Bundled by
 *  tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider, type NotifySource } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WindowPage } from "@/components/page-frame/window-page";
import { PageFrame, PageHead } from "@/components/page-frame/page-frame";
import { MistakesHead, MistakesPress } from "@/components/course-page/standing/mistakes-press";
import { ReadyFact } from "@/components/course-page/course-head/ready-fact";
import type { MistakeRow } from "@/components/course-page/standing/standing-model";
import { StudiedFact } from "@/components/course-page/course-head/head-parts";
import { CourseTopicRow } from "@/components/course-page/course-topic-row";
import { misfitWords } from "@/components/calendar/calendar-facts";
import type { CourseTopic, CourseView } from "@/components/course-page/course-model";
import type { CourseMapTopic, StudyCourse, TopicHandle } from "@/src/core";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const quiet = (): NotifySource => ({ onEvent() {}, onOpen() {}, close() {} });
const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, over: Partial<CourseMapTopic> = {}): CourseMapTopic => ({ handle: h(handle), title, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], ...over });

const mistake = (handle: string, title: string, words: string, when: string): MistakeRow =>
	({
		topic: topic(handle, title),
		slip: "confident",
		words,
		when,
		helped: false,
		hint: null,
		resume: null,
		creation: {},
		workspace: "/study/la",
		href: `/unit/la/${handle}`,
	}) as unknown as MistakeRow;

export const MISTAKES: MistakeRow[] = [
	mistake("rank", "Rank and the column space", "You count nonzero entries instead of pivots, and mix up the number of rows with the number of columns when you subtract the rank from the dimension.", "Today"),
	mistake("eigen", "Eigenvalues and eigenvectors", "Explained why an eigenvector stays on its own line under A by its length, not its direction, and took a repeated eigenvalue to rule out a diagonal form.", "Today"),
	mistake("matmul", "Matrix multiplication", "Multiplied a 2 × 3 by a 3 × 2 matrix and gave a 3 × 3 result, reading the inner sizes as the outer ones.", "5 Nov"),
	mistake("elimination", "Gaussian elimination", "Reached for Cramer's rule on a 4 × 4 system and stalled on the determinants instead of eliminating the first column.", "5 Nov"),
];

const course: StudyCourse = {
	map: {
		workspace: "/study/probability",
		title: "Probability",
		today: "2026-11-17",
		revision: 1,
		exam: { date: "2026-11-19", daysLeft: 2, finalReview: "2026-11-17", doesNotFit: [h("geometric"), h("variance")], unreviewed: [], reasons: {} },
		current: h("rv"),
		focus: null,
		tasks: [],
		topics: [
			topic("rv", "Random variables and distributions", { level: "assisted", introduced: "2026-11-05", review: { kind: "due", date: "2026-11-11" } as CourseMapTopic["review"] }),
			topic("bayes", "Bayes' rule", { level: "assisted", introduced: "2026-11-01" }),
			topic("geometric", "Geometric distribution"),
			topic("variance", "Variance"),
		],
		edges: [],
	},
	unready: null,
	due: [],
	lastActiveDaysAgo: 0,
	newToday: [],
};
const view = { course, chats: [] } as unknown as CourseView;

/** Probability on Tue 17 Nov, two days before its exam (round 17, M3: 1 `75`, `76`; 2 `14a`): nine topics with no
 *  room, a review whose title holds maths as the readiness answer's pick, and an arc row titled with a formula. */
const LOST = ["Geometric distribution", "Negative binomial distribution", "Poisson distribution", "Hypergeometric distribution", "Expectation of sums and products", "Conditional expectation", "Martingales", "Variance", "Variance of sums"];
const eve: StudyCourse = {
	...course,
	map: {
		...course.map,
		exam: { ...course.map.exam!, doesNotFit: LOST.map((_, i) => h(`lost-${i}`)) },
		current: h("perms"),
		topics: [
			topic("perms", "Permutations, $k$-permutations and factorials", { level: "assisted", introduced: "2026-11-02", review: { kind: "due", date: "2026-11-09", overdue: 8 } as CourseMapTopic["review"] }),
			...LOST.map((title, i) => topic(`lost-${i}`, title)),
		],
	},
	due: [h("perms")],
};
const eveView = { course: eve, chats: [] } as unknown as CourseView;
const PROPERTIES: CourseTopic = {
	topic: topic("properties", "Properties of probability: $P(A\\cup B)=P(A)+P(B)-P(A\\cap B)$", { level: "assisted", introduced: "2026-10-20" }),
	group: "learning",
	standing: { fill: 2, slipping: false, words: "Right with help", short: "Right with help" } as unknown as CourseTopic["standing"],
	current: false,
	fact: { kind: "back", words: "Back Tue 17 Nov" },
	factWords: "Back Tue 17 Nov",
	href: "/unit/probability/properties",
};

const which = new URLSearchParams(location.search).get("case");
createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<ServerEventsProvider connect={quiet}>
			<TooltipProvider>
				<AppearanceProvider>
					<SidebarProvider initial={{ open: true, width: 256 }}>
						<ActivityProvider>
							<AppShell>
								<WindowPage>
									<PageFrame>
										{which === "eve" ? (
											<>
												<MistakesHead>
													<PageHead
														compact
														title="Probability"
														standing={
															<>
																<ReadyFact view={eveView} ready={{ kind: "short", words: misfitWords(LOST)! }} />
																<StudiedFact words="Studied 10 Nov" session={null} />
															</>
														}
													/>
												</MistakesHead>
												<ul data-slot="eve-arc" className="w-[380px]">
													<CourseTopicRow row={PROPERTIES} />
												</ul>
											</>
										) : (
											<MistakesHead>
												<PageHead
													compact
													title={which === "gaps" ? "Probability" : "Linear Algebra"}
													actions={which === "mistakes" ? <MistakesPress rows={MISTAKES} /> : undefined}
													standing={which === "gaps" ? <ReadyFact view={view} ready={{ kind: "short", words: "No room before the exam to start Geometric distribution and Variance" }} /> : undefined}
												/>
											</MistakesHead>
										)}
									</PageFrame>
								</WindowPage>
							</AppShell>
						</ActivityProvider>
					</SidebarProvider>
				</AppearanceProvider>
			</TooltipProvider>
		</ServerEventsProvider>
	</AppRouterContext.Provider>,
);
