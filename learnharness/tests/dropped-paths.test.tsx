/**
 * Material dropped into a composer (lesson-composer.tsx): in the desktop
 * app a dropped file or folder that is no photo joins his words as its path,
 * so the setup agent reads it where it is; a photo stays a photo.
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { dom } from "./helpers/radix-dom.ts";
import { droppedPaths } from "../components/lesson/lesson-composer.tsx";

const g = globalThis as unknown as { window: { lh?: unknown } };
after(() => delete (dom.window as unknown as { lh?: unknown }).lh);

const file = (name: string, type: string) => new File(["x"], name, { type });
const list = (...files: File[]) => files as unknown as FileList;

describe("dropped material", () => {
	it("gives the path of each dropped file that is no photo, in the desktop app", () => {
		(g.window as { lh?: unknown }).lh = { pathForFile: (f: File) => `/Users/edo/Downloads/${f.name}` };
		assert.deepEqual(droppedPaths(list(file("hefferon.pdf", "application/pdf"), file("board.png", "image/png"), file("MLDM", ""))), ["/Users/edo/Downloads/hefferon.pdf", "/Users/edo/Downloads/MLDM"]);
	});

	it("gives none in a browser, which never tells a file's path", () => {
		delete (g.window as { lh?: unknown }).lh;
		assert.deepEqual(droppedPaths(list(file("hefferon.pdf", "application/pdf"))), []);
	});
});
