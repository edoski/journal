/**
 * The grouping pass's ledgers: one JSON map in the app's data folder,
 * `arc-passes.json`, course workspace → where the course stands with the
 * pass (core/arc-pass.ts). The arcs live in the engine's course record; this
 * file keeps only whether a live run may form them, and what the last run
 * found.
 */

import fs from "node:fs";
import path from "node:path";
import { PATHS } from "../../config.ts";
import type { ArcPassLedger } from "../core/arc-pass.ts";
import type { ArcPassLedgers } from "../core/ports.ts";
import { writeFileAtomicSync } from "./atomic-write.ts";

const STATES = new Set(["new", "proposed", "approved", "formed", "none", "failed"]);

/** A ledger file at `file`: the app's, or a copy run's own. */
export function arcPassLedgersAt(file: string): ArcPassLedgers {
	function readAll(): Record<string, ArcPassLedger> {
		try {
			const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown;
			return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, ArcPassLedger>) : {};
		} catch {
			return {};
		}
	}
	const write = (all: Record<string, ArcPassLedger>) => {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomicSync(file, JSON.stringify(all, null, "\t"), { allowInPlaceFallback: true });
	};
	return {
		get(workspace) {
			const ledger = readAll()[workspace];
			return ledger && STATES.has(ledger.state) ? ledger : undefined;
		},
		workspaces() {
			return Object.keys(readAll());
		},
		save(workspace, ledger) {
			write({ ...readAll(), [workspace]: ledger });
		},
		forget(workspace) {
			const all = readAll();
			if (!(workspace in all)) return;
			delete all[workspace];
			write(all);
		},
	};
}

export const arcPassLedgers: ArcPassLedgers = arcPassLedgersAt(path.join(PATHS.data, "arc-passes.json"));
