/** Earlier rows holding formulas, for a real browser: round 18's m21 row
 *  (a short formula at a line's end) and round 14's m37 row (a formula
 *  wider than the row), each in a column whose width the test sets.
 *  Bundled by tests/helpers/browser-shell.ts. */
import { createRoot } from "react-dom/client";
import { AttemptEntry } from "@/components/unit-inbox/topic-page/hybrid/history";
import type { TopicAttempt } from "@/src/core";

const attempt = (id: string, text: string) =>
	({ id, date: "2026-11-08", recorded: null, result: "partial", unaided: true, grade: "missed", gaveUp: false, predicted: false, uncertain: false, sure: "confident", chose: null, text }) as unknown as TopicAttempt;
const ROWS = [
	attempt("o95", "Added $\\frac{2}{10} + \\frac{4}{10}$ to get $\\frac{7}{10}$ instead of $\\frac{3}{5}$; normalised $m(k) = ck$ correctly to $c = \\frac{1}{10}$"),
	attempt("o5", "Found $P(X\\geq 2)=1-P(X=0)-P(X=1)\\approx 0.756$ by the complement"),
];

createRoot(document.getElementById("root")!).render(
	<div data-testid="sidebar">
		<div data-place="earlier" style={{ width: "24rem" }}>
			<ul>
				{ROWS.map((row) => (
					<AttemptEntry key={row.id} attempt={row} titleOf={(h) => h} ends={{ above: false, below: false }} date="Today" />
				))}
			</ul>
		</div>
	</div>,
);
