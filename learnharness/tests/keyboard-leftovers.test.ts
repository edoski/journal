/**
 * Round 8 (4 #13): keyboard leftovers. The sidebar's search stayed filled
 * after Esc and on every page after it, and a deleted course's lesson kept
 * a greyed-out Done for today. (⌘K's first focus on Now is checked in
 * lesson-top-bar-proposed.test.tsx; focus after Refresh in
 * sign-in-line.test.ts.)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { leaveSearch, opensSearchResult } from "../components/sidebar-state.ts";
import { parseHTML } from "linkedom";
import { doneTonightGone } from "../components/lesson/done-tonight.tsx";

test("Esc out of the sidebar search empties it and puts focus in the box", () => {
	const seen: string[] = [];
	const doc = { body: {}, activeElement: null, querySelector: (s: string) => (s.includes("composer") ? { focus: () => seen.push("box") } : null) } as unknown as Document;
	let query = "chain rule";
	leaveSearch({ blur: () => seen.push("blur") }, (next) => { query = next; }, doc);
	assert.equal(query, "");
	assert.deepEqual(seen, ["blur", "box"]);
});

test("a deleted course's lesson shows no Done for today", () => {
	assert.equal(doneTonightGone({ closedForToday: false, courseGone: true, lessonGone: false }), true);
	assert.equal(doneTonightGone({ closedForToday: false, courseGone: false, lessonGone: true }), true);
	assert.equal(doneTonightGone({ closedForToday: false, courseGone: false, lessonGone: false }), false);
});

test("opening a search result empties the search, so the agenda is back (round 9, 4 #6)", () => {
	const { document } = parseHTML(`<ul><li data-slot="results-label">Topics</li><li><a href="/u/la/rank" data-sidebar-row="la:rank"><span id="title">Rank practice</span></a></li><li><button data-sidebar-row="chat:c1"><span id="session">Rank, second pass</span></button></li></ul>`);
	assert.equal(opensSearchResult(document.getElementById("title")), true, "a topic or course found");
	assert.equal(opensSearchResult(document.getElementById("session")), true, "a session found");
	assert.equal(opensSearchResult(document.querySelector("[data-slot=results-label]")), false, "a heading opens nothing");
	assert.equal(opensSearchResult(null), false);
});
