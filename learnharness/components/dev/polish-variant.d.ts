export type PolishVariant = "current" | "proposed";

export interface PolishGroup {
	id: string;
	label?: string;
}

export function polishVariant(group: string): PolishVariant;
export function setPolishVariant(group: string, variant: PolishVariant): void;
export function onPolishChange(callback: (change: { group: string; variant: PolishVariant }) => void): () => void;
export function registerPolishHost(host: {
	groups: readonly PolishGroup[];
	appearance:
		| "single"
		| {
				read: () => "light" | "dark";
				set: (mode: "light" | "dark") => void;
				subscribe: (onChange: () => void) => () => void;
		  };
}): void;
