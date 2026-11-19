/**
 * How the cross-surface journey reads the day a surface gives a topic,
 * from the words it draws: pure, so each reader is checked on the words
 * that once misled it (day-claims.test.tsx).
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_WORDS = /\b(today|tomorrow|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,? (\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi;

export function addDays(day: string, n: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Every day `words` names, in order, as ISO days ("today", "tomorrow", "Tue 10 Nov", "Tuesday 10 November"). A day
 *  the words give no year is the one nearest `today`: "Mon 4 Jan" read on 17 Nov 2026 is 4 Jan 2027 (round 17: the
 *  plan's January starts read as 2026, a Sunday). */
export function daysIn(words: string, today: string): string[] {
	return [...words.matchAll(DAY_WORDS)].map((m) => {
		const word = m[1]!.toLowerCase();
		if (word === "today") return today;
		if (word === "tomorrow") return addDays(today, 1);
		const month = MONTHS.indexOf(m[3]!.toLowerCase());
		const year = Number(today.slice(0, 4));
		const on = (y: number) => `${y}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
		const away = (day: string) => Math.abs(Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));
		return [year - 1, year, year + 1].map(on).reduce((best, day) => (away(day) < away(best) ? day : best));
	});
}

export const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/** Whether `title` stands whole in `words`, not as a part of a longer title. */
export function names(words: string, title: string): boolean {
	const at = words.indexOf(title);
	if (at < 0) return false;
	return /^\s*($|[,;.:()]|and )/.test(words.slice(at + title.length)) || names(words.slice(at + title.length), title);
}

/** The day a topic page's Scheduled row draws in its date column: its words run together ("ReviewTue 10 NovMoved from
 *  9 Nov after your answer today"), and its note may name another day. */
export function scheduledDay(row: Element | null, today: string): string | undefined {
	return daysIn(row?.querySelector('[data-slot="topic-history-date"]')?.textContent ?? "", today)[0];
}

/** A title's own parentheses, set apart from a note's. */
const unbracketed = (title: string) => title.replace(/\(/g, "\u2768").replace(/\)/g, "\u2769");

/** The first day on or after `today` that the brief's plan lines under `course` review or start each of `titles`,
 *  by title. `courses` are every course's title, each of which heads its own plan lines. */
export function briefDays(brief: string, courses: ReadonlySet<string>, course: string, titles: readonly string[], today: string): Map<string, string> {
	const found = new Map<string, string>();
	let under: string | null = null;
	for (const line of brief.split("\n")) {
		const head = line.split(" · ")[0]!.replace(/ \(this course\)$/, "");
		if (courses.has(head)) under = head;
		if (under !== course || !line.startsWith("- ")) continue;
		const [day] = daysIn(line.slice(2, line.indexOf(":")), today);
		if (!day || day < today) continue;
		// Each note in parentheses is dropped whole once each title's own parentheses are set apart, so a note naming a
		// title ("since Homomorphisms (linear maps) is not solid yet") goes with it. Longest first, so a title inside a
		// longer one never splits it.
		const body = [...titles].sort((a, b) => b.length - a.length).reduce((words, title) => words.replaceAll(title, unbracketed(title)), line.slice(line.indexOf(":") + 1)).replace(/\([^()]*\)/g, "");
		for (const title of titles) if (!found.has(title) && names(body, unbracketed(title))) found.set(title, day);
	}
	return found;
}
