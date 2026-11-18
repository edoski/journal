/** The places round 17's m26 found cut with room to spare, each at its
 *  width in the app at 1512×982, for a real browser: a week's day head
 *  (one of seven columns beside the sidebar), the topic page's Builds on
 *  and the course page's road (the 24rem list column). Bundled by
 *  tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DayHead } from "@/components/calendar/calendar-view";
import { BuildsOnList } from "@/components/unit-inbox/topic-page/pickup/pickup-parts";
import { RoadArc } from "@/components/course-page/road/road-arc";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import type { ArcHandle, CourseMapTopic, ScheduledDay, TopicHandle } from "@/src/core";
import type { CourseArcSection } from "@/components/course-page/course-model";

const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} };
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string, title: string): CourseMapTopic => ({ handle: handle as TopicHandle, title, level: "solid", introduced: "2026-11-01", review: null, weak: false, signals: QUIET, tasks: [], arc: "a1" as ArcHandle, right: "unaided" }) as unknown as CourseMapTopic;
const gauss = topic("gauss-jordan", "Gauss-Jordan reduction and reduced echelon form");
const day: ScheduledDay = { date: "2026-11-10", off: false, journalOff: false, windows: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }] };
const section = {
	arc: { handle: "discrete" as ArcHandle, title: "Discrete probability and the uniform distribution", state: "learning", entry: [] },
	topics: [],
	needsYou: true,
	exam: null,
	current: true,
} as unknown as CourseArcSection;

createRoot(document.getElementById("root")!).render(
	<AppRouterContext.Provider value={router as never}>
		<TooltipProvider>
			<div data-testid="sidebar" className="flex flex-col gap-8 p-4">
				{/* The week's header cell as FullCalendar draws it: a 176px column
				    that clips, a column of start-aligned boxes sized by their
				    content, and white-space: nowrap inherited. */}
				<div data-place="day-head" className="flex w-[176px] flex-col items-start overflow-hidden whitespace-nowrap">
					<div className="flex flex-none flex-col">
						<div className="flex w-full rounded-md">
							<DayHead info={{ date: new Date("2026-11-10T00:00:00Z"), weekdayText: "Tue", dayNumberText: "10", isToday: false } as never} schedule={new Map([["2026-11-10", day]])} />
						</div>
					</div>
				</div>
				<div data-place="builds-on" className="w-[24rem]">
					<BuildsOnList builds={[{ topic: gauss, standing: standingOf(gauss), words: "Right on your own, check another day", href: "/t/gauss-jordan" }]} />
				</div>
				<div data-place="road" className="w-[24rem]">
					<RoadArc section={section} items={[]} renderItem={() => null} open={false} onOpenChange={() => {}} number={1} starts={null} shown />
				</div>
			</div>
		</TooltipProvider>
	</AppRouterContext.Provider>,
);
