/**
 * The photo surfaces as rendered (14 Nov 2026): a photo waiting in a check's
 * answer makes it submittable with no typed words, the answered card and the
 * practice card show what he sent, and the attach shortcut collides with
 * nothing on the cheat sheet.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { QuestionDock } from "../components/question-dock.tsx";
import { AnsweredCard } from "../components/answered-card.tsx";
import { ThinkingCard } from "../components/practice-cards.tsx";
import { SessionMermaidContext } from "../components/session-overlay.tsx";
import { emptyDockSelection, KEYBOARD_ACTIONS, type QuestionFormDraft } from "../src/core/index.ts";

void React;

const photo = { type: "image" as const, mimeType: "image/jpeg", data: "/9j/AAAA" };
const doc = (html: string) => parseHTML(`<html><body>${html}</body></html>`).document;
const explain = { type: "check", nodeId: "n", question: "Derive the quadratic formula.", correctAnswer: "$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$" };

describe("photo answers in the dock and the transcript", () => {
	it("a check with only a photo waiting can be submitted, and shows the thumbnail and the attach button", () => {
		const draft: QuestionFormDraft = { selection: emptyDockSelection(), thinking: "", other: "", text: "", confidence: "neutral", photos: [{ id: "p1", photo }] };
		const withPhoto = doc(renderToStaticMarkup(<QuestionDock toolName="explain" toolCallId="e1" input={explain} expanded onExpand={() => {}} onSubmit={() => {}} initialDraft={draft} />));
		const submit = [...withPhoto.querySelectorAll("button[type=submit]")].find((b) => b.textContent === "Submit")!;
		assert.equal(submit.hasAttribute("disabled"), false, "a photo alone is an answer");
		assert.equal(withPhoto.querySelectorAll('[data-testid="pending-photo"]').length, 1);
		assert.ok(withPhoto.querySelector('[data-testid="photo-attach"]'));

		const empty = doc(renderToStaticMarkup(<QuestionDock toolName="explain" toolCallId="e2" input={explain} expanded onExpand={() => {}} onSubmit={() => {}} />));
		const none = [...empty.querySelectorAll("button[type=submit]")].find((b) => b.textContent === "Submit")!;
		assert.equal(none.hasAttribute("disabled"), true, "nothing typed and no photo is no answer");
	});

	it("a multiple-choice question offers no photo", () => {
		const html = renderToStaticMarkup(<QuestionDock toolName="ask_user_question" toolCallId="a1" input={{ question: "Pick one", options: [{ label: "A" }, { label: "B" }] }} expanded onExpand={() => {}} onSubmit={() => {}} />);
		assert.equal(doc(html).querySelector('[data-testid="photo-attach"]'), null);
	});

	it("the answered card and the practice card show the sent photo, which opens large in a lesson", () => {
		const answer = { kind: "explain" as const, tool: "explain", questionText: "Derive it.", answers: [], confidence: "neutral" as const, answeredAt: "2026-11-14T10:00:00.000Z" };
		const card = doc(renderToStaticMarkup(
			<SessionMermaidContext.Provider value={{ openMermaid: () => {}, openFigure: () => {}, openPhoto: () => {} }}>
				<AnsweredCard answer={answer} photos={[photo]} />
			</SessionMermaidContext.Provider>,
		));
		assert.equal(card.querySelector('[data-testid="sent-photos"] img')?.getAttribute("src"), `data:image/jpeg;base64,${photo.data}`);
		assert.ok(card.querySelector('[data-testid="photo-open"]'), "a click opens it large");

		const practice = doc(renderToStaticMarkup(<ThinkingCard data={{ problemCallId: "p", text: "", photos: [photo] }} />));
		assert.equal(practice.querySelectorAll('[data-testid="sent-photos"] img').length, 1);
		assert.equal(practice.querySelector('[data-testid="thinking-card"]'), null, "no empty thinking row beside a photo-only submission");
	});

	it("the attach shortcut is on the cheat sheet and collides with no other binding", () => {
		const attach = KEYBOARD_ACTIONS.find((a) => a.id === "attach-photo")!;
		assert.ok(attach && !attach.displayOnly);
		const same = KEYBOARD_ACTIONS.filter((a) => a.binding === attach.binding);
		assert.deepEqual(same.map((a) => a.id), ["attach-photo"]);
	});
});
