import { notFound } from "next/navigation";
import { UnitPage } from "@/components/unit-inbox/unit-page";
import { workspaceOf } from "@/components/unit-inbox/unit-href";

export const dynamic = "force-dynamic";

/** One course topic: its standing, its sessions and the composer that starts the next. */
export default async function UnitRoute({ params }: { params: Promise<{ course: string; topic: string }> }) {
	const { course, topic } = await params;
	const workspace = workspaceOf(course);
	if (!workspace) notFound();
	return (
		<UnitPage
			key={`${workspace}#${topic}`}
			workspace={workspace}
			handle={decodeURIComponent(topic)}
		/>
	);
}
