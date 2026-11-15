/**
 * Home's map following Today (home-map.md): which Today line the map
 * follows, and how a line reports that he points at it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followedRow, lineKey, pointProps } from "../components/study-home/agenda-rows/row-facts.ts";
import type { TodayRow } from "../components/study-home/study-facts.ts";

const course = (workspace: string) => ({ map: { workspace } }) as never;
const LA: TodayRow = { kind: "course", course: course("la"), step: { kind: "none" } } as never;
const PR: TodayRow = { kind: "course", course: course("pr"), step: { kind: "none" } } as never;
const LOOSE: TodayRow = { kind: "session", chat: { id: "c1" }, course: null } as never;

describe("the line Home's map follows", () => {
	it("is the first line with a course while nothing is pointed at", () => {
		assert.equal(followedRow([LOOSE, LA, PR], null), LA);
	});

	it("is the line he points at", () => {
		assert.equal(followedRow([LA, PR], lineKey(PR)), PR);
	});

	it("tells apart two lines of one course, as a course's review and its open task", () => {
		const task: TodayRow = { kind: "course", course: course("la"), step: { kind: "task", key: "sheet-4", title: "Sheet 4", updated: null, topics: [] } } as never;
		assert.notEqual(lineKey(task), lineKey(LA));
		assert.equal(followedRow([LA, task], lineKey(task)), task);
	});

	it("stays on Today's first course line when the pointed line has no course or is gone", () => {
		assert.equal(followedRow([LA, LOOSE], "c1"), LA);
		assert.equal(followedRow([LA, PR], "gone"), LA);
		assert.equal(followedRow([LOOSE], null), null);
	});
});

describe("a line reporting that he points at it", () => {
	it("adds nothing when nothing follows", () => {
		assert.deepEqual(pointProps(LA, {}), {});
	});

	it("reports the pointer, focus and leaving, and marks the followed line", () => {
		const seen: string[] = [];
		const props = pointProps(PR, { pointed: lineKey(PR), onPoint: (row, by) => seen.push(`${lineKey(row)}:${by}`), onPointEnd: () => seen.push("end") }) as Record<string, unknown>;
		assert.equal(props["data-pointed"], true);
		(props.onPointerEnter as () => void)();
		(props.onFocus as () => void)();
		(props.onPointerLeave as () => void)();
		(props.onBlur as () => void)();
		assert.deepEqual(seen, [`${lineKey(PR)}:pointer`, `${lineKey(PR)}:focus`, "end", "end"]);
		assert.equal((pointProps(LA, { pointed: lineKey(PR), onPoint: () => {} }) as Record<string, unknown>)["data-pointed"], undefined);
	});
});
