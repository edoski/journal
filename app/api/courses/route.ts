import { listCourses } from "@/src/server";

export const dynamic = "force-dynamic";

/** The course chooser: the learning engine's registered courses, or
 *  `available: false` when the engine cannot run (the picker hides). */
export async function GET() {
	return Response.json(await listCourses());
}
