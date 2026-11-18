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

/** Every day `words` names, in order, as ISO days ("today", "tomorrow", "Tue 10 Nov", "Tuesday 10 November"). */
export function daysIn(words: string, today: string): string[] {
	return [...words.matchAll(DAY_WORDS)].map((m) => {
		const word = m[1]!.toLowerCase();
		if (word === "today") return today;
		if (word === "tomorrow") return addDays(today, 1);
		const month = MONTHS.indexOf(m[3]!.toLowerCase());
		return `2026-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
	});
}

export const short = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/** Whether `title` stands whole in `words`, not as a part of a longer title. */
export function names(words: string, title: string): boolean {
	const at = words.indexOf(title);
	if (at < 0) return false;
	return /^\s*($|[,;.:()]|and )/.test(words.slice(at + title.length)) || names(words.slice(at + title.length), title);
}

/** The day a topic page's Scheduled row draws. */
export function scheduledDay(row: Element | null, today: string): string | undefined {
	return daysIn((row?.textContent ?? "").replace(/\s+/g, " ").trim(), today)[0];
}

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
		const body = line.slice(line.indexOf(":") + 1).replace(/\([^)]*\)/g, "");
		for (const title of titles) if (!found.has(title) && names(body, title)) found.set(title, day);
	}
	return found;
}
