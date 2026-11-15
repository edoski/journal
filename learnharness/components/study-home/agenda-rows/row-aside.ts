import { standingOf } from "@/components/course-map/topic-map/topic-standing";
import { lineTopics } from "@/components/study-home/needs-you";
import type { TodayRow } from "@/components/study-home/study-facts";

/** Where he stands on the row's one topic, in the map's words ("Right
 *  with help"); null on a row of several topics or none. */
function standingWords(row: TodayRow): string | null {
	const [handle, ...more] = lineTopics(row);
	if (!handle || more.length > 0) return null;
	const topic = row.course?.map.topics.find((t) => t.handle === handle);
	return topic ? standingOf(topic).words : null;
}

/**
 * Each row's standing, the fact Home's Proposed adds to a Today row (Edo's
 * notes, 15 Nov 2026, N1), in the rows' order, null where it has none. Pure.
 */
export function rowStandings(rows: readonly TodayRow[]): (string | null)[] {
	return rows.map(standingWords);
}
