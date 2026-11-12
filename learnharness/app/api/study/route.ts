import { studyStatus } from "@/src/server";

export const dynamic = "force-dynamic";

/** The study home: every listed course's map with its run-up and last
 *  activity, or `available: false` when the engine cannot run. */
export async function GET() {
	return Response.json(await studyStatus());
}
