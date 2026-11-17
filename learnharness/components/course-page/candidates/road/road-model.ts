import type { ArcHandle, CourseMap } from "@/src/core";
import type { CourseArcSection } from "@/components/course-page/course-model";
import { ARC_EXAM_WORDS, arcStartsWords } from "@/components/study-words";

/**
 * Where the exam sits on Road's list (spec: road.md): after the last arc
 * the exam examines and the plan fits (`stopBefore`, the first arc after
 * it, or null when it closes the list), and the arcs past it (`past`):
 * those the exam does not examine, and those whose topics are all still
 * to start with none the plan has room for before the exam. Null with no
 * exam ahead. Pure.
 */
export function examStop(map: Pick<CourseMap, "exam" | "topics">, sections: readonly CourseArcSection[]): { stopBefore: ArcHandle | null; past: ReadonlySet<ArcHandle> } | null {
	const { exam } = map;
	if (!exam || exam.daysLeft < 0) return null;
	const left = new Set([...(exam.doesNotFit ?? []), ...(exam.leavesOut ?? [])]);
	const past = new Set(
		sections
			.filter((s) => {
				if (s.exam === ARC_EXAM_WORDS.none) return true;
				const live = s.topics.filter((t) => t.topic.excluded === undefined);
				return live.length > 0 && live.every((t) => t.topic.introduced === null && left.has(t.topic.handle));
			})
			.map((s) => s.arc.handle),
	);
	const lastIn = sections.findLastIndex((s) => !past.has(s.arc.handle));
	return { stopBefore: sections[lastIn + 1]?.arc.handle ?? null, past };
}

/** What an arc's line ends in on the road, when it says something: its
 *  first new topic's day while none is started, "Starts 15 Nov". Pure. */
export function arcStarts(section: CourseArcSection, today: string): string | null {
	if (section.arc.state !== "new") return null;
	const days = section.topics.flatMap((t) => (t.topic.starts && t.topic.excluded === undefined ? [t.topic.starts] : [])).sort();
	const first = days.find((d) => d >= today) ?? null;
	return first ? arcStartsWords(first) : null;
}
