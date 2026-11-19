/**
 * Round 18, m23 (1 n10, 2 m24 row, 3 n3). The topic page's material read
 * "Grinstead snell probability", "Hefferon linear algebra" and "Hefferon
 * answers": round 17 cased the files' stems instead of finding a title. A
 * source is now named by the document's own title (a PDF's metadata, else
 * its first page's largest type; a Markdown file's first heading), a book
 * and its answers apart, and a source that names itself nowhere shows only
 * the place in it. Read from real files on disk.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { tinyPdf } from "./helpers/tiny-pdf.ts";
import { courseSourceTitles, documentTitle, sourceTitles } from "../src/server/source-titles.ts";

let course: string;
const write = (file: string, data: string | Uint8Array) => fs.writeFileSync(path.join(course, "material", file), data);
before(() => {
	course = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sources-"));
	fs.mkdirSync(path.join(course, "material"));
	fs.mkdirSync(path.join(course, ".study"));
	fs.writeFileSync(path.join(course, ".study", "workspace.json"), '{"version": 1}');
	// The seeded books' first pages, as pdfjs reads them (round 18's world):
	// both Hefferons open "LINEAR ALGEBRA / Jim Hefferon", the answers adding
	// one line; Grinstead and Snell has no metadata title.
	const front = (extra: string[]) => tinyPdf([{ runs: [{ text: "LINEAR ALGEBRA", x: 72, y: 700, size: 40 }, { text: "Jim Hefferon", x: 72, y: 640, size: 20 }, ...extra.map((text, i) => ({ text, x: 72, y: 600 - 30 * i, size: 20 }))] }]);
	write("hefferon-linear-algebra.pdf", front([]));
	write("hefferon-answers.pdf", front(["Answers to exercises"]));
	write("grinstead-snell-probability.pdf", tinyPdf([{ runs: [{ text: "Grinstead and Snell's Introduction to Probability", x: 72, y: 700, size: 17 }, { text: "The CHANCE Project", x: 72, y: 660, size: 12 }] }]));
	write("problem-sheets.md", "# Linear Algebra: problem sheets\n\nEach sheet is set from the textbook's exercises.\n");
	write("scan.pdf", tinyPdf([{ image: true }]));
});
after(() => fs.rmSync(course, { recursive: true, force: true }));

const stem = (file: string) => file.replace(/\.[^.]+$/, "");
const sources = Object.fromEntries(
	["hefferon-linear-algebra.pdf", "hefferon-answers.pdf", "grinstead-snell-probability.pdf", "problem-sheets.md", "scan.pdf"].map((file) => [stem(file), { path: `material/${file}`, title: stem(file) }]),
);

describe("a source's name (round 18, m23)", () => {
	it("is the document's own title, never its file's name, cased or not", async () => {
		const names = await courseSourceTitles(course, sources, "Linear Algebra");
		assert.deepEqual(Object.fromEntries(names), {
			"hefferon-linear-algebra": "Linear Algebra",
			"hefferon-answers": "Linear Algebra: Answers to exercises",
			"grinstead-snell-probability": "Grinstead and Snell's Introduction to Probability",
			"problem-sheets": "Problem sheets",
			scan: null,
		});
		for (const [handle, name] of names) {
			const words = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, " ").trim();
			assert.ok(name === null || handle === "problem-sheets" || words(name) !== words(handle), `${handle} is named by its file: ${name}`);
		}
	});

	it("keeps a real title the record gives, and reads nothing for it", async () => {
		const names = await courseSourceTitles(course, { bh: { path: "material/missing.pdf", title: "Blitzstein and Hwang" } }, null);
		assert.equal(names.get("bh"), "Blitzstein and Hwang");
	});

	it("takes a PDF's metadata title first, and unshouts a title set in capitals", () => {
		assert.equal(documentTitle({ title: "Calculus Volume 1", runs: [{ text: "Volume 1", size: 102 }] }, null), "Calculus Volume 1");
		assert.equal(documentTitle({ title: null, runs: [{ text: "LINEAR ALGEBRA", size: 49.8 }, { text: "http://joshua.smcvt.edu", size: 60 }] }, null), "Linear Algebra", "a link is no title");
		assert.equal(sourceTitles([{ handle: "x", title: "x", path: "x.pdf", front: null }], null).get("x"), null);
	});
});
