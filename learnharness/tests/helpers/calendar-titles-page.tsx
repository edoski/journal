/** The calendar's week of 9 to 15 Nov (round 19, 2 `57-calendar-9-15`),
 *  for a real browser: Sun 15's maths title "Properties of probability:
 *  $P(A\cup B)=P(A)+P(B)-P(A\cap B)$" among the week's reviews, with the
 *  demo's other titles holding maths (tests/learning/golden), in the
 *  page beside the sidebar at its default width in Edo's 1512×982 window.
 *  Bundled by tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CalendarView } from "@/components/calendar/calendar-view";
import { calendarEntries } from "@/components/calendar/calendar-facts";
import { SIDEBAR_DEFAULT_WIDTH } from "@/components/sidebar-cookies";
import type { CalendarCourse, CourseMapTopic, TopicHandle } from "@/src/core";

const TODAY = "2026-11-09";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string, date: string): CourseMapTopic =>
	({ handle, title, level: "retained", introduced: "2026-10-01", review: { kind: "scheduled", date }, weak: false, signals: QUIET, tasks: [] }) as unknown as CourseMapTopic;
const TOPICS = [
	topic("union", "Properties of probability: $P(A\\cup B)=P(A)+P(B)-P(A\\cap B)$", "2026-11-15"),
	topic("binomial", "Combinations and binomial coefficients $\\binom{n}{j}$", "2026-11-15"),
	topic("cantor", "Cardinality, countable sets and Cantor's theorem $|A| < |\\mathcal{P}(A)|$", "2026-11-12"),
	topic("squeeze", "The squeeze theorem and $\\lim_{x\\to 0}\\frac{\\sin x}{x}=1$", "2026-11-12"),
	topic("rv", "Random variables and distributions", "2026-11-10"),
];
const PROB: CalendarCourse = {
	map: { workspace: "/s/prob", title: "Probability", today: TODAY, revision: 1, exam: null, current: null, focus: null, tasks: [], topics: TOPICS, edges: [] },
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
	planned: TOPICS.map((t) => ({ date: t.review!.date, reviews: [t.handle as TopicHandle], new: [] })),
	doesNotFit: [],
	finalReview: null,
} as unknown as CalendarCourse;

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const entries = calendarEntries({ courses: [PROB], chats: [], scope: null });

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<TooltipProvider>
			<div data-testid="sidebar" className="flex">
				<div style={{ width: SIDEBAR_DEFAULT_WIDTH }} className="shrink-0" />
				<div data-place="calendar" className="min-w-0 flex-1">
					<CalendarView courses={[PROB]} entries={entries} schedule={[]} today={TODAY} scope={null} onScopeChange={() => {}} busy={false} onStart={() => {}} />
				</div>
			</div>
		</TooltipProvider>
	</AppRouterContext.Provider>,
);
