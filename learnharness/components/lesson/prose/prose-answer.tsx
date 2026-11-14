"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CONFIDENCE, emptyDockSelection, toggleOption, type Confidence, type DockSelection, type QuestionFormDraft } from "@/src/core";
import { carriedForm, keptWords } from "@/components/lesson/kept-drafts";

/** What the open question or problem holds besides his words (spec:
 *  prose.md): the options he picked in the tutor's message, his confidence,
 *  and whether the composer answers or asks. His words live in the composer
 *  itself, so typing never draws the transcript again. */
export interface ProseAnswer {
	/** The open question's key, or the problem's call id; null with nothing open. */
	openKey: string | null;
	selection: DockSelection;
	confidence: Confidence;
	/** `answer`: Send answers. `ask`: Send is a message to the tutor. */
	mode: "answer" | "ask";
	toggle: (index: number, multi: boolean) => void;
	setConfidence: (confidence: Confidence) => void;
	setMode: (mode: "answer" | "ask") => void;
}

interface State {
	key: string | null;
	selection: DockSelection;
	confidence: Confidence;
	mode: "answer" | "ask";
}

const fresh = (key: string | null): State => ({ key, selection: emptyDockSelection(), confidence: DEFAULT_CONFIDENCE, mode: "answer" });

/** The open item's picks, confidence and mode, fresh for each question or
 *  problem. A question starts from this call's unconfirmed submission, else
 *  what he chose before a reload, else the confidence the carry brought.
 *  Ask is one message: once the tutor's reply settles, the composer answers
 *  again (round 5: Ask stayed on over an open problem and his answer went
 *  as a question), unless he is already typing his next question. */
export function useProseAnswer({ openKey, box, carry, draft, replying = false, askDraft }: {
	openKey: string | null;
	/** The open box's scope in kept-drafts.ts. */
	box: string | null;
	carry?: string;
	/** This call's unconfirmed submission, back after a refused send. */
	draft?: QuestionFormDraft;
	/** The tutor is writing a reply. */
	replying?: boolean;
	/** What he has typed in Ask, read when a reply settles. */
	askDraft?: () => string;
}): ProseAnswer {
	const [state, setState] = useState<State>(() => fresh(openKey));
	if (state.key !== openKey) setState(fresh(openKey));
	const wasReplying = useRef(replying);
	useEffect(() => {
		const settled = wasReplying.current && !replying;
		wasReplying.current = replying;
		if (settled && !askDraft?.().trim()) setState((s) => (s.mode === "ask" ? { ...s, mode: "answer" } : s));
		// Only the reply's settling decides; the draft is read then.
	}, [replying]);
	// Kept choices join after mount, so the server's page and the first
	// client render agree.
	useEffect(() => {
		if (!openKey) return;
		const kept = draft ?? (box ? keptWords(box)?.form : undefined);
		const carried = !kept && carry ? keptWords(carry) : undefined;
		const restored = kept
			? { selection: "selection" in kept ? kept.selection : { selected: new Set(kept.selected), otherSelected: kept.otherSelected }, confidence: kept.confidence }
			: carried
				? { selection: emptyDockSelection(), confidence: carriedForm(carried, true)?.confidence ?? DEFAULT_CONFIDENCE }
				: null;
		if (restored) setState((s) => (s.key === openKey ? { ...s, ...restored } : s));
		// Once per open item.
	}, [openKey]);
	const toggle = useCallback((index: number, multi: boolean) => {
		setState((s) => ({ ...s, selection: toggleOption(multi ? "multi-select" : "single-select", s.selection, index) }));
	}, []);
	const setConfidence = useCallback((confidence: Confidence) => setState((s) => ({ ...s, confidence })), []);
	const setMode = useCallback((mode: "answer" | "ask") => setState((s) => ({ ...s, mode })), []);
	return useMemo(
		() => ({ openKey: state.key, selection: state.selection, confidence: state.confidence, mode: state.mode, toggle, setConfidence, setMode }),
		[state, toggle, setConfidence, setMode],
	);
}

const ProseAnswerContext = createContext<ProseAnswer | null>(null);
export const ProseAnswerProvider = ProseAnswerContext.Provider;

/** The open item's state, for the option rows in the tutor's message. */
export function useProseAnswerContext(): ProseAnswer | null {
	return useContext(ProseAnswerContext);
}
