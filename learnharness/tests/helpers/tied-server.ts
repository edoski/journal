// A stand-in server for tied-child.test.ts: starts a long command tied to
// itself, prints the command's process group, then waits to be killed.
import { spawnTiedChild } from "../../src/agent/tied-child.ts";

const child = spawnTiedChild("sleep", ["60"], {});
child.stdin?.end();
process.stdout.write(`${child.pid}\n`);
setInterval(() => {}, 1 << 30);
