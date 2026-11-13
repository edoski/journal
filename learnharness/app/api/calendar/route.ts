import { calendarRead } from "@/src/server";

export const dynamic = "force-dynamic";

/** The calendar: every listed course's map with its run-up, and the
 *  Journal's study windows ahead, or `available: false` when the engine
 *  cannot run. */
export async function GET() {
	return Response.json(await calendarRead());
}
