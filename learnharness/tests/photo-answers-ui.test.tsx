/**
 * The photo surfaces as rendered (14 Nov 2026): a photo waiting in a check's
 * answer makes it submittable with no typed words, his answer and his work
 * show what he sent, and the attach shortcut collides with
 * nothing on the cheat sheet.
 */

import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "./helpers/app-render.tsx";
import { parseHTML } from "linkedom";
import { StickToBottom } from "use-stick-to-bottom";
import { ProseComposer, type ProseComposerProps } from "../components/lesson/prose/prose-composer.tsx";
import { ProseQuestion } from "../components/lesson/prose/prose-question.tsx";
import { ThinkingBubble } from "../components/lesson/prose/prose-practice.tsx";
import { SessionMermaidContext } from "../components/session-overlay.tsx";
import { buildAnswer, emptyDockSelection, KEYBOARD_ACTIONS, type QuestionFormDraft } from "../src/core/index.ts";
import { proseQuestionSpec } from "../components/lesson/prose/prose-question-data.ts";

void React;

const photo = { type: "image" as const, mimeType: "image/jpeg", data: "/9j/AAAA" };
const doc = (html: string) => parseHTML(`<html><body>${html}</body></html>`).document;
const explain = { type: "check", nodeId: "n", question: "Derive the quadratic formula.", correctAnswer: "$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$" };

const noop = () => {};
/** The Prose composer answering `open`, drawn once. */
const composer = (open: ProseComposerProps["open"], initialDraft?: QuestionFormDraft) => doc(renderToStaticMarkup(
	<StickToBottom>
		<ProseComposer
			open={open}
			answer={{ openKey: "k", selection: emptyDockSelection(), confidence: "neutral", mode: "answer", toggle: noop, setConfidence: noop, setMode: noop }}
			message={{ busy: false, value: "", revision: 0, onChange: noop, onSend: noop, onStop: noop, sendAllowed: true }}
			onAskInstead={noop}
			toggleRef={{ current: null }}
			busy={false}
			chatId="c1"
			initialDraft={initialDraft}
			onSaveDraft={noop}
			onSubmitAnswer={noop}
			onSubmitThinking={async () => true}
			onRequest={noop}
			onDraftChange={noop}
		/>
	</StickToBottom>,
));
const send = (d: Document) => d.querySelector('[data-slot="composer-send"]')!;

describe("photo answers in the composer and the transcript", () => {
	it("a check with only a photo waiting can be submitted, and shows the thumbnail and the attach button", () => {
		const draft: QuestionFormDraft = { selection: emptyDockSelection(), thinking: "", other: "", text: "", confidence: "neutral", photos: [{ id: "p1", photo }] };
		const withPhoto = composer({ kind: "question", key: "k", tool: "explain", toolCallId: "e1", input: explain }, draft);
		assert.equal(send(withPhoto).hasAttribute("disabled"), false, "a photo alone is an answer");
		assert.equal(withPhoto.querySelectorAll('[data-testid="pending-photo"]').length, 1);
		assert.ok(withPhoto.querySelector('[data-testid="photo-attach"]'));

		const empty = composer({ kind: "question", key: "k", tool: "explain", toolCallId: "e2", input: explain });
		assert.equal(send(empty).hasAttribute("disabled"), true, "nothing typed and no photo is no answer");
	});

	it("a multiple-choice question offers no photo", () => {
		const d = composer({ kind: "question", key: "k", tool: "ask_user_question", toolCallId: "a1", input: { question: "Pick one", options: [{ label: "A" }, { label: "B" }] } });
		assert.ok(send(d), "the composer is drawn");
		assert.ok(d.querySelector('[data-testid="photo-attach"]') === null);
	});

	it("his answer and his work show the sent photo, which opens large in a lesson", () => {
		const spec = proseQuestionSpec("explain", "e1", explain)!;
		const answered = doc(renderToStaticMarkup(
			<SessionMermaidContext.Provider value={{ openMermaid: () => {}, openFigure: () => {}, openPhoto: () => {} }}>
				<ProseQuestion tool="explain" toolCallId="e1" input={explain} output={buildAnswer(spec.data, { text: "" }, "explain")} photos={[photo]} open={false} />
			</SessionMermaidContext.Provider>,
		));
		assert.equal(answered.querySelector('[data-testid="sent-photos"] img')?.getAttribute("src"), `data:image/jpeg;base64,${photo.data}`);
		assert.ok(answered.querySelector('[data-testid="photo-open"]'), "a click opens it large");

		const practice = doc(renderToStaticMarkup(<ThinkingBubble data={{ problemCallId: "p", text: "", photos: [photo] }} />));
		assert.equal(practice.querySelectorAll('[data-testid="sent-photos"] img').length, 1);
		assert.equal(practice.querySelector('[data-testid="prose-thinking"]')?.textContent, "", "no empty words beside a photo-only submission");
	});

	it("the attach shortcut is on the cheat sheet and collides with no other binding", () => {
		const attach = KEYBOARD_ACTIONS.find((a) => a.id === "attach-photo")!;
		assert.ok(attach && !attach.displayOnly);
		const same = KEYBOARD_ACTIONS.filter((a) => a.binding === attach.binding);
		assert.deepEqual(same.map((a) => a.id), ["attach-photo"]);
	});
});
