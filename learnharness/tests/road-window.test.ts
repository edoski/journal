import { test } from "node:test";
import assert from "node:assert/strict";
import { roadWindow, shownStop } from "@/components/course-page/candidates/road/road-model";
import type { CourseArcSection } from "@/components/course-page/course-model";
import type { ArcHandle } from "@/src/core";

const arc = (handle: string, o: { current?: boolean; needsYou?: boolean; state?: string } = {}) =>
	({ arc: { handle, state: o.state ?? "new" }, current: o.current ?? false, needsYou: o.needsYou ?? false, topics: [] }) as unknown as CourseArcSection;

const road = [arc("a", { state: "checked" }), arc("b", { state: "ready" }), arc("c", { needsYou: true }), arc("d"), arc("e", { current: true }), arc("f"), arc("g")];
const handles = (s: readonly CourseArcSection[]) => s.map((x) => x.arc.handle);

test("Road shows the arc he is in, the next, and what Today asks about; the whole road on request", () => {
	assert.deepEqual(handles(roadWindow(road, false)), ["c", "e", "f"]);
	assert.deepEqual(handles(roadWindow(road, true)), ["a", "b", "c", "d", "e", "f", "g"]);
});

test("with no current arc, the first arc not yet checked stands in", () => {
	const none = road.map((s) => ({ ...s, current: false }));
	assert.deepEqual(handles(roadWindow(none, false)), ["b", "c"]);
});

test("the exam's stop moves to the next shown arc when its own arc is folded away", () => {
	const shown = roadWindow(road, false);
	assert.equal(shownStop(road, shown, "d" as ArcHandle), "e");
	assert.equal(shownStop(road, shown, "g" as ArcHandle), null);
	assert.equal(shownStop(road, shown, null), null);
});
