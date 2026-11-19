import type { ServerEvents, StudyWindow } from "@/src/core";
import { NOTICE_WORDS, todayNoticeWords } from "@/components/study-words";
import { courseHref } from "@/components/unit-inbox/unit-href";

/**
 * The Mac app's notifications (spec: desktop-notices.md), very sparing:
 * today's plan at most once a day, and work he started when it finishes,
 * each only while no window of the app is focused (he is already looking
 * at the app). Nothing else: no reminders, no
 * repeats. The words are Home's (`study-words.ts`). Pure.
 */

/** One notification, as the shell shows it (electron/main.cjs, `showNotice`). */
export interface Notice {
	/** One per job, and one per day for the plan: the shell never shows an id twice. */
	id: string;
	title: string;
	body: string;
	/** Where a click on it opens. */
	href: string;
	/** Shown only while no window of the app is focused. */
	away: boolean;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether `now` falls in today's study hours: from the first window's
 *  start to the last one's end (a lunch break between them included). No
 *  hours (no Journal), never. */
export function inStudyHours(hours: readonly StudyWindow[], now: Date): boolean {
	if (hours.length === 0) return false;
	const at = now.getHours() * 60 + now.getMinutes();
	return at >= Math.min(...hours.map((w) => minutes(w.start))) && at < Math.max(...hours.map((w) => minutes(w.end)));
}

/** Today's plan, when the app is first in use that day: Today's lines in
 *  one line, opening Home. None when today holds nothing or outside his
 *  study hours, and held while a window of the app is focused.
 *  `titles` are Today's lines' names (`lessonTitle`). */
export function planNotice(titles: readonly string[], hours: readonly StudyWindow[], today: string, now: Date): Notice | null {
	if (titles.length === 0 || !inStudyHours(hours, now)) return null;
	return { id: `plan:${today}`, title: NOTICE_WORDS.today, body: todayNoticeWords(titles), href: "/", away: true };
}

/** Work he started that finished: a course's topic map, opening its course
 *  page; a new lesson's opening, opening the lesson. Shown only while he is
 *  in another app. */
export function workNotice(work: ServerEvents["work-finished"]): Notice {
	if (work.kind === "course-map") return { id: `map:${work.workspace}:${work.at}`, title: work.title, body: NOTICE_WORDS.mapReady, href: courseHref(work.workspace), away: true };
	return { id: `lesson:${work.chatId}`, title: work.title, body: NOTICE_WORDS.lessonReady, href: `/chat/${work.chatId}`, away: true };
}
