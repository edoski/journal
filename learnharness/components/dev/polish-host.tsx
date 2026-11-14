"use client";

import { useEffect } from "react";
import { STANDING_GROUPS } from "@/components/course-page/standing-variant";
import { registerPolishHost } from "@/components/dev/polish-variant.js";

/** Hands the Logbook's in-app guide, the only variant switcher, this app's
 *  surfaces. The root layout mounts it only in development. The app is dark
 *  only (owner, 9 Nov 2026), so the guide shows no Theme row. */
export function PolishHost() {
	useEffect(() => {
		registerPolishHost({ groups: STANDING_GROUPS, appearance: "single" });
	}, []);
	return null;
}
