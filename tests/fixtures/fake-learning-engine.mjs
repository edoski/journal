// A stand-in for `python -m learning`: the same argv shape, the same JSON
// on stdout and error JSON on stderr. Every call is appended to
// FAKE_ENGINE_LOG as {args, stdin}. FAKE_ENGINE_PLAN is the `plan --all`
// stdout. With FAKE_ENGINE_PLAN_FILE instead, the plan is that file, `init`
// registers its workspace there and a save's `title` renames the entry, as
// the real registry does. FAKE_ENGINE_FAIL names a verb that fails with an
// io error. Topic "unknown" in a save is refused like the real engine
// refuses an unknown topic; handle "slow" hangs; handle "garbled" prints
// non-JSON.
import fs from "node:fs";

const args = process.argv.slice(2);
if (args[0] !== "-m" || args[1] !== "learning") {
	process.stderr.write("usage: -m learning ...\n");
	process.exit(2);
}
const rest = args.slice(2);
const stdin = fs.readFileSync(0, "utf-8");
if (process.env.FAKE_ENGINE_LOG) {
	fs.appendFileSync(process.env.FAKE_ENGINE_LOG, `${JSON.stringify({ args: rest, stdin })}\n`);
}
const verbAt = rest[0] === "--workspace" ? 2 : 0;
const verb = rest[verbAt];
const operands = rest.slice(verbAt + 1).filter((a) => a !== "--");

function fail(message, kind = "validation") {
	process.stderr.write(JSON.stringify({ error: { kind, message } }));
	process.exit(1);
}

const planFile = process.env.FAKE_ENGINE_PLAN_FILE;
const workspace = rest[0] === "--workspace" ? rest[1] : undefined;
function readPlan() {
	return JSON.parse(fs.readFileSync(planFile, "utf-8"));
}
function writePlan(plan) {
	fs.writeFileSync(planFile, JSON.stringify(plan));
}

if (process.env.FAKE_ENGINE_FAIL === verb) fail(`${verb} could not write the record`, "io");

switch (verb) {
	case "plan":
		process.stdout.write(
			planFile ? fs.readFileSync(planFile, "utf-8") : process.env.FAKE_ENGINE_PLAN ?? JSON.stringify({ today: "2026-11-07", courses: [] }),
		);
		break;
	case "init": {
		if (planFile) {
			const plan = readPlan();
			if (!plan.courses.some((c) => c.workspace === workspace)) plan.courses.push({ workspace });
			writePlan(plan);
		}
		process.stdout.write(JSON.stringify({ workspace, learning: `${workspace}/.study`, hosts: {} }));
		break;
	}
	case "resume":
		process.stdout.write(JSON.stringify({ today: "2026-11-07", due: [{ topic: "rank", level: "assisted" }], task: null }));
		break;
	case "show":
		if (operands.includes("slow")) setTimeout(() => {}, 60_000);
		else if (operands.includes("garbled")) process.stdout.write("not json");
		else process.stdout.write(JSON.stringify({ items: operands }));
		break;
	case "search":
		process.stdout.write(JSON.stringify({ query: operands.join(" "), results: [] }));
		break;
	case "save": {
		const patch = JSON.parse(stdin);
		const unknown = (patch.observations ?? []).flatMap((o) => o.topics ?? []).find((t) => t === "unknown");
		if (unknown) fail('observations[0].topics[0]: unknown topic "unknown"; create it in the same patch');
		if (planFile && typeof patch.title === "string") {
			const plan = readPlan();
			for (const c of plan.courses) if (c.workspace === workspace) c.title = patch.title;
			writePlan(plan);
		}
		process.stdout.write(JSON.stringify({ revision: 1, changed: true, observations: (patch.observations ?? []).map((_, i) => `o${i + 1}`) }));
		break;
	}
	default:
		fail(`unknown verb ${verb}`);
}
