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

	it("stamps a session's activity on the study day, so Studied today names the lesson just finished", () => {
		const chat = chatStore.createChat("Eigenvalues and eigenvectors");
		chatStore.saveMessages(chat.id, [{ role: "user", content: "go", timestamp: Date.now() } as never]);
		const item = { ...chatStore.listChats().find((c) => c.id === chat.id)!, busy: false, compacting: false };
		assert.equal(localDay(new Date(item.updatedAt)), "2026-11-08");
		assert.deepEqual(doneToday([item], new Date(2026, 10, 8, 10, 30)), ["Eigenvalues and eigenvectors"]);
	});
});
