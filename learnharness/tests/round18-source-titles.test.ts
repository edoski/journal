/**
 * Round 18, m23 (1 n10, 2 m24 row, 3 n3). The topic page's material read
 * "Grinstead snell probability", "Hefferon linear algebra" and "Hefferon
 * answers": round 17 cased the files' stems instead of finding a title. A
 * source is now named by the document's own title (a PDF's document
 * information or XMP title, a Markdown file's first heading), a book and
 * its answers apart, and a source that names itself nowhere shows only the
 * place in it. Read from real files on disk.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { courseSourceTitles, documentTitle, pdfInfoTitle, sourceTitles } from "../src/server/source-titles.ts";

/** A PDF whose document information says `info` (a dictionary's body), as
 *  pdfTeX writes one: an outline entry's /Title before it, the trailer naming it. */
const pdf = (info: string | null, extra = "") =>
	["%PDF-1.5", "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj", "4 0 obj << /Title (Contents) /Parent 5 0 R >> endobj", extra, info ? `3 0 obj << ${info} >> endobj` : "", `trailer << /Root 1 0 R ${info ? "/Info 3 0 R " : ""}>>`, "%%EOF"].join("\n");

let course: string;
const write = (file: string, data: string) => fs.writeFileSync(path.join(course, "material", file), data, "latin1");
before(() => {
	course = fs.mkdtempSync(path.join(os.tmpdir(), "lh-sources-"));
	fs.mkdirSync(path.join(course, "material"));
	fs.mkdirSync(path.join(course, ".study"));
	fs.writeFileSync(path.join(course, ".study", "workspace.json"), '{"version": 1}');
	// The seeded books as their files carry them (round 18's world): both
	// Hefferons titled "Linear Algebra", Lebl's in UTF-16, OpenStax's in XMP,
	// Grinstead and Snell's with none.
	write("hefferon-linear-algebra.pdf", pdf("/Author(Jim Hefferon)/Title(Linear Algebra)/Subject(linear algebra)"));
	write("hefferon-answers.pdf", pdf("/Author(Jim Hefferon)/Title(Linear Algebra)/Subject(linear algebra)"));
	write("lebl-basic-analysis-1.pdf", pdf("/Title(\\376\\377\\000B\\000a\\000s\\000i\\000c\\000\\040\\000A\\000n\\000a\\000l\\000y\\000s\\000i\\000s)"));
	write("openstax-calculus-v1.pdf", pdf(null, '6 0 obj << /Type /Metadata /Subtype /XML >> stream\n<x:xmpmeta><rdf:RDF><rdf:Description><dc:title><rdf:Alt><rdf:li xml:lang="x-default">Calculus Volume 1</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>\nendstream endobj'));
	write("grinstead-snell-probability.pdf", pdf(null));
	write("problem-sheets.md", "# Linear Algebra: problem sheets\n\nEach sheet is set from the textbook's exercises.\n");
});
after(() => fs.rmSync(course, { recursive: true, force: true }));

const stem = (file: string) => file.replace(/\.[^.]+$/, "");
const FILES = ["hefferon-linear-algebra.pdf", "hefferon-answers.pdf", "lebl-basic-analysis-1.pdf", "openstax-calculus-v1.pdf", "grinstead-snell-probability.pdf", "problem-sheets.md"];
const sources = Object.fromEntries(FILES.map((file) => [stem(file), { path: `material/${file}`, title: stem(file) }]));

describe("a source's name (round 18, m23)", () => {
	it("is the document's own title, a book and its answers apart, never its file's name", async () => {
		const names = await courseSourceTitles(course, sources, "Linear Algebra");
		assert.deepEqual(Object.fromEntries(names), {
			"hefferon-linear-algebra": "Linear Algebra",
			"hefferon-answers": "Linear Algebra: Answers",
			"lebl-basic-analysis-1": "Basic Analysis",
			"openstax-calculus-v1": "Calculus Volume 1",
			"grinstead-snell-probability": null,
			"problem-sheets": "Problem sheets",
		});
		const said = (s: string) => s.toLowerCase().replace(/[-_\s]+/g, " ").trim();
		for (const [handle, name] of names) assert.ok(name === null || handle === "problem-sheets" || said(name) !== said(handle), `${handle} is named by its file: ${name}`);
	});

	it("keeps a real title the record gives, and reads nothing for it", async () => {
		const names = await courseSourceTitles(course, { bh: { path: "material/missing.pdf", title: "Blitzstein and Hwang" } }, null);
		assert.equal(names.get("bh"), "Blitzstein and Hwang");
	});

	it("reads the title the trailer names, never an outline entry's", () => {
		assert.equal(pdfInfoTitle(pdf(null)), null, "only an outline's /Title (Contents)");
		assert.equal(pdfInfoTitle(pdf("/Title<FEFF004C0041>")), "LA", "a hex title in UTF-16");
		assert.equal(documentTitle("LINEAR  ALGEBRA", null), "Linear Algebra", "out of capitals, on one line");
		assert.equal(sourceTitles([{ handle: "x", title: "x", path: "x.pdf", own: null }], null).get("x"), null);
	});
});
