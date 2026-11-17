/**
 * A course map held still while it fits (Edo, 16 Nov 2026: "this container
 * should be fixed without the user being able to drag it left and right or
 * up and down when the graph itself cleanly fits on screen… The only
 * navigation that I should be able to do is just zooming in… and zooming
 * out"). The map pans neither by drag nor by scroll while the whole
 * drawing is on screen; a pinch zooms in past it and only then pans,
 * within the view that shows it whole, so zooming back out lands on that
 * view, centred. The drag and the pinch themselves are probed in the
 * running app (round 14, map polish 2).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cameraAt, showsWhole, wholeExtent, wholeZoom, type TopicMapLayout } from "../components/course-map/topic-map/topic-map-layout.ts";

const layout = { width: 760, height: 420 } as TopicMapLayout;
const frame = { width: 1192, height: 866 };
const room = { x: 64, y: 60 };

describe("a map held still while it fits", () => {
	it("is still at the zoom that shows the whole drawing, and pans once zoomed in past it", () => {
		const fitted = Math.min(1, wholeZoom(layout, frame, room));
		assert.ok(showsWhole(fitted, fitted));
		assert.ok(showsWhole(fitted * 0.9, fitted), "zoomed out further, still all on screen");
		assert.ok(!showsWhole(fitted * 1.1, fitted), "zoomed in: part of it is off screen, so it pans");
	});

	it("looks no further than the whole view, so at that zoom the drawing sits centred and cannot move", () => {
		const fitted = Math.min(1, wholeZoom(layout, frame, room));
		const [[x0, y0], [x1, y1]] = wholeExtent(layout, frame, fitted);
		assert.ok(Math.abs((x1 - x0) * fitted - frame.width) < 1e-9 && Math.abs((y1 - y0) * fitted - frame.height) < 1e-9, "the frame's own size at that zoom");
		// The whole view the map opens on is exactly that extent, so React Flow has nowhere else to put it.
		const opening = cameraAt(layout, [layout.width / 2, layout.height / 2], fitted, frame, room);
		assert.ok(Math.abs(-opening.x / fitted - x0) < 1e-6 && Math.abs(-opening.y / fitted - y0) < 1e-6);
	});

	it("keeps a course too big to show whole reachable: zoomed in, the extent still holds the drawing and its room", () => {
		const big = { width: 2400, height: 1800 } as TopicMapLayout;
		const fitted = Math.min(1, wholeZoom(big, frame, room));
		const [[x0, y0], [x1, y1]] = wholeExtent(big, frame, fitted);
		assert.ok(x0 <= -room.x / fitted + 1e-6 && y0 <= -room.y / fitted + 1e-6);
		assert.ok(x1 >= big.width + room.x / fitted - 1e-6 && y1 >= big.height + room.y / fitted - 1e-6);
	});
});
