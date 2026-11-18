/**
 * A child process that dies with the server (round 3, 14 Nov 2026): a
 * killed server left its `claude -p` running, idle, for 26 minutes, and a
 * crashed server in the packaged app would leak one per turn.
 *
 * The child runs under a small /bin/sh supervisor in its own process
 * group. The supervisor holds the read end of a pipe (fd 3) whose write
 * end only the server has. However the server ends, a crash, SIGTERM or
 * SIGKILL, the kernel closes that end, the supervisor's read returns, and
 * it ends the whole group. Nothing polls: the read blocks until the server
 * is gone. A normal exit of the child ends the supervisor with the child's
 * own exit code, and `stopTiedChild` ends the group from the server.
 */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/** The supervisor. `$@` is the command. Fd 4 keeps the server's stdin for
 *  the command, since a background job's own stdin is /dev/null; fd 3 is
 *  the server's lifeline, closed in the command so only the watcher holds
 *  it. */
export const TIED_SUPERVISOR = [
	"exec 4<&0",
	'"$@" <&4 3<&- 4<&- &',
	"child=$!",
	"( read -r _ <&3; kill -TERM 0 ) >/dev/null 2>&1 4<&- &",
	"watcher=$!",
	"exec 3<&- 4<&-",
	'trap \'kill -TERM "$child" 2>/dev/null\' TERM INT HUP',
	'while :; do wait "$child"; code=$?; kill -0 "$child" 2>/dev/null || break; done',
	'kill "$watcher" 2>/dev/null',
	'exit "$code"',
].join("\n");

/** Spawns `bin args` tied to this server, with piped stdin, stdout and
 *  stderr. When the supervisor ends, whatever is left of its group ends
 *  with it: the Agent SDK's close kills the process it spawned, the
 *  supervisor alone, with SIGKILL when the command is slow to stop, and the
 *  command and watcher it left behind held the server's pipes open (round
 *  16, 18 Nov 2026: an arc pass that had finished never exited, on twelve
 *  orphaned watchers). A supervisor that ended normally leaves none. */
export function spawnTiedChild(bin: string, args: readonly string[], options: Omit<SpawnOptions, "stdio" | "detached">): ChildProcess {
	const child = spawn("/bin/sh", ["-c", TIED_SUPERVISOR, "tied", bin, ...args], {
		...options,
		// Its own process group, so one signal reaches the command and its
		// watcher together.
		detached: true,
		stdio: ["pipe", "pipe", "pipe", "pipe"],
	});
	child.once("exit", () => signalGroup(child, "SIGKILL"));
	return child;
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
	try {
		process.kill(-child.pid!, signal);
	} catch {
		// Already gone.
	}
}

/** Ends a tied child and everything it started: SIGTERM to its group, then
 *  SIGKILL after a grace period if it is still there. */
export function stopTiedChild(child: ChildProcess, graceMs = 2000): void {
	if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
	signalGroup(child, "SIGTERM");
	setTimeout(() => {
		if (child.exitCode === null && child.signalCode === null) signalGroup(child, "SIGKILL");
	}, graceMs).unref();
}
