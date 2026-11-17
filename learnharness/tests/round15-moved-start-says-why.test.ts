/**
 * Round 15, m2 (1 m2; round-14 m3's remainder): a moved start gave no
 * reason anywhere. On 8 Nov a partly right Binomial review moved Poisson's
 * start from 9 to 13 Nov. The Poisson page read "Planned Fri 13 Nov", and
 * on 9 Nov the tutor said "I can't see a recorded reason", though the
 * engine had the move (`moved.waits_on: [binomial]`) that day and why it
 * starts then (`starts_why: {after, partners: [binomial]}`) every day.
 * Edo: a moved day says truly what moved it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapTopic, StartsWhy, TopicHandle, TopicMoved } from "../src/core/index.ts";
import { topicFacts } from "../components/unit-inbox/topic-page/topic-facts.ts";
import { pickupSections } from "../components/unit-inbox/topic-page/pickup/pickup-facts.ts";
import { LINALG, TODAY } from "./fixtures/now-demo.ts";
import { withDayWords } from "../src/core/day-words.ts";
import { courseTools } from "../src/agent/tools/course.ts";

const partners: StartsWhy = { kind: "after", needs: [], partners: ["eigen" as TopicHandle] };

/** Diagonalization not started, planned on `starts`, starting after Eigenvalues it is kept apart from. */
function noteFor(starts: string, moved?: TopicMoved): string | null {
	const base = LINALG.map.topics.find((t) => t.handle === "diag")!;
	const diag: CourseMapTopic = { ...base, level: "new", introduced: null, starts, startsWhy: partners, ...(moved ? { moved } : {}) };
	const course = { ...LINALG, map: { ...LINALG.map, topics: LINALG.map.topics.map((t) => (t.handle === "diag" ? diag : t)) } };
	return pickupSections(topicFacts({ course, topic: diag, chats: [], read: null })).now.note;
}

describe("a start's plan line says why it comes when it does (round 15, m2)", () => {
	it("on the day his study moved it: from which day, and what moved it", () => {
		const moved: TopicMoved = { from: "2026-11-09", by: "study", courses: ["Linear Algebra"], day: "today", waitsOn: ["Eigenvalues and eigenvectors"] };
		assert.equal(noteFor("2026-11-13", moved), "Planned Fri 13 Nov · Moved from 9 Nov, since Eigenvalues and eigenvectors is not solid yet");
	});

	it("on later days: the topic it starts after", () => {
		assert.ok(TODAY < "2026-11-13");
		assert.equal(noteFor("2026-11-13"), "Planned Fri 13 Nov · After Eigenvalues and eigenvectors");
	});
});

describe("a save that moves a start he was told tells the close (round 15, m2)", () => {
	it("its receipt gives the start's new day and the day it moved from in words", () => {
		const receipt = { revision: 3, starts_moved: { poisson: { title: "Poisson distribution", starts: "2026-11-13", moved: { from: "2026-11-09", by: "study", courses: ["Probability"], day: "today", waits_on: ["Binomial distribution"] } } } };
		const worded = withDayWords(receipt, "2026-11-08") as { starts_moved: { poisson: { starts_words: string; moved: { from_words: string } } } };
		assert.equal(worded.starts_moved.poisson.starts_words, "Friday 13 November");
		assert.equal(worded.starts_moved.poisson.moved.from_words, "Monday 9 November");
	});

	it("the save's contract asks the close to say it", () => {
		const records = { run: async () => ({ ok: true, json: {} }), map: async () => ({ ok: false }), forgotten: () => false } as never;
		const tools = courseTools({ course: { workspace: "/s/pr", title: "Probability" }, records, arcs: false });
		assert.match(tools.course_save!.description, /`starts_moved` lists each first lesson his study today moved off a day he was told: your closing words say it/);
	});
});
