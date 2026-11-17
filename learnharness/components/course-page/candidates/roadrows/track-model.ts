import type { ArcHandle } from "@/src/core";
import type { CourseArcSection } from "@/components/course-page/course-model";

/** One thing on the road's track, left to right: an arc's stop, a run of
 *  arcs folded away (before the first stop, between two, or after the
 *  last), the exam, or the press that folds the whole road back. */
export type TrackItem =
	| { kind: "stop"; section: CourseArcSection }
	| { kind: "fold"; side: "earlier" | "between" | "later" | "near" }
	| { kind: "exam" };

/**
 * The road's track (spec: roadrows.md): every arc in study order, the exam
 * at its place on the whole road (before `examBefore`, at the end when
 * null, nowhere when undefined), and each run of arcs not in `near` folded
 * into one press where they would be. When the whole road shows and a
 * stretch near him exists (`folds`), the press that folds it back closes
 * the track. Pure.
 */
export function trackItems(sections: readonly CourseArcSection[], near: readonly CourseArcSection[], examBefore: ArcHandle | null | undefined, folds: boolean): TrackItem[] {
	const kept = new Set(near.map((s) => s.arc.handle));
	const all: TrackItem[] = sections.flatMap((section): TrackItem[] => [...(examBefore === section.arc.handle ? [{ kind: "exam" as const }] : []), { kind: "stop", section }]);
	if (examBefore === null) all.push({ kind: "exam" });
	const firstShown = all.findIndex((i) => i.kind === "stop" && kept.has(i.section.arc.handle));
	const lastShown = all.findLastIndex((i) => i.kind === "stop" && kept.has(i.section.arc.handle));
	const items: TrackItem[] = [];
	all.forEach((item, at) => {
		if (item.kind !== "stop" || kept.has(item.section.arc.handle)) return void items.push(item);
		const side = at < firstShown ? "earlier" : at > lastShown ? "later" : "between";
		const last = items.at(-1);
		if (!(last?.kind === "fold" && last.side === side)) items.push({ kind: "fold", side });
	});
	if (folds && near.length === sections.length && sections.length > 0) items.push({ kind: "fold", side: "near" });
	return items;
}
