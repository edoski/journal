export type PolishVariant = "current" | "proposed" | (string & {});

export function polishVariant(group: string): PolishVariant;
export function setPolishVariant(group: string, variant: PolishVariant): void;
export function onPolishChange(callback: (change: { group: string; variant: PolishVariant }) => void): () => void;
export interface PolishGroup {
	id: string;
	label?: string;
	variants?: string[];
	/** The variant shown while none is stored; "current" by default. */
	fallback?: string;
}

export function definePolishGroups(groups: readonly PolishGroup[]): void;
export function installPolishSwitcher(options: {
	groups: readonly PolishGroup[];
	appearance: {
		read: () => "light" | "dark";
		set: (mode: "light" | "dark") => void;
		subscribe: (onChange: () => void) => () => void;
	};
	corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
	offset?: { x: number; y: number };
}): () => void;
