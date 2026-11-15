import { weekdayWords } from "@/components/study-words";
import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { lineTopics } from "@/components/study-home/needs-you";
import type { TodayRow } from "@/components/study-home/study-facts";
import type { HomeVariant } from "@/components/design-variant";

/** The fact a wider Home adds to a Today row (Edo's notes, 15 Nov 2026,
 *  N1), by candidate. */
export type RowAside = Exclude<HomeVariant, "current">;

/** A course's exam as a day, never a count of days: "Exam today", "Exam
 *  tomorrow", "Exam Sun 29 Nov". Null for a course with none, or one past. */
function examWords(row: TodayRow): string | null {
	const exam = row.course?.map.exam;
	if (!exam || exam.daysLeft < 0) return null;
	if (exam.daysLeft === 0) return "Exam today";
	if (exam.daysLeft === 1) return "Exam tomorrow";
	return `Exam ${weekdayWords(exam.date)}`;
}

/** Where he stands on the row's one topic, in the map's words ("Right
 *  with help"); null on a row of several topics or none. */
function standingWords(row: TodayRow): string | null {
	const [handle, ...more] = lineTopics(row);
	if (!handle || more.length > 0) return null;
	const topic = row.course?.map.topics.find((t) => t.handle === handle);
	return topic ? standingOf(topic).words : null;
}

/**
 * Each row's added fact, in the rows' order, null where it has none: for
 * `exam`, a course's exam day on its first row only, so rows of one course
 * never repeat it (round 9, 1 D5: every row repeated the course's day);
 * for `standing`, where he stands on the row's one topic. Pure.
 */
export function rowAsides(rows: readonly TodayRow[], aside: RowAside): (string | null)[] {
	if (aside === "standing") return rows.map(standingWords);
	const seen = new Set<string>();
	return rows.map((row) => {
		const workspace = row.course?.map.workspace;
		if (!workspace || seen.has(workspace)) return null;
		seen.add(workspace);
		return examWords(row);
	});
}
