/** The lesson's one reading column: the transcript, its figures and the
 *  composer share it, as does the course link banner that stands in for
 *  the composer. T3 Code's chat width, its `--chat-content-max-width` of
 *  46rem (736px, apps/web/src/index.css in github.com/pingdotgg/t3code),
 *  inside 20px gutters; narrower windows shrink it, gutters kept. Edo's
 *  ruling of 14 Nov 2026 over the 560px reading measure: the narrow column
 *  read "disgustingly tight". A wide display formula scrolls with no bar. */
export const LESSON_COLUMN = "mx-auto w-full max-w-[48.5rem] px-5 [&_.katex-display]:[scrollbar-width:none]";
