/**
 * A deleted course stays deleted (round 3, 14 Nov 2026): an old lesson of
 * it is history. A turn there is refused, and the tutor's save into it is
 * refused, so its record never comes back as an untitled ghost course.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-course-deleted-"));
process.env.LH_DATA_DIR = path.join(TMP, "data");

const { courseRecordForgotten } = await import("../src/store/course-records.ts");
const { courseDeleted, COURSE_DELETED } = await import("../src/server/courses.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { handleChatInput } = await import("../src/server/chat-handler.ts");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function course(name: string, record: boolean): string {
	const workspace = path.join(TMP, name);
	fs.mkdirSync(path.join(workspace, ".study"), { recursive: true });
	fs.writeFileSync(path.join(workspace, ".study", "workspace.json"), "{}");
	if (record) fs.writeFileSync(path.join(workspace, ".study", "course.json"), "{}");
	return workspace;
}

describe("a deleted course", () => {
	it("is a course folder whose record the engine forgot; a live or damaged one is not, nor a folder never made a course", () => {
		assert.equal(courseRecordForgotten(course("calculus", false)), true);
		assert.equal(courseRecordForgotten(course("algebra", true)), false);
		assert.equal(courseRecordForgotten(path.join(TMP, "never-a-course")), false);
	});

	it("refuses a turn in its old lesson, in plain words", async () => {
		const workspace = course("calculus-old", false);
		const chat = chatStore.createChat("Chain rule review", { workspace, title: "Calculus I" });
		assert.equal(courseDeleted(chat.id), true);
		const res = await handleChatInput(chat.id, { type: "text", text: "One more problem?" });
		assert.equal(res.status, 410);
		assert.equal(((await res.json()) as { error: string }).error, COURSE_DELETED);
		assert.equal(fs.existsSync(path.join(workspace, ".study", "course.json")), false, "nothing wrote the record back");
	});
});
