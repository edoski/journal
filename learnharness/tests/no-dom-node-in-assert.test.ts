import { describe, it } from "node:test";
import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import rule from "../eslint/no-dom-node-in-assert.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
	languageOptions: {
		parser: tsParser,
		parserOptions: {
			projectService: { allowDefaultProject: ["*.ts"], defaultProject: "tsconfig.json" },
			tsconfigRootDir: new URL("..", import.meta.url).pathname,
		},
	},
});

const strict = 'import assert from "node:assert/strict";\n';
const filename = "no-dom-node-in-assert-fixture.ts";
const valid = (code: string) => ({ code: strict + code, filename });
const invalid = (code: string, output: string | null, messageId = "identity") => ({ code: strict + code, output: output && strict + output, filename, errors: [{ messageId }] });

tester.run("no-dom-node-in-assert", rule, {
	valid: [
		valid('assert.equal(document.title, "x");'),
		valid("assert.equal(document.querySelectorAll('li').length, 3);"),
		valid('assert.equal(document.querySelector("h3")?.textContent, "Claude");'),
		valid("const el = document.querySelector('h3');\nassert.ok(el);"),
		valid("assert.deepEqual([...document.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['/']);"),
		valid('assert.equal(JSON.parse("{}"), null);'),
		valid('import { equal } from "node:test";\nequal(document.body, null);'),
	],
	invalid: [
		invalid('assert.equal(document.querySelector("h3"), null);', 'assert.ok(document.querySelector("h3") === null);'),
		invalid('assert.equal(document.querySelector("h3"), null, "one Claude heading");', 'assert.ok(document.querySelector("h3") === null, "one Claude heading");'),
		invalid("const focused = document.activeElement;\nassert.equal(focused, document.body);", "const focused = document.activeElement;\nassert.ok(focused === document.body);"),
		invalid("declare const el: HTMLElement | null;\nassert.notEqual(el, null);", "declare const el: HTMLElement | null;\nassert.ok(el !== null);"),
		invalid('declare const el: HTMLElement | null;\nassert.notEqual(el, null, "the field is there");', 'declare const el: HTMLElement | null;\nassert.ok(el !== null, "the field is there");'),
		invalid("assert.strictEqual(document.body.firstElementChild ?? null, null);", "assert.ok((document.body.firstElementChild ?? null) === null);"),
		invalid("const same = <T extends Element>(a: T, b: T) => assert.equal(a, b);", "const same = <T extends Element>(a: T, b: T) => assert.ok(a === b);"),
		invalid("assert.deepEqual([document.body], [document.body]);", null, "deep"),
		{
			code: 'import assert from "node:assert";\nassert.equal(document.querySelector("h3"), null);',
			output: 'import assert from "node:assert";\nassert.ok(document.querySelector("h3") == null);',
			filename,
			errors: [{ messageId: "identity" }],
		},
		{
			code: 'import { equal } from "node:assert/strict";\nequal(document.body, null);',
			output: null,
			filename,
			errors: [{ messageId: "identity" }],
		},
	],
});
