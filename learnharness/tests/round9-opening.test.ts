/**
 * Round 9 (lesson reading m11): a lesson started from a topic's page posted
 * the topic's name ("Poisson distribution", "Review Substitution") as his
 * first message. Those words are the app's instruction to the tutor, so the
 * session records that it opened that way and the transcript draws no
 * bubble for them; a session he opened with his own words keeps them.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-opening-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { appOpeningAt } = await import("../src/core/session-opening.ts");

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

const text = (role: string, words: string) => ({ role, parts: [{ type: "text", text: words }] });

describe("the app's opening words are never his bubble (round 9 m11)", () => {
	it("a session started on topics records that the app wrote its opening", () => {
		const pressed = chatStore.createChat("Poisson distribution", undefined, ["poisson"]);
		assert.equal(chatStore.getChat(pressed.id)?.appOpening, true);
		const typed = chatStore.createChat("teach me the Poisson distribution");
		assert.equal(chatStore.getChat(typed.id)?.appOpening, undefined);
	});

	it("the transcript skips the opening of a pressed start, and only that", () => {
		const messages = [
			{ role: "user", parts: [{ type: "data-session-resume" }] },
			text("user", "Poisson distribution"),
			text("assistant", "What do you already know about counting rare events?"),
			text("user", "Poisson distribution"),
		];
		assert.equal(appOpeningAt(messages, true), 1, "the first message of his with words");
		assert.equal(appOpeningAt(messages, false), -1, "his own opening stays");
		assert.equal(appOpeningAt([], true), -1);
	});
});
