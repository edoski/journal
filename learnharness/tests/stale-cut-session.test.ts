/**
 * A session whose reply was cut before he said anything in it stops being
 * Now once he studies the course past it (round 10, 2 m4): the seeded
 * "Diagonalization preview", cut on 6 Nov with nothing of his in it, still
 * read "Reply cut off · Resume" on Diagonalization's page after the Eigen
 * lesson of 8 Nov, since round 9's rule only read later sessions on the
 * topic itself. The list says when a session holds nothing of his
 * (`untouched`); the store is real, on a temporary data dir.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type { ChatListItem } from "../src/core/contracts/chat.ts";
import type { CourseMap, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lh-stale-cut-"));
process.env.LH_DATA_DIR = TMP;
const { chatStore } = await import("../src/store/chats.ts");
const { topicAction } = await import("../components/unit-inbox/topic-page/topic-facts.ts");
const { resumableSession } = await import("../components/nav/session-state.ts");
const { sessionsNow } = await import("../components/unit-inbox/units.ts");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const LA = "/study/linalg";
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const diag: CourseMapTopic = { handle: "diagonalization" as TopicHandle, title: "Diagonalization", level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] };
const MAP = { workspace: LA, title: "Linear Algebra", today: "2026-11-08", topics: [diag], tasks: [], focus: null } as unknown as CourseMap;

function session(id: string, over: Partial<ChatListItem>): ChatListItem {
	return { id, title: id, kind: "teach", createdAt: "2026-11-06T20:40:00.000Z", updatedAt: "2026-11-06T20:40:05.000Z", messageCount: 2, phase: "probe", pendingQuestion: false, pendingProblem: false, course: { workspace: LA, title: "Linear Algebra" }, topics: [], ownTopics: [], busy: false, ...over };
}

const preview = session("preview", { title: "Diagonalization preview", ended: "cut", untouched: true, topics: ["diagonalization"], ownTopics: ["diagonalization"] });
const eigen = session("eigen", { title: "Eigenvalues and eigenvectors", ended: "left", createdAt: "2026-11-08T09:00:00.000Z", updatedAt: "2026-11-08T10:00:00.000Z", topics: ["eigen"], ownTopics: ["eigen"] });

describe("a session cut before he said anything", () => {
	it("is marked as holding nothing of his in the session list", () => {
		const opened = chatStore.createChat("Diagonalization");
		chatStore.saveMessages(opened.id, [{ role: "user", content: "Diagonalization", timestamp: Date.now() } as never, { role: "assistant", content: [{ type: "text", text: "Let's" }], stopReason: "aborted", timestamp: Date.now() } as never]);
		assert.equal(chatStore.listChats().find((c) => c.id === opened.id)?.untouched, true);
		const answered = chatStore.createChat("Eigen");
		chatStore.saveMessages(answered.id, [{ role: "user", content: "Eigen", timestamp: Date.now() } as never, { role: "user", content: "λ = 2", timestamp: Date.now() } as never]);
		assert.equal(chatStore.listChats().find((c) => c.id === answered.id)?.untouched, undefined);
		const quizzed = chatStore.createChat("Rank practice");
		chatStore.saveMessages(quizzed.id, [
			{ role: "user", content: "Rank practice", timestamp: Date.now() } as never,
			{ role: "toolResult", toolCallId: "q1", toolName: "explain", isError: false, content: [], details: { text: "rank 2" }, timestamp: Date.now() } as never,
		]);
		assert.equal(chatStore.listChats().find((c) => c.id === quizzed.id)?.untouched, undefined, "an answer to a question is his");
	});

	it("is no longer the topic's Now once a later session in the course started", () => {
		assert.deepEqual(topicAction(diag, MAP, [eigen, preview]), { kind: "start", opening: "Diagonalization" });
		assert.equal(sessionsNow([preview], [eigen, preview]), null);
	});

	it("stays Now while nothing in the course came after it, and when he had said something in it", () => {
		assert.deepEqual(topicAction(diag, MAP, [preview]), { kind: "resume", chat: preview });
		const spoken = { ...preview, untouched: undefined };
		assert.equal(resumableSession([spoken], [eigen, spoken])?.id, "preview", "a cut lesson he answered in waits for him");
		const otherCourse = { ...eigen, course: { workspace: "/study/prob", title: "Probability" } };
		assert.equal(resumableSession([preview], [otherCourse, preview])?.id, "preview", "study in another course moved past nothing here");
	});
});
