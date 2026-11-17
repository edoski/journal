import type { ArcHandle } from "@/src/core";
import type { CourseArcSection } from "@/components/course-page/course-model";

/** One thing on the road's track, left to right: an arc's stop, or the exam. */
export type TrackItem = { kind: "stop"; section: CourseArcSection } | { kind: "exam" };

/**
 * The road's track (spec: roadrows.md): every arc in study order, and the
 * exam at its place (before `examBefore`, at the end when null, nowhere
 * when undefined). Pure.
 */
export function trackItems(sections: readonly CourseArcSection[], examBefore: ArcHandle | null | undefined): TrackItem[] {
	const items: TrackItem[] = sections.flatMap((section): TrackItem[] => [...(examBefore === section.arc.handle ? [{ kind: "exam" as const }] : []), { kind: "stop", section }]);
	if (examBefore === null) items.push({ kind: "exam" });
	return items;
}

