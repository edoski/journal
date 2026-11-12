"use client";

import { useEffect } from "react";
import { HOME_CANDIDATES, POLISH_GROUPS } from "@/components/design-variant";
import { onPolishChange, registerPolishHost, setPolishVariant } from "@/components/dev/polish-variant.js";

const HOME_GROUPS: readonly string[] = HOME_CANDIDATES.map((c) => `home-${c}`);

/** Hands the Logbook's in-app guide, the only variant switcher, this app's
 *  surfaces. The root layout mounts it only in development. The app is dark
 *  only (owner, 9 Nov 2026), so the guide shows no Theme row. The study
 *  home's candidates are one choice: turning one on turns the others off. */
export function PolishHost() {
	useEffect(() => {
		registerPolishHost({ groups: POLISH_GROUPS, appearance: "single" });
		return onPolishChange(({ group, variant }) => {
			if (variant !== "proposed" || !HOME_GROUPS.includes(group)) return;
			for (const other of HOME_GROUPS) if (other !== group) setPolishVariant(other, "current");
		});
	}, []);
	return null;
}
