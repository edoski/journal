import { slipBeside, standingOf, type Standing } from "@/components/course-map/topic-map/topic-standing";
import { whyOf, type Why } from "@/components/study-home/agenda-rows/row-facts";
import { lineTopics } from "@/components/study-home/needs-you";
import type { TodayRow } from "@/components/study-home/study-facts";
import type { SlipKey } from "@/components/study-words";

/** Where he stands on a Today row's topic, as the topic page's head says
 *  it: the pie and its words, and the slip (why the engine calls it weak,
 *  or its open mistake) when the row's reason leaves that unsaid. The row
 *  says the slip in place of the standing's words (`rowWords`). */
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

/** The row's one status words: the slip he would act on ("Check on your
 *  own", "Mistake to fix"), else where he stands. The pie beside them
 *  keeps the warning ink of a topic that slips, so "Slipping" is never a
 *  second status beside the slip (round 10, 1 m4). Pure. */
export function rowWords(facts: RowStanding): string {
	return facts.slip?.words ?? facts.standing.words;
}

/** A Today row's one status: where he stands on its topic, or why it is
 *  on Today. */
export type RowStatus = { kind: "standing"; facts: RowStanding } | { kind: "why"; why: Why };

/**
 * The one status a Today row says, in words, the same on Home's row and on
 * the sidebar's card for the line (round 11, 1 N9: "Studied today ·
 * Mistake to fix · Your turn" on one row; round 12, 1 m3 and 2 n2: Home
 * said "Mistake to fix" where the sidebar said "Your turn" for one
 * session, "Check again another day" beside "Due today" for one review):
 * why the row is on Today ("Your turn", "Tutor writing", "Due since 6
 * Nov", "Not right last time: Chain rule", "Left off 6 Nov", "Planned
 * today"), since that is what its press opens on, except a plain "Next
 * up", which says only that the row is on Today; else the slip he would
 * act on ("Mistake to fix"); else where he stands on its topic. The pie
 * beside it keeps a slip's warning ink. When he last studied it is not a
 * status: Home's "Studied today" line names what he studied. Null with
 * nothing to say. Pure.
 */
export function rowStatus(row: TodayRow): RowStatus | null {
	const why = whyOf(row);
	const facts = rowStanding(row);
	// A plain "Next up" says only that the row is on Today; the slip or where he stands says more.
	if (why && !(facts && why.kind === "next" && !why.starts)) return { kind: "why", why };
	return facts ? { kind: "standing", facts } : null;
}
