/** The demo seed's courses with arcs (the logbook seed, `SEED_ARCS=1`), as course maps: each arc's topics in study
 *  order, what each topic needs, and each arc's entry (the earlier arcs' topics its own need). */
import type { ArcHandle, CourseMap, CourseMapArc, CourseMapEdge, CourseMapTopic, TopicHandle } from "../../src/core/index.ts";

const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };

function course(title: string, arcs: Record<string, string[]>, needs: Record<string, string[]>, current: string): CourseMap {
	const topics: CourseMapTopic[] = Object.entries(arcs).flatMap(([arc, ts]) =>
		ts.map((t) => ({ handle: t as TopicHandle, title: t, level: "new" as const, introduced: null, review: null, weak: false, signals: QUIET, tasks: [], arc: arc as ArcHandle })),
	);
	const edges: CourseMapEdge[] = Object.entries(needs).flatMap(([t, ps]) => ps.map((p) => ({ kind: "needs" as const, prerequisite: p as TopicHandle, topic: t as TopicHandle })));
	const arcOf = new Map(topics.map((t) => [t.handle, t.arc]));
	const list: CourseMapArc[] = Object.entries(arcs).map(([handle, ts]) => ({
		handle: handle as ArcHandle,
		title: handle,
		state: "learning",
		entry: [...new Set(edges.flatMap((e) => (e.kind === "needs" && ts.includes(e.topic) && arcOf.get(e.prerequisite) !== handle ? [e.prerequisite] : [])))],
	}));
	return { workspace: `/demo/${title}`, title, topics, edges, current: current as TopicHandle, arcs: list } as unknown as CourseMap;
}

export const DEMO_PROBABILITY = course(
	"Probability",
	{ "conditional-probability": ["conditional", "total-probability", "bayes", "independence"], "random-variables-binomial": ["random-variables", "binomial"], "expectation-named-distributions": ["poisson", "geometric", "expectation", "variance", "covariance"] },
	{ "total-probability": ["conditional"], bayes: ["conditional", "total-probability"], binomial: ["random-variables", "independence"], poisson: ["random-variables"], geometric: ["random-variables", "independence"], expectation: ["random-variables"], variance: ["expectation"], covariance: ["variance"] },
	"random-variables",
);

export const DEMO_LINEAR_ALGEBRA = course(
	"Linear Algebra",
	{ "vectors-span": ["vectors", "span"], "independence-bases": ["independence", "basis"], "linear-maps-matrices": ["linear-maps", "matmul"], "linear-systems": ["elimination", "rank", "kernel"], "determinants-invertibility": ["determinant", "cramer", "invertibility"], "eigenvalues-diagonalization": ["change-basis", "eigen", "diagonalization"], orthogonality: ["inner-product", "projection"] },
	{ span: ["vectors"], independence: ["span"], basis: ["independence"], "linear-maps": ["vectors", "basis"], matmul: ["linear-maps"], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank", "invertibility", "kernel"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] },
	"eigen",
);

export const DEMO_ARC_COURSES = [DEMO_PROBABILITY, DEMO_LINEAR_ALGEBRA];
