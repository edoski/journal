/**
 * Round 20, m16 (4 minor 6). A "New reply" pill showed for about 3 s with
 * no reply behind it: on opening a closed lesson (2.5 to 5.4 s, no
 * `/api/chat`), and when the unreadable notice appeared under the
 * transcript. The cue read only geometry, so maths and figures settling
 * after the first paint, or a notice, read as a reply. It now names a new
 * reply only while the tutor's reply grew since he last read to the end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrollCueOf, seenThrough, type ScrollGeometry } from "../components/lesson/reading-position.ts";
import { replyKey } from "../components/lesson/scroll-cue.tsx";

const at = (scrollTop: number, scrollHeight: number): ScrollGeometry => ({ scrollTop, scrollHeight, clientHeight: 930, reserve: 200 });

test("a closed lesson whose maths settles after the first paint shows no New reply", () => {
	const opened = at(1500 + 200 - 930, 1500 + 200);
	const seen = seenThrough(opened, -Infinity);
	const settled = at(opened.scrollTop, 1500 + 400 + 200);
	assert.equal(scrollCueOf(settled, seenThrough(settled, seen), false), "down");
	assert.equal(scrollCueOf(settled, seenThrough(settled, seen), true), "new-reply", "a reply that grew below him still shows it");
});

test("the reply's key changes when a reply comes or grows, never for a notice or a settled layout", () => {
	const closed = [
		{ id: "u1", role: "user", parts: [{ type: "text", text: "Part (d)" }] },
		{ id: "a1", role: "assistant", parts: [{ type: "text", text: "That's the set." }] },
	];
	const key = replyKey(closed);
	assert.equal(replyKey([...closed]), key, "the same lesson re-rendered");
	assert.notEqual(replyKey([closed[0]!, { ...closed[1]!, parts: [{ type: "text", text: "That's the set. Next one." }] }]), key, "the reply grew");
	assert.notEqual(replyKey([...closed, { id: "u2", role: "user", parts: [] }, { id: "a2", role: "assistant", parts: [{ type: "text", text: "Right." }] }]), key, "a new reply");
});
