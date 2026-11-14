/** The Proposed lesson's one reading column: the transcript and the dock
 *  share it. 760px with 20px gutters leaves a 720px measure (about 70
 *  characters of 16px SF Pro); narrower windows shrink it, gutters kept.
 *  Sources: T3 Code's 46rem chat column and 20px gutter (research/agent-apps.md). */
export const LESSON_COLUMN = "mx-auto w-full max-w-[47.5rem] px-5";

/** The reading candidates' column (lesson-variant.ts): a measure of
 *  45 to 75 characters of 16px SF Pro at Edo's 1512×982 window, where
 *  the 720px measure ran 95 (research-ui.md). The transcript, its figures
 *  and the composer share it. */
export const READING_COLUMN = "mx-auto w-full max-w-[35rem] px-5 [&_.katex-display]:[scrollbar-width:none]";
