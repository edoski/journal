"use client";

import { useEffect } from "react";
import { POLISH_GROUPS } from "@/components/design-variant";
import { registerPolishHost } from "@/components/dev/polish-variant.js";

/** Hands the Logbook's in-app guide, the only variant switcher, this app's
 *  surfaces. The root layout mounts it only in development. The app is dark
 *  only (owner, 9 Nov 2026), so the guide shows no Theme row. */
export function PolishHost() {
	useEffect(() => registerPolishHost({ groups: POLISH_GROUPS, appearance: "single" }), []);
	return null;
}
