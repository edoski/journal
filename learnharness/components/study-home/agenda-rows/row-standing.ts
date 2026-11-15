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
 * The standing a Today row on Home carries (Edo's notes, 15 Nov
 * 2026, N1), null on a row of several topics or none, and on a topic not
 * started: its plan step already reads "Start …", and on a session's row
 * "Not started" would contradict the lesson, as the topic page's head
 * goes silent there (the cold read of 15 Nov 2026 read "Not started" beside
 * "Start Linear maps" as one fact said twice). The slip drops when the
 * row's reason is the miss, so the row never says it twice. Pure.
 */
export function rowStanding(row: TodayRow): RowStanding | null {
	const [handle, ...more] = lineTopics(row);
	const map = row.course?.map;
	const topic = handle && more.length === 0 ? map?.topics.find((t) => t.handle === handle) : undefined;
	if (!map || !topic || topic.level === "new") return null;
	const slip = whyOf(row)?.kind === "missed" ? null : slipBeside(topic, (h) => map.topics.find((t) => t.handle === h)?.title ?? h);
	return { standing: standingOf(topic), slip };
}
