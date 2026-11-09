"use client";

import { createContext, useContext } from "react";
import type { DesignVariant } from "@/components/design-variant";

/** The design the settings kit draws in: read once by the dialog that
 *  hosts it (Settings, setup) from useDesignVariant() and provided here,
 *  so the shared controls (controls.tsx) and the connection rows pick
 *  their look without each reading the switch. Outside a provider
 *  (the lesson's figure cards use Toggle) it is "current". */
export const SettingsDesignContext = createContext<DesignVariant>("current");

export function useSettingsProposed(): boolean {
	return useContext(SettingsDesignContext) === "proposed";
}
