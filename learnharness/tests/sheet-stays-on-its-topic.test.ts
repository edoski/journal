/**
 * After its close, Problem sheet 4 stays on its own topic's card (round
 * 13, 2 M1). He continued the sheet and pressed Done for today: the sheet,
 * left for next time, left Home for the day, as a session he said he is
 * done with does, but Learning had no Kernel, and "On your own" offered
 * "Vectors and linear combinations · Back Thu 26 Nov · Resume", which
 * opened the sheet, because its first check was on vectors. Two causes:
 * the morning's Kernel review, seeded later on the day than his clock,
 * moved past the sheet, and a row's Resume read every session that touched
 * its topic. The sessions are the evaluator's, as `/api/chats` listed them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInbox, rowResume } from "../components/unit-inbox/units.ts";
import type { StudyCourse, TopicHandle } from "../src/core/index.ts";
import { chat, map, topic } from "./fixtures/round8-home.ts";

const SHEET = chat({ id: "chat_demo_la_1106_1945", title: "Problem sheet 4", ended: "left", ownTopics: ["kernel"], topics: ["kernel", "vectors", "rank"], tasks: ["sheet-4"], createdAt: "2026-11-06T18:45:00.000Z", updatedAt: "2026-11-08T06:39:00.850Z" });
const KERNEL_REVIEW = chat({ id: "chat_demo_la_1108_0830", title: "Kernel and rank-nullity review", review: true, ended: "closed", ownTopics: ["kernel"], topics: ["kernel"], tasks: [], createdAt: "2026-11-08T07:30:00.000Z", updatedAt: "2026-11-08T07:40:17.144Z" });
const VECTORS = chat({ id: "chat_demo_la_0928_1845", title: "Vectors and linear combinations", ended: "closed", ownTopics: ["vectors"], topics: ["vectors"], tasks: [], createdAt: "2026-09-28T16:45:00.000Z", updatedAt: "2026-09-28T17:36:25.713Z" });

const scheduled = (date: string) => ({ kind: "scheduled" as const, date });
const COURSE: StudyCourse = {
	map: map({
		today: "2026-11-08",
		topics: [
			topic("vectors", "Vectors and linear combinations", { level: "retained", review: scheduled("2026-11-26") as never }),
			topic("kernel", "Kernel and rank-nullity", { level: "independent", review: scheduled("2026-11-09") as never, tasks: ["sheet-4"] }),
		],
		tasks: [{ key: "sheet-4", title: "Problem sheet 4: rank and nullity", step: "Answer the open kernel question on B, then part (c)", updated: "2026-11-08" }],
		focus: "sheet-4",
	}),
	unready: null,
	due: [],
	newToday: [],
	lastActiveDaysAgo: 0,
};

describe("a sheet left for next time stays on its own topic's card (2 M1)", () => {
	const inbox = buildInbox([COURSE], [SHEET, KERNEL_REVIEW, VECTORS], null);
	const unit = (handle: string) => [...inbox.active, ...inbox.working, ...inbox.known].find((u) => u.topic.handle === (handle as TopicHandle));

	it("Kernel is under Learning, left for next time, and its Resume opens the sheet", () => {
		const kernel = unit("kernel");
		assert.equal(kernel?.shelf, "learning");
		assert.equal(kernel?.now, "left");
		assert.equal(kernel ? rowResume(kernel)?.id : null, SHEET.id);
	});

	it("Vectors, which the sheet only touched, offers no Resume", () => {
		const vectors = unit("vectors");
		assert.equal(vectors?.shelf, "known");
		assert.equal(vectors ? rowResume(vectors) : "missing", null);
	});
});
