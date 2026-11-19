/**
 * Why a day he was told moved, beside "Moved from …" (`TopicMoved`): the
 * words the topic page, the calendar and the tutor's brief all say, so one
 * cause reads the same everywhere. The engine names the last day he studied
 * (`on`), so a move after days with no study names that day, never a
 * "yesterday" a week back (round 10: a close blamed a review he had done on
 * 9 Nov for a move after a quiet week). Pure.
 */
import type { TopicMoved } from "./contracts/course-map.ts";

const ONE_DAY = 86_400_000;
const before = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * ONE_DAY).toISOString().slice(0, 10);

/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The cause, with its leading separator: ", since Random variables is not
 *  solid yet" (a topic it waits on slipped in today's study), ", since
 *  Random variables needs its check on another day" (it was right on his own
 *  today), ", now that Random variables is solid" (his answers brought it
 *  forward), " after your
 *  answer today", " after your Probability study today", ", no study
 *  yesterday", ", no study since 10 Nov", ", yesterday's plan was not
 *  finished", ", the plan of 13 Nov was not finished". `dayWords` names a
 *  day as the surface does; `today` is the engine's day. Each is what truly
 *  moved it (round 14, m3: the tutor turned "after your study today" into
 *  "today's day was full" when Random variables had slipped). */
export function movedWhy(moved: TopicMoved, today: string, dayWords: (day: string) => string): string {
	// Right on his own today, a topic it waits on needs only its check on
	// another day, as its own status says ("Right on your own, check another
	// day"): never "not solid yet" beside it (round 17, 1 M1).
	if (moved.by === "study" && moved.waitsOn?.length && moved.anotherDay) return `, since ${listed(moved.waitsOn)} ${moved.waitsOn.length > 1 ? "need their checks" : "needs its check"} on another day`;
	if (moved.by === "study" && moved.waitsOn?.length) return `, since ${listed(moved.waitsOn)} ${moved.waitsOn.length > 1 ? "are" : "is"} not solid yet`;
	// Brought forward by his answers (round 17, 2 m3).
	if (moved.by === "study" && moved.ready?.length) return `, now that ${listed(moved.ready)} ${moved.ready.length > 1 ? "are" : "is"} solid`;
	if (moved.by === "study") return ` after your ${listed(moved.courses)} study ${moved.day}`;
	if (moved.by === "answered") return " after your answer today";
	if (moved.by === "missed") return !moved.on || moved.on >= before(today, 2) ? ", no study yesterday" : `, no study since ${dayWords(moved.on)}`;
	return !moved.on || moved.on >= before(today, 1) ? ", yesterday's plan was not finished" : `, the plan of ${dayWords(moved.on)} was not finished`;
}
