/**
 * One study day for the app and its engine. The engine's day may be pinned
 * (`LEARNING_TODAY`, the demo world's 8 Nov); a session's activity is then
 * stamped on that day too, so Home's Studied today names the lesson just
 * finished (round 6, visual polish M2, a round-5 repeat: the lesson was
 * stamped with the machine's date, 14 Nov, while every other surface read
 * 8 Nov, so it dropped out of today).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-study-clock-"));
process.env.LH_DATA_DIR = TMP_DATA;
process.env.LEARNING_TODAY = "2026-11-08";

const { chatStore } = await import("../src/store/chats.ts");
const { studyNow } = await import("../src/core/day-words.ts");
const { doneToday } = await import("../components/study-home/day-record.ts");
const { localDay } = await import("../components/day-change.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
	delete process.env.LEARNING_TODAY;
});

describe("the study clock", () => {
	it("is the pinned study day at the time of day it is now, else now", () => {
		const real = new Date(2026, 10, 14, 21, 6, 1);
		const pinned = studyNow({ LEARNING_TODAY: "2026-11-08" }, real);
		assert.deepEqual([pinned.getFullYear(), pinned.getMonth(), pinned.getDate(), pinned.getHours(), pinned.getMinutes()], [2026, 10, 8, 21, 6]);
		assert.equal(studyNow({}, real).getTime(), real.getTime());
	});

	it("keeps a shifted pinned day's own time of day, whenever it is played (round 17, cross-surface after midnight)", () => {
		const opens = new Date(2026, 10, 8, 10, 0);
		for (const real of [new Date(2026, 10, 19, 0, 5), new Date(2026, 10, 19, 15, 0)]) {
			const shift = (opens.getTime() - studyNow({ LEARNING_TODAY: "2026-11-08" }, real).getTime()) / 1000;
			assert.equal(studyNow({ LEARNING_TODAY: "2026-11-08", LEARNING_CLOCK_SHIFT: String(shift) }, real).getTime(), opens.getTime());
		}
		assert.equal(studyNow({ LEARNING_CLOCK_SHIFT: "3600" }, opens).getTime(), opens.getTime(), "the shift moves only a pinned day");
	});

	it("stamps a session's activity on the study day, so Studied today names the lesson just finished", () => {
		const chat = chatStore.createChat("Eigenvalues and eigenvectors");
		// His opening and an answer in words after it: a session he studied in (round 10, 1 m2).
		chatStore.saveMessages(chat.id, [{ role: "user", content: "go", timestamp: Date.now() } as never, { role: "user", content: "λ = 2 and 5", timestamp: Date.now() } as never]);
		const item = { ...chatStore.listChats().find((c) => c.id === chat.id)!, busy: false };
		assert.equal(localDay(new Date(item.updatedAt)), "2026-11-08");
		assert.deepEqual(doneToday([item], new Date(2026, 10, 8, 10, 30)), ["Eigenvalues and eigenvectors"]);
	});
});
