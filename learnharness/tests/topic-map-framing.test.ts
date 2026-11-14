/**
 * Where each demo course's map opens on Edo's 14" window (1512×982), on the
 * true-prerequisite seed's graphs (the logbook seed, 14 Nov 2026): on its
 * course page (through the pane's scroll, as he sees it), on Home and in the
 * enlarged map. Edo's ruling: a map opens on "You are here" with no card cut
 * at the frame's edge, at 80% or more. Where no view at that scale can,
 * "You are here" and the topics it leads to stay whole, with as few cut as
 * the graph allows.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { READABLE_ZOOM, TOPIC_NODE_SIZE, cardFit, framedCamera, layoutTopicMap, type CardFit } from "../components/course-map/topic-map/topic-map-layout.ts";
import { boxesOf, fadeAcross, scrollOfCamera, surfaceOf } from "../components/course-page/split/split-tie.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] });

/** Each course's topics in the engine's order, with what each needs. */
const COURSES = [
	{ title: "Calculus I", current: "area-between-curves", needs: { limits: [], "one-sided-limits": ["limits"], continuity: ["limits", "one-sided-limits"], "intermediate-value-theorem": ["continuity"], "the-derivative": ["limits"], "product-rule": ["the-derivative"], "quotient-rule": ["the-derivative"], "chain-rule": ["the-derivative"], "implicit-differentiation": ["chain-rule"], "related-rates": ["implicit-differentiation"], "mean-value-theorem": ["the-derivative", "continuity"], monotonicity: ["mean-value-theorem"], concavity: ["the-derivative"], "curve-sketching": ["monotonicity", "concavity"], optimisation: ["the-derivative", "monotonicity"], "lhopitals-rule": ["the-derivative", "limits"], antiderivatives: ["the-derivative"], "riemann-sums": ["limits"], "fundamental-theorem": ["antiderivatives", "riemann-sums", "continuity"], substitution: ["fundamental-theorem", "chain-rule"], "integration-by-parts": ["fundamental-theorem", "product-rule"], "partial-fractions": ["fundamental-theorem"], "improper-integrals": ["fundamental-theorem", "limits"], "area-between-curves": ["fundamental-theorem"] } },
	{ title: "Linear Algebra", current: "eigen", needs: { vectors: [], span: ["vectors"], independence: ["span"], basis: ["independence"], matmul: ["vectors"], elimination: [], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] } },
	{ title: "Probability", current: "random-variables", needs: { conditional: [], "total-probability": ["conditional"], bayes: ["conditional", "total-probability"], independence: [], "random-variables": [], binomial: ["random-variables", "independence"], poisson: ["random-variables"], geometric: ["random-variables", "independence"], expectation: ["random-variables"], variance: ["expectation"], covariance: ["variance"] } },
	{ title: "Real Analysis", current: "series", needs: { sequences: [], cauchy: ["sequences"], series: ["sequences"], continuity: ["sequences"], uniform: ["continuity"] } },
] as const satisfies readonly { title: string; current: string; needs: Record<string, readonly string[]> }[];

/** The frames at 1512×982 with the sidebar at its default width, measured in the running app. */
const TAG = 20;
const PAGE = { width: 720, height: 781 };
const PAGE_FADE = { x: 48, y: 32 };
const HOME = { width: 920, height: 437 };
const ENLARGED = { width: 1216, height: 890 };
const HOME_FADE = { x: 64, y: 40 };

/** Where no view at 80% or more cuts nothing: every view that keeps "You are here" and its tag clear of the fade
 *  cuts at least this many. Calculus's current topic sits mid-row in a layer of seven whose gaps line up with no
 *  other layer's, every layer in view; Linear Algebra's page is too narrow for Eigenvalues' layer of four. */
const LEAST_CUT: Record<string, number> = { "Calculus I on its course page": 2, "Linear Algebra on its course page": 2, "Calculus I in the enlarged map": 1 };

type Box = { left: number; top: number; right: number; bottom: number };
interface Opening {
	zoom: number;
	boxes: Map<TopicHandle, Box>;
	frame: { width: number; height: number };
	fade: { x: number; y: number };
}

function courseOf(course: (typeof COURSES)[number]) {
	const needs = course.needs as Record<string, readonly string[]>;
	const edges: CourseMapEdge[] = Object.entries(needs).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));
	const layout = layoutTopicMap(Object.keys(needs).map(topic), edges, TOPIC_NODE_SIZE);
	const next = edges.flatMap((e) => (e.kind === "needs" && e.prerequisite === course.current ? [e.topic] : []));
	return { layout, next };
}

/** The course page: the camera's view as the pane scrolls its surface to it. */
function onPage(course: (typeof COURSES)[number]): Opening {
	const { layout } = courseOf(course);
	const fade = { x: fadeAcross(PAGE.width, PAGE_FADE.x, layout.node), y: PAGE_FADE.y };
	const camera = framedCamera(layout, h(course.current), PAGE, fade, TAG, "top");
	const surface = surfaceOf(layout, PAGE, PAGE_FADE, TAG, camera.zoom);
	const scroll = scrollOfCamera(layout, surface, PAGE, camera);
	const boxes = new Map<TopicHandle, Box>();
	for (const [handle, b] of boxesOf(layout, surface)) boxes.set(handle, { left: b.x - scroll.left, top: b.y - scroll.top, right: b.x + b.width - scroll.left, bottom: b.y + b.height - scroll.top });
	return { zoom: camera.zoom, boxes, frame: PAGE, fade };
}

/** Home's map and the enlarged map: the camera React Flow is given. */
function inFrame(course: (typeof COURSES)[number], frame: { width: number; height: number }): Opening {
	const { layout } = courseOf(course);
	const camera = framedCamera(layout, h(course.current), frame, HOME_FADE, TAG);
	const boxes = new Map<TopicHandle, Box>();
	for (const [handle, at] of layout.topics) {
		const left = at.x * camera.zoom + camera.x;
		const top = at.y * camera.zoom + camera.y;
		boxes.set(handle, { left, top, right: left + layout.node.width * camera.zoom, bottom: top + layout.node.height * camera.zoom });
	}
	return { zoom: camera.zoom, boxes, frame, fade: HOME_FADE };
}

const SURFACES = [
	{ name: "on its course page", open: onPage },
	{ name: "on Home", open: (course: (typeof COURSES)[number]) => inFrame(course, HOME) },
	{ name: "in the enlarged map", open: (course: (typeof COURSES)[number]) => inFrame(course, ENLARGED) },
];

describe("where each demo course's map opens on Edo's window", () => {
	for (const course of COURSES) {
		for (const surface of SURFACES) {
			const label = `${course.title} ${surface.name}`;
			const least = LEAST_CUT[label] ?? 0;
			it(`${label}: on You are here at 80% or more, ${least ? `the topics it leads to whole, ${least} cut at most` : "no card cut"}`, () => {
				const { zoom, boxes, frame, fade } = surface.open(course);
				const fits = new Map<TopicHandle, CardFit>([...boxes].map(([handle, box]) => [handle, cardFit(box, frame, fade)]));
				const here = boxes.get(h(course.current))!;
				assert.ok(zoom >= READABLE_ZOOM && zoom <= 1, `zoom ${zoom}`);
				assert.equal(fits.get(h(course.current)), "clear", "You are here, clear of the fade");
				assert.ok(here.top - TAG >= fade.y - 1, "its tag, clear of the fade");
				const cut = [...fits].filter(([, fit]) => fit === "cut").map(([handle]) => handle);
				assert.ok(cut.length <= least, `cut: ${cut.join(", ")}`);
				if (least) for (const next of courseOf(course).next) assert.ok(["clear", "faded"].includes(fits.get(next)!), `${next}, where he goes next, whole: ${fits.get(next)}`);
			});
		}
	}

	it("opens Probability's course page uncut with Binomial, Geometric and Expectation whole (it opened with Binomial cut at 100%)", () => {
		const { zoom, boxes, frame, fade } = onPage(COURSES[2]);
		assert.ok(zoom < 1, `zoom ${zoom}`);
		for (const next of ["binomial", "geometric", "expectation"]) assert.ok(["clear", "faded"].includes(cardFit(boxes.get(h(next))!, frame, fade)), next);
	});
});
