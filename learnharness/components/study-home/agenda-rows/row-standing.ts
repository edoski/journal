import { slipBeside, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { whyOf } from "@/components/study-home/agenda-rows/row-facts";
import { lineTopics } from "@/components/study-home/needs-you";
import type { TodayRow } from "@/components/study-home/study-facts";
import type { SlipKey } from "@/components/study-words";

/** Where he stands on a Today row's topic, as the topic page's head says
 *  it: the pie and its words, and why the engine calls it weak when the
 *  words and the row's reason leave that unsaid. */
export interface RowStanding {
	standing: Standing;
	slip: { key: SlipKey; words: string } | null;
}

/**
 * The standing Home's Proposed adds to a Today row (Edo's notes, 15 Nov
 * 2026, N1), null on a row of several topics or none. The slip drops when
 * the row's reason is the miss, so the row never says it twice. Pure.
 */
export function rowStanding(row: TodayRow): RowStanding | null {
	const [handle, ...more] = lineTopics(row);
	const map = row.course?.map;
	const topic = handle && more.length === 0 ? map?.topics.find((t) => t.handle === handle) : undefined;
	if (!map || !topic) return null;
	const slip = whyOf(row)?.kind === "missed" ? null : slipBeside(topic, (h) => map.topics.find((t) => t.handle === h)?.title ?? h);
	return { standing: standingOf(topic), slip };
}
