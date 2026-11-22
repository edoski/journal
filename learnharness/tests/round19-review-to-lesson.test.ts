/**
 * Round 19, m20 (3, 06): after a lesson's opening review, the probe's first
 * question came with no word that the lesson had begun.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "@earendil-works/pi-ai";
import { VoiceGuard } from "../src/agent/voice-guard.ts";
import { newUserMessage } from "../src/core/native-messages.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { answered, assistant, brief, recall, rules, save, send, verdict } from "./helpers/round19-turns.ts";

describe("m20: the first question after a lesson's opening review names the lesson (3, 06)", () => {
	function invertible(): { guard: VoiceGuard; review: ToolCall } {
		const review = recall("What is the $(2,1)$ entry of $AB$ for these two matrices?");
		const guard = new VoiceGuard([
			newUserMessage("Invertible matrices"),
			brief("[Course record] Linear Algebra · today Sunday 8 November\nOpened on: invertible. He pressed the action on its page, and the app posted his first message."),
			assistant([send("First, your Mechanics of matrix multiplication review."), review]),
			answered(review, "7"),
		], undefined, false, true);
		return { guard, review };
	}

	it("the probe's first question after the review's last right answer, with no word of the lesson, is held once", () => {
		const { guard, review } = invertible();
		verdict(guard, save(review.id, "correct", ["mechanics"]));
		assert.ok(rules(guard, recall("If $EA = I$ for a product $E$ of elementary matrices, what is $AE$, and why?")).includes("lesson-unnamed"));
		assert.equal(verdict(guard, recall("Now Invertible matrices: if $EA = I$ for a product $E$ of elementary matrices, what is $AE$, and why?")), null);
	});

	it("a question that names the lesson, or the next review, passes; so does one after a miss", () => {
		const named = invertible();
		verdict(named.guard, save(named.review.id, "correct", ["mechanics"]));
		assert.equal(verdict(named.guard, recall("Now your Determinants review: what is $\\det(AB)$ when $\\det A = 2$ and $\\det B = 3$?")), null);
		const missed = invertible();
		verdict(missed.guard, save(missed.review.id, "incorrect", ["mechanics"]));
		assert.equal(verdict(missed.guard, recall("What is the $(1,2)$ entry of $AB$?")), null);
	});

	it("the course prompt says it", () => {
		assert.match(courseRecordPrompt("prober", { arcs: false }), /the first question after it opens with one clause naming the lesson it begins/);
	});
});
