"use client";

import { useCallback, useRef } from "react";

/** A read that never overlaps itself: a call while one runs asks for one
 *  more run when it ends, so a burst of events costs at most two runs and
 *  never throws away the run under way (round 13, 4 minor 8: each event at
 *  a turn's end restarted the marks read). `run` reads its inputs from
 *  refs, so the repeat sees the newest. A run's failure is its own. */
export function useSerialRead(run: () => Promise<void>): () => void {
	const latest = useRef(run);
	latest.current = run;
	const reading = useRef(false);
	const again = useRef(false);
	return useCallback(() => {
		if (reading.current) {
			again.current = true;
			return;
		}
		reading.current = true;
		void (async () => {
			do {
				again.current = false;
				await latest.current().catch(() => {});
			} while (again.current);
			reading.current = false;
		})();
	}, []);
}
