/**
 * Bands' places and lines (bands.md; Edo, 16 Nov 2026), on the demo
 * courses' own graphs: "There should be a single outflow of edges from that
 * node… They should all be flowing downwards and then only branch out at the
 * bottom", and "one long vertical sequence… the binomial distribution…
 * vertically aligned with the three nodes in arc one on the left column".
 * Before this pass Random variables and distributions sat 676 to the right
 * of that column and Binomial 256, and its lines left in three strands
 * through the Binomial's row; Calculus had two prerequisites leaving in 3
 * and 4.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArcHandle, CourseMapArc, CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/index.ts";
import { layoutBands, ruleStretches, RULE_CLEAR } from "../components/course-map/topic-map/bands/bands-layout.ts";
import { CANVAS_NODE } from "../components/course-map/topic-map/canvas/canvas-layout.ts";

const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
type P = readonly [number, number];

/** A demo course: its arcs in study order with their topics, and what each topic needs (the logbook seed). */
function course(arcs: Record<string, string[]>, needs: Record<string, string[]>) {
	const topics: CourseMapTopic[] = Object.entries(arcs).flatMap(([arc, ts]) =>
		ts.map((t) => ({ handle: t as TopicHandle, title: t, level: "new" as const, introduced: null, review: null, weak: false, signals: QUIET, tasks: [], arc: arc as ArcHandle })),
	);
	const edges: CourseMapEdge[] = Object.entries(needs).flatMap(([t, ps]) => ps.map((p) => ({ kind: "needs" as const, prerequisite: p as TopicHandle, topic: t as TopicHandle })));
	const list: CourseMapArc[] = Object.keys(arcs).map((handle) => ({ handle: handle as ArcHandle, title: handle, state: "learning", entry: [] }));
	const laid = layoutBands(topics, edges, { arcs: list, open: new Set(list.map((a) => a.handle)), current: null });
	assert.ok(laid, "the course draws in bands");
	return laid;
}

const PROBABILITY = course(
	{ "conditional-probability": ["conditional", "total-probability", "bayes", "independence"], "random-variables-binomial": ["random-variables", "binomial"], "expectation-named-distributions": ["poisson", "geometric", "expectation", "variance", "covariance"] },
	{ "total-probability": ["conditional"], bayes: ["conditional", "total-probability"], binomial: ["random-variables", "independence"], poisson: ["random-variables"], geometric: ["random-variables", "independence"], expectation: ["random-variables"], variance: ["expectation"], covariance: ["variance"] },
);
const CALCULUS = course(
	{
		"limits-continuity": ["limits", "one-sided-limits", "continuity", "intermediate-value-theorem"],
		derivatives: ["the-derivative", "basic-rules", "product-rule", "quotient-rule", "chain-rule", "implicit-differentiation"],
		"applications-of-derivatives": ["related-rates", "mean-value-theorem", "monotonicity", "concavity", "curve-sketching", "optimisation", "lhopitals-rule"],
		integration: ["antiderivatives", "riemann-sums", "fundamental-theorem", "area-between-curves"],
		"techniques-of-integration": ["substitution", "integration-by-parts", "partial-fractions", "improper-integrals"],
	},
	{
		"one-sided-limits": ["limits"], continuity: ["limits", "one-sided-limits"], "intermediate-value-theorem": ["continuity"], "the-derivative": ["limits"], "basic-rules": ["the-derivative"], "product-rule": ["basic-rules"], "quotient-rule": ["basic-rules"], "chain-rule": ["the-derivative"], "implicit-differentiation": ["chain-rule"], "related-rates": ["implicit-differentiation"],
		"mean-value-theorem": ["the-derivative", "continuity"], monotonicity: ["mean-value-theorem"], concavity: ["the-derivative"], "curve-sketching": ["monotonicity", "concavity"], optimisation: ["the-derivative", "monotonicity"], "lhopitals-rule": ["the-derivative", "limits"], antiderivatives: ["the-derivative"], "riemann-sums": ["limits"],
		"fundamental-theorem": ["antiderivatives", "riemann-sums", "continuity"], "area-between-curves": ["fundamental-theorem"], substitution: ["fundamental-theorem", "chain-rule"], "integration-by-parts": ["fundamental-theorem", "product-rule"], "partial-fractions": ["fundamental-theorem"], "improper-integrals": ["fundamental-theorem", "limits"],
	},
);
const LINEAR_ALGEBRA = course(
	{ "vectors-span": ["vectors", "span"], "independence-bases": ["independence", "basis"], "linear-maps-matrices": ["linear-maps", "matmul"], "linear-systems": ["elimination", "rank", "kernel"], "determinants-invertibility": ["determinant", "cramer", "invertibility"], "eigenvalues-diagonalization": ["change-basis", "eigen", "diagonalization"], orthogonality: ["inner-product", "projection"] },
	{ span: ["vectors"], independence: ["span"], basis: ["independence"], "linear-maps": ["vectors", "basis"], matmul: ["linear-maps"], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank", "invertibility", "kernel"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] },
);
const COURSES = { Probability: PROBABILITY, Calculus: CALCULUS, "Linear Algebra": LINEAR_ALGEBRA };

const drawnLines = (laid: NonNullable<ReturnType<typeof layoutBands>>) => laid.layout.routes.filter((r) => r.points.length > 1);
const segmentsOf = (points: readonly P[]) => points.slice(1).map((b, i) => [points[i]!, b] as const);

describe("Bands' places", () => {
	it("runs Probability's chain down one column through its chapters, Random variables and the Binomial included", () => {
		const centre = (t: string) => PROBABILITY.layout.topics.get(t as TopicHandle)!.x + CANVAS_NODE.width / 2;
		const column = centre("conditional");
		for (const t of ["total-probability", "bayes", "random-variables", "binomial"]) assert.equal(centre(t), column, `${t} under Conditional probability`);
		assert.ok(centre("conditional") < centre("independence"), "the chain is the left column");
	});

	it("puts a topic under the card it follows wherever that column is free", () => {
		const centre = (t: string) => CALCULUS.layout.topics.get(t as TopicHandle)!.x;
		for (const [above, below] of [["limits", "one-sided-limits"], ["one-sided-limits", "continuity"], ["the-derivative", "chain-rule"], ["mean-value-theorem", "monotonicity"], ["antiderivatives", "fundamental-theorem"]]) assert.equal(centre(below!), centre(above!), `${below} under ${above}`);
	});
});

describe("Bands' lines", () => {
	for (const [name, laid] of Object.entries(COURSES)) {
		it(`${name}: every prerequisite's lines leave its card as one trunk, parting only just above its topics' rows`, () => {
			const rows = [...new Set([...laid.layout.topics.values()].map((t) => t.y))].map((y) => y + CANVAS_NODE.height / 2);
			const byParent = Map.groupBy(drawnLines(laid), (r) => r.prerequisite);
			let trunks = 0;
			for (const [parent, lines] of byParent) {
				if (lines.length < 2) continue;
				trunks++;
				const first = lines.map((l) => `${l.points[0]!.join(",")}>${l.points[1]![0]}`);
				assert.equal(new Set(first).size, 1, `${parent}: one segment leaves the card`);
				const top = lines[0]!.points[0]![1];
				const bottom = Math.max(...lines.map((l) => l.points.at(-1)![1]));
				for (const y of rows.filter((y) => y > top && y < bottom)) {
					const strands = new Set(lines.flatMap((l) => segmentsOf(l.points).flatMap(([a, b]) => (a[0] === b[0] && Math.min(a[1], b[1]) < y && Math.max(a[1], b[1]) > y ? [a[0]] : []))));
					assert.ok(strands.size <= 1, `${parent}: ${strands.size} strands pass the row at ${y}`);
				}
			}
			assert.ok(trunks > 0);
		});

		it(`${name}: no line of one prerequisite crosses another's, and none passes through a card`, () => {
			const lines = drawnLines(laid);
			const segs = lines.flatMap((l) => segmentsOf(l.points).map(([a, b]) => ({ p: l.prerequisite, a, b })));
			for (const s of segs)
				for (const t of segs) {
					if (s.p === t.p || (s.a[0] === s.b[0]) === (t.a[0] === t.b[0])) continue;
					const [v, h] = s.a[0] === s.b[0] ? [s, t] : [t, s];
					const x = v.a[0], y = h.a[1];
					const crosses = x > Math.min(h.a[0], h.b[0]) + 0.5 && x < Math.max(h.a[0], h.b[0]) - 0.5 && y > Math.min(v.a[1], v.b[1]) + 0.5 && y < Math.max(v.a[1], v.b[1]) - 0.5;
					assert.ok(!crosses, `${s.p} and ${t.p} cross at ${x},${y}`);
				}
			for (const { a, b } of segs)
				for (const box of laid.layout.topics.values()) {
					const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
					const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
					const through = x1 > box.x + 0.5 && x0 < box.x + CANVAS_NODE.width - 0.5 && y1 > box.y + 0.5 && y0 < box.y + CANVAS_NODE.height - 0.5;
					assert.ok(!through, `a line passes through ${box.handle}`);
				}
		});

		it(`${name}: no chapter's rule touches a line`, () => {
			const segs = drawnLines(laid).flatMap((l) => segmentsOf(l.points));
			for (const band of laid.bands.filter((b) => b.number > 1)) {
				const rule = ruleStretches(0, laid.layout.width, band.crossings);
				for (const [a, b] of segs) {
					if (a[1] === b[1]) assert.ok(Math.abs(a[1] - band.top) >= 16, `a lane runs ${Math.abs(a[1] - band.top)} from chapter ${band.number}'s rule`);
					else if (Math.min(a[1], b[1]) < band.top && Math.max(a[1], b[1]) > band.top)
						assert.ok(rule.every(([from, to]) => a[0] <= from - RULE_CLEAR + 0.5 || a[0] >= to + RULE_CLEAR - 0.5), `chapter ${band.number}'s rule meets the line at ${a[0]}`);
				}
			}
		});
	}
});
