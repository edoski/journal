/**
 * Where each demo course's map opens on Edo's 14" window (1512×982), on the
 * demo seed's graphs (the logbook seed, 14 Nov 2026): on its course page
 * (through the pane's scroll, as he sees it), on Home and in the enlarged
 * map. Edo's ruling (14 Nov 2026): "You are here" and the topics it leads to
 * are whole, at 80% or more; a card cut at the frame's edge elsewhere is
 * fine, and a map is never shrunk or moved just to avoid one. The view
 * never shows empty room past the drawing's room on an axis the course
 * overflows, so no frame ends on an empty band.
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
	{ title: "Linear Algebra", current: "eigen", needs: { vectors: [], span: ["vectors"], independence: ["span"], basis: ["independence"], matmul: ["vectors"], elimination: [], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank", "invertibility", "kernel"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] } },
	{ title: "Probability", current: "random-variables", needs: { conditional: [], "total-probability": ["conditional"], bayes: ["conditional", "total-probability"], independence: [], "random-variables": [], binomial: ["random-variables", "independence"], poisson: ["random-variables"], geometric: ["random-variables", "independence"], expectation: ["random-variables"], variance: ["expectation"], covariance: ["variance"] } },
	{ title: "Real Analysis", current: "series", needs: { sequences: [], cauchy: ["sequences"], series: ["sequences"], continuity: ["sequences"], uniform: ["continuity"] } },
] as const satisfies readonly { title: string; current: string; needs: Record<string, readonly string[]> }[];

/** The frames at 1512×982 with the sidebar at its default width, measured in the running app. */
const TAG = 20;
const PAGE = { width: 696, height: 737 };
const PAGE_FADE = { x: 48, y: 32 };
const HOME = { width: 896, height: 413 };
const ENLARGED = { width: 1192, height: 866 };
const HOME_FADE = { x: 64, y: 40 };

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

/** The most of "You are here"'s next topics that can be whole with it at the readable floor: the largest run of
 *  them, left to right, whose box with it fits the frame. A geometric bound, not the camera's own search. */
function mostNextWhole(course: (typeof COURSES)[number], frame: { width: number; height: number }): number {
	const { layout, next } = courseOf(course);
	const here = layout.topics.get(h(course.current))!;
	const placed = next.map((t) => layout.topics.get(t)!).sort((a, b) => a.x - b.x);
	const fits = (run: typeof placed) => {
		const all = [here, ...run];
		const width = (Math.max(...all.map((p) => p.x)) + layout.node.width - Math.min(...all.map((p) => p.x))) * READABLE_ZOOM;
		const height = (Math.max(...all.map((p) => p.y)) + layout.node.height - Math.min(...all.map((p) => p.y))) * READABLE_ZOOM + TAG;
		return width <= frame.width && height <= frame.height;
	};
	for (let size = placed.length; size > 0; size--) for (let i = 0; i + size <= placed.length; i++) if (fits(placed.slice(i, i + size))) return size;
	return 0;
}

/** The box the whole drawing takes in the frame. */
function drawingOf(boxes: Map<TopicHandle, Box>): Box {
	const all = [...boxes.values()];
	return { left: Math.min(...all.map((b) => b.left)), top: Math.min(...all.map((b) => b.top)), right: Math.max(...all.map((b) => b.right)), bottom: Math.max(...all.map((b) => b.bottom)) };
}

describe("where each demo course's map opens on Edo's window", () => {
	for (const course of COURSES) {
		for (const surface of SURFACES) {
			const label = `${course.title} ${surface.name}`;
			it(`${label}: on You are here at 80% or more, with every topic it leads to whole that fits beside it`, () => {
				const { zoom, boxes, frame, fade } = surface.open(course);
				const fits = new Map<TopicHandle, CardFit>([...boxes].map(([handle, box]) => [handle, cardFit(box, frame, fade)]));
				const here = boxes.get(h(course.current))!;
				assert.ok(zoom >= READABLE_ZOOM && zoom <= 1, `zoom ${zoom}`);
				assert.equal(fits.get(h(course.current)), "clear", "You are here, clear of the fade");
				assert.ok(here.top - TAG >= fade.y - 1, "its tag, clear of the fade");
				const next = courseOf(course).next;
				const whole = next.filter((t) => ["clear", "faded"].includes(fits.get(t)!));
				assert.equal(whole.length, mostNextWhole(course, frame), `where he goes next, whole: ${whole.join(", ")} of ${next.join(", ")}`);
			});
			it(`${label}: no empty band past the drawing on an axis it overflows`, () => {
				const { boxes, frame } = surface.open(course);
				const drawn = drawingOf(boxes);
				const room = surface.name === "on its course page" ? { x: PAGE_FADE.x, y: PAGE_FADE.y + TAG } : { x: HOME_FADE.x, y: HOME_FADE.y + TAG };
				if (drawn.right - drawn.left + room.x * 2 > frame.width) {
					assert.ok(drawn.left <= room.x + 1 && drawn.right >= frame.width - room.x - 1, `across: drawing ${drawn.left}..${drawn.right} in ${frame.width}`);
				}
				if (drawn.bottom - drawn.top + room.y * 2 > frame.height) {
					assert.ok(drawn.top <= room.y + 1 && drawn.bottom >= frame.height - room.y - 1, `down: drawing ${drawn.top}..${drawn.bottom} in ${frame.height}`);
				}
			});
		}
	}

	it("opens Probability on Home and in the enlarged map with Poisson beside Binomial, Geometric and Expectation (round 5: Poisson sat off the map)", () => {
		for (const frame of [HOME, ENLARGED]) {
			const { boxes, fade } = inFrame(COURSES[2], frame);
			for (const next of ["binomial", "poisson", "geometric", "expectation"]) assert.ok(["clear", "faded"].includes(cardFit(boxes.get(h(next))!, frame, fade)), `${next} in ${frame.width}px`);
		}
	});

	it("keeps three of Random variables' four next topics whole on Probability's course page, where all four in a row are wider than the pane at 80%", () => {
		assert.equal(mostNextWhole(COURSES[2], PAGE), 3);
	});

	it("opens Linear Algebra on Home with no empty band under Diagonalization (round 5: 144px of nothing above Today)", () => {
		const { boxes, frame } = inFrame(COURSES[1], HOME);
		const bottom = Math.max(...[...boxes.values()].filter((b) => b.top < frame.height).map((b) => b.bottom));
		assert.ok(bottom >= frame.height - HOME_FADE.y - TAG - 1, `lowest card ends at ${bottom} in ${frame.height}`);
	});
});
