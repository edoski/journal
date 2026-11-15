import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCourses } from "@/src/server";
import { courseLabel } from "@/src/core";
import { CoursePage } from "@/components/course-page/course-page";
import { workspaceOf } from "@/components/unit-inbox/unit-href";

export const dynamic = "force-dynamic";

/** The window's title: the course's name, "Course not found" for an address
 *  no listed course has, and "Course" while the engine cannot say. Set here
 *  rather than by a client `<title>`, which the root layout's title precedes. */
export async function generateMetadata({ params }: { params: Promise<{ course: string }> }): Promise<Metadata> {
	const workspace = workspaceOf((await params).course);
	if (!workspace) return { title: "Course not found" };
	const listing = await listCourses();
	if (!listing.available) return { title: "Course" };
	const course = listing.courses.find((c) => c.workspace === workspace);
	return { title: course ? courseLabel(course) : "Course not found" };
}

/** One course: every topic in the order he would take it, the exam and the next lesson. */
export default async function CourseRoute({ params }: { params: Promise<{ course: string }> }) {
	const { course } = await params;
	const workspace = workspaceOf(course);
	if (!workspace) notFound();
	return <CoursePage key={workspace} workspace={workspace} />;
}
