/** "current", "proposed", or one of a group's `options`. */
export type PolishVariant = string;

export interface PolishGroup {
	id: string;
	label?: string;
	/** The group's candidates besides Current; without it the group offers Current and Proposed. */
	options?: readonly string[];
	/** Values of other groups every option of this group needs. */
	requires?: Readonly<Record<string, string>>;
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
