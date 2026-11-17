/**
 * Road in rows' map follows the road as Home's map follows Today
 * (roadrows.md, home-map.md): hovering a topic row under an open arc lights
 * that topic, rings its card and brings its node into view through Home's
 * camera (lit-camera.ts), in the arc it lies in; hovering an arc's stop
 * shows that arc with its topics lit. Same camera assertion as Home's
 * follow test (topic-map-follow.test.ts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArcHandle, CourseMapEdge, CourseMapTopic, StudyCourse, TopicHandle } from "../src/core/index.ts";
import { READABLE_ZOOM, cardFit, framedCamera, layoutTopicMap, slackOf, wholeZoom, type Camera, type CardFit } from "../components/course-map/topic-map/topic-map-layout.ts";
import { litCamera } from "../components/course-map/topic-map/lit-camera.ts";
import { followArc, followTopic } from "../components/course-page/candidates/roadrows/road-follow.ts";
import type { CourseArcSection } from "../components/course-page/course-model.ts";

const h = (handle: string) => handle as TopicHandle;
const a = (handle: string) => handle as ArcHandle;
const QUIET = { gap: null, lapsed: false, stale: false, choiceErrors: {}, confidentErrors: 0, repaired: false };
const ARC: Record<string, string> = { vectors: "spaces", span: "spaces", independence: "spaces", basis: "spaces", matmul: "maps", elimination: "maps", rank: "maps", kernel: "maps", determinant: "eigen", cramer: "eigen", invertibility: "eigen", "change-basis": "eigen", eigen: "eigen", diagonalization: "eigen", "inner-product": "orth", projection: "orth" };
const topic = (handle: string): CourseMapTopic => ({ handle: h(handle), title: handle, level: "new", introduced: null, review: null, weak: false, signals: QUIET, tasks: [], arc: a(ARC[handle]!) });

/** Linear Algebra on the demo seed, as Home's follow test has it. */
const NEEDS: Record<string, readonly string[]> = { vectors: [], span: ["vectors"], independence: ["span"], basis: ["independence"], matmul: ["vectors"], elimination: [], rank: ["basis", "elimination"], kernel: ["rank"], determinant: ["matmul"], cramer: ["determinant"], invertibility: ["rank", "determinant"], "change-basis": ["basis", "matmul", "invertibility"], eigen: ["determinant", "rank", "invertibility", "kernel"], diagonalization: ["eigen", "basis", "change-basis"], "inner-product": ["vectors"], projection: ["inner-product", "basis"] };
const EDGES: CourseMapEdge[] = Object.entries(NEEDS).flatMap(([t, prereqs]) => prereqs.map((p) => ({ kind: "needs" as const, prerequisite: h(p), topic: h(t) })));
const TOPICS = Object.keys(NEEDS).map(topic);
const course = { map: { topics: TOPICS, edges: EDGES } } as unknown as StudyCourse;
const CARD = { width: 248, height: 56 };
const LAYOUT = layoutTopicMap(TOPICS, EDGES, CARD);
const HERE = h("eigen");
/** Road in rows' map frame at 1512×982, measured in the running app (Linear Algebra), with Home's fade. */
const FRAME = { width: 896, height: 516 };
const FADE = { x: 64, y: 40 };
const TAG = 20;
const ROOM = { x: FADE.x, y: FADE.y + TAG };
const MIN_ZOOM = Math.min(1, wholeZoom(LAYOUT, FRAME, ROOM));
const REACH = { x: ROOM.x / Math.min(READABLE_ZOOM, MIN_ZOOM) + slackOf(LAYOUT.node).x, y: ROOM.y / Math.min(READABLE_ZOOM, MIN_ZOOM) + slackOf(LAYOUT.node).y };
const OPENING = framedCamera(LAYOUT, HERE, FRAME, FADE, TAG, "bottom");

function fitOf(handle: string, camera: Camera): CardFit {
	const at = LAYOUT.topics.get(h(handle))!;
	const left = at.x * camera.zoom + camera.x;
	const top = at.y * camera.zoom + camera.y;
	return cardFit({ left, top, right: left + LAYOUT.node.width * camera.zoom, bottom: top + LAYOUT.node.height * camera.zoom }, FRAME, FADE);
}

describe("the map following the road", () => {
	it("brings a hovered topic row's node into view, lit and ringed, through Home's camera", () => {
		const follow = followTopic(course, h("projection"));
		assert.deepEqual([...follow.lit], ["projection"]);
		assert.equal(follow.framed, true, "the camera brings it into view");
		assert.equal(follow.marked, "projection", "its card ringed");
		assert.equal(follow.arc, "orth", "in the arc it lies in (Home's litArc)");
		assert.notEqual(fitOf("projection", OPENING), "clear", "Orthogonal projection opens cut or out of view");
		const to = litCamera(LAYOUT, OPENING, [...follow.lit], FRAME, FADE, REACH, MIN_ZOOM, HERE, TAG)!;
		assert.ok(to, "the camera moves");
		assert.equal(fitOf("projection", to), "clear");
	});

	it("shows a hovered stop's arc with its topics lit, framing nothing", () => {
		const section = { arc: { handle: a("orth") }, topics: [{ topic: topic("inner-product") }, { topic: topic("projection") }] } as unknown as CourseArcSection;
		const follow = followArc(section);
		assert.equal(follow.arc, "orth");
		assert.deepEqual([...follow.lit], ["inner-product", "projection"]);
		assert.equal(follow.framed, false);
		assert.equal(follow.marked, null);
	});

	it("opens a drawing shorter than the frame at its bottom, clear of the fade, so the road sits right under the cards", () => {
		const short = layoutTopicMap(["inner-product", "projection"].map(topic), EDGES.filter((e) => e.kind === "needs" && e.topic === h("projection") && e.prerequisite === h("inner-product")), CARD);
		const camera = framedCamera(short, null, FRAME, FADE, TAG, "bottom");
		assert.equal(Math.round(short.height * camera.zoom + camera.y), FRAME.height - FADE.y);
	});
});
