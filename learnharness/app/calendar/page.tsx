import { CalendarPage } from "@/components/calendar/calendar-page";

export const dynamic = "force-dynamic";

/** When and what is scheduled: reviews, exams, open tasks and sessions by day. */
export default function CalendarRoute() {
	return <CalendarPage />;
}
