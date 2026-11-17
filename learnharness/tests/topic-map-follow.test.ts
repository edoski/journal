/**
 * Home's map following the Today row he points at (home-map.md, topic-map.md
 * `framed`): where the camera goes to bring the row's topics into view on
 * Linear Algebra's map in Edo's 1512×982 window, and when it moves, rests and
 * returns.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { CourseMapEdge, CourseMapTopic, TopicHandle } from "../src/core/contracts/course-map.ts";
import { READABLE_ZOOM, cardFit, framedCamera, layoutTopicMap, slackOf, wholeZoom, type Camera, type CardFit } from "../components/course-map/topic-map/topic-map-layout.ts";
import { RETURN_DWELL_MS, REVEAL_DWELL_MS, litCamera, litFollow, scrollOn, type Box } from "../components/course-map/topic-map/lit-camera.ts";

const h = (handle: string) => handle as TopicHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const topic = (handle: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [] });

/** Linear Algebra on the demo seed, as topic-map-framing.test.ts has it. */
const NEEDS: Record<string, readonly string[]> = { vectors: [], span: ["vectors"], independence: ["span"], basis: ["independence"], matmul: ["vectors"], elimination: [], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank", "invertibility", "kernel"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] };
const EDGES: CourseMapEdge[] = Object.entries(NEEDS).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));
/** A fixed card for the camera's arithmetic, apart from the map's own (canvas-layout.ts), so each case's premise
 *  (a topic that opens cut, one out of view) holds whatever the map's card becomes. */
const CARD = { width: 248, height: 56 };
const LAYOUT = layoutTopicMap(Object.keys(NEEDS).map(topic), EDGES, CARD);
const HERE = h("eigen");

/** Home's map frame at 1512×982, measured in the running app, its fade and the tag's room. */
const FRAME = { width: 896, height: 413 };
const FADE = { x: 64, y: 40 };
const TAG = 20;
/** What the map gives the camera: its smallest scale and its reach past the drawing (topic-map.tsx). */
const ROOM = { x: FADE.x, y: FADE.y + TAG };
const MIN_ZOOM = Math.min(1, wholeZoom(LAYOUT, FRAME, ROOM));
const REACH = { x: ROOM.x / Math.min(READABLE_ZOOM, MIN_ZOOM) + slackOf(LAYOUT.node).x, y: ROOM.y / Math.min(READABLE_ZOOM, MIN_ZOOM) + slackOf(LAYOUT.node).y };
const OPENING = framedCamera(LAYOUT, HERE, FRAME, FADE, TAG);

function fitOf(handle: string, camera: Camera): CardFit {
	const at = LAYOUT.topics.get(h(handle))!;
	const left = at.x * camera.zoom + camera.x;
	const top = at.y * camera.zoom + camera.y;
	return cardFit({ left, top, right: left + LAYOUT.node.width * camera.zoom, bottom: top + LAYOUT.node.height * camera.zoom }, FRAME, FADE);
}
const follow = (lit: string[], from = OPENING) => litCamera(LAYOUT, from, lit.map(h), FRAME, FADE, REACH, MIN_ZOOM, HERE, TAG);

describe("where the map's camera goes for the row he points at", () => {
	it("brings a lit topic that opens cut at the frame's edge into view, clear of the fade, with You are here and its tag still clear", () => {
		assert.equal(fitOf("projection", OPENING), "cut", "Orthogonal projection opens cut");
		const to = follow(["projection"])!;
		assert.ok(to, "the camera moves");
		assert.equal(to.zoom, OPENING.zoom, "at the scale it opened at");
		assert.equal(fitOf("projection", to), "clear");
		assert.equal(fitOf("eigen", to), "clear", "You are here");
		const here = LAYOUT.topics.get(HERE)!;
		assert.ok(here.y * to.zoom + to.y - TAG >= FADE.y - 1, "its tag");
	});

	it("frames every topic a row lights at once, a problem sheet's three", () => {
		assert.equal(fitOf("basis", OPENING), "out", "Basis opens out of view");
		const to = follow(["basis", "rank", "kernel"])!;
		for (const t of ["basis", "rank", "kernel"]) assert.equal(fitOf(t, to), "clear", t);
	});

	it("moves nothing when the row's topics are already clear of the fade", () => {
		assert.equal(fitOf("eigen", OPENING), "clear");
		assert.equal(follow(["eigen"]), null);
	});

	it("zooms out only as far as topics too far apart for the camera's scale need, never past the whole course", () => {
		const to = follow(["vectors", "diagonalization"])!;
		assert.ok(to.zoom < OPENING.zoom && to.zoom >= MIN_ZOOM, `zoom ${to.zoom}`);
		for (const t of ["vectors", "diagonalization"]) assert.equal(fitOf(t, to), "clear", t);
	});

	it("moves nothing for topics this drawing does not hold", () => {
		assert.equal(follow(["not-on-this-map"]), null);
	});
});

describe("when the map's camera moves", () => {
	const HOME: Camera = { x: 0, y: 0, zoom: 1 };
	let moves: string[];
	const follower = (plan: (lit: readonly TopicHandle[]) => Camera | null = (lit) => ({ x: lit.length, y: 0, zoom: 1 })) =>
		litFollow({
			plan: (lit) => plan(lit),
			home: () => HOME,
			move: (camera) => moves.push(camera === HOME ? "home" : `to ${camera.x}`),
		});
	beforeEach(() => {
		moves = [];
		mock.timers.enable({ apis: ["setTimeout"] });
	});
	afterEach(() => mock.timers.reset());

	it("glides once he rests on a row, and only to the last row of a quick sweep: no jitter", () => {
		const f = follower();
		f.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS - 20);
		f.point([h("a"), h("b")]);
		mock.timers.tick(REVEAL_DWELL_MS - 20);
		f.point([h("a"), h("b"), h("c")]);
		assert.deepEqual(moves, [], "nothing moves while he sweeps");
		mock.timers.tick(REVEAL_DWELL_MS);
		assert.deepEqual(moves, ["to 3"]);
	});

	it("returns to the opening view once he points at nothing, but not while the pointer crosses from one row to the next", () => {
		const f = follower();
		f.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS - 100);
		f.point([h("a"), h("b")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		assert.deepEqual(moves, ["to 1", "to 2"], "no trip home between rows");
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		assert.deepEqual(moves, ["to 1", "to 2", "home"]);
	});

	it("asks to go home after a row whose topics were already in view, so a view he dragged to returns once he points again", () => {
		const f = follower(() => null);
		f.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		assert.deepEqual(moves, ["home"]);
	});

	it("moves nothing on leaving when it was never pointed, or is already home", () => {
		const f = follower();
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		const g = litFollow({ plan: () => null, home: () => null, move: () => moves.push("moved") });
		g.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		g.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		assert.deepEqual(moves, []);
	});

	it("stays where he drags or scrolls it until the next row", () => {
		const f = follower();
		f.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		f.stay();
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		assert.deepEqual(moves, ["to 1"], "no return after his own move");
		f.point([h("a"), h("b")]);
		mock.timers.tick(REVEAL_DWELL_MS);
		assert.deepEqual(moves, ["to 1", "to 2"]);
		f.point(null);
		mock.timers.tick(RETURN_DWELL_MS);
		assert.deepEqual(moves, ["to 1", "to 2", "home"], "and home once he leaves that row");
	});

	it("drops a move he cut short by moving the map himself during the rest", () => {
		const f = follower();
		f.point([h("a")]);
		mock.timers.tick(REVEAL_DWELL_MS / 2);
		f.stay();
		mock.timers.tick(REVEAL_DWELL_MS);
		assert.deepEqual(moves, []);
	});
});

describe("where a view scrolls to show one topic", () => {
	// Three topics side by side, 224 wide, 24 apart, on a surface with room to scroll past them.
	const row = (xs: number[], y = 100): Map<TopicHandle, Box> => new Map(xs.map((x, i) => [h(`t${i}`), { x, y, width: 224, height: 64 }]));
	const surface = { width: 1400, height: 400 };
	const fade = { x: 48, y: 32 };

	it("leaves a topic already clear of the fade where it is", () => {
		assert.equal(scrollOn(row([300, 548, 796]), h("t1"), { left: 200, top: 0, width: 696, height: 400 }, surface, fade), null);
	});

	it("brings a topic into view cutting none at the view's edges when it can, moving as little as it can", () => {
		const boxes = row([300, 548, 796]);
		const to = scrollOn(boxes, h("t2"), { left: 0, top: 0, width: 600, height: 400 }, surface, fade)!;
		const view = { left: to.left, right: to.left + 600 };
		assert.ok(796 >= view.left + 48 && 1020 <= view.right - 48, "the target clear of the fade");
		for (const b of boxes.values()) {
			const showsPastFade = b.x + b.width > view.left + 48 && b.x < view.right - 48;
			const whole = b.x >= view.left && b.x + b.width <= view.right;
			assert.ok(!showsPastFade || whole, `topic at ${b.x} is not cut`);
		}
	});
});
