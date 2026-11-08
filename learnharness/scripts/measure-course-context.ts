/**
 * The per-role context cost of a course-linked lesson, in bytes: the app's
 * system prompt, its course doctrine, the tool schemas, and the course
 * brief for each `resume` JSON file given. Provider token counts come from
 * a live run's usage log; this script reproduces the byte side.
 *
 *   npx tsx scripts/measure-course-context.ts resume-a.json [resume-b.json ...]
 */

import fs from "node:fs";
import path from "node:path";
import { composeInstructions } from "../src/agent/teacher-agent.ts";
import { courseRecordPrompt } from "../src/agent/prompt-segments.ts";
import { createProberTools, createTeacherTools } from "../src/agent/tools.ts";
import { practiceTools } from "../src/agent/tools/practice.ts";
import { courseTools } from "../src/agent/tools/course.ts";
import { projectCourseBrief } from "../src/core/course-brief.ts";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const schemaBytes = (tools: Record<string, { name: string; description: string; parameters: unknown }>) =>
	Object.values(tools).reduce((n, t) => n + bytes(JSON.stringify({ name: t.name, description: t.description, input_schema: t.parameters })), 0);

const chatStore = { getChat: () => ({ messages: [] }) } as never;
const job = { chatId: "c", chatStore, jobStore: {} as never, spawn: () => {}, deliver: () => {} } as never;
const course = courseTools({ course: { workspace: "/w", title: "Course" }, records: {} as never }) as never;
const rows = [
	{ role: "prober" as const, prompt: composeInstructions("prober"), tools: createProberTools(job) },
	{ role: "teacher" as const, prompt: composeInstructions("teacher"), tools: createTeacherTools(job) },
	{ role: "practice" as const, prompt: composeInstructions("practice"), tools: practiceTools({ chatId: "c", chatStore }) },
];
const resumes = process.argv.slice(2).map((file) => ({ name: path.basename(file), json: JSON.parse(fs.readFileSync(file, "utf-8")) as unknown }));

console.log(`course tool schemas ${schemaBytes(course)} B`);
for (const { name, json } of resumes) console.log(`full resume ${name}: ${bytes(JSON.stringify(json))} B`);
for (const row of rows) {
	const briefs = resumes.map(({ name, json }) => `${name} ${bytes(projectCourseBrief(json, row.role === "practice" ? "practice" : "teach").text)} B`);
	console.log(`${row.role}: app prompt ${bytes(row.prompt)} B, course doctrine ${bytes(courseRecordPrompt(row.role))} B, app tool schemas ${schemaBytes(row.tools as never)} B, brief ${briefs.join(", ") || "n/a"}`);
}
