import type { Phase3, SessionMode } from "@/src/core";
import { SectionBreak } from "@/components/lesson/section-break";

/**
 * The in-session phase presentation: the phase label the lesson's top bar
 * shows, and the quiet section break (lesson/section-break.md) the
 * transcript draws where the session moves into a new phase. The boundary
 * is a MESSAGE-level seam, so chat.tsx renders it at the message where the
 * phase changes, not inside a tool part. Probe never renders a divider:
 * phases only advance, so probe is the start of the transcript and
 * "Planning"/"Teaching" are the two visible seams.
 */

/** The phases as the learner thinks of them. */
export const CHIP_LABEL: Record<Phase3, string> = {
	probe: "Quiz",
	plan: "Planning",
	teach: "Teaching",
};

/** The transcript boundary at the message where the session enters
 *  `phase`. Null for probe (defensive — the fold never emits a probe
 *  transition after the start). */
export function PhaseDivider({ phase }: { phase: Phase3 }) {
	if (phase === "probe") return null;
	return <SectionBreak testId={`phase-divider-${phase}`} label={CHIP_LABEL[phase]} />;
}

/** The rule where a handoff moves the session between teaching and
 *  practice. */
export function ModeDivider({ mode }: { mode: SessionMode }) {
	return <SectionBreak testId={`mode-divider-${mode}`} label={mode === "practice" ? "Practice" : "Teaching"} />;
}
