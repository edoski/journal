export type PolishVariant = "current" | "proposed" | (string & {});

export function polishVariant(group: string): PolishVariant;
export function setPolishVariant(group: string, variant: PolishVariant): void;
export function onPolishChange(callback: (change: { group: string; variant: PolishVariant }) => void): () => void;
export function installPolishSwitcher(options: {
	groups: { id: string; label?: string; variants?: string[] }[];
	appearance: {
		read: () => "light" | "dark";
		set: (mode: "light" | "dark") => void;
		subscribe: (onChange: () => void) => () => void;
	};
	corner?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
	offset?: { x: number; y: number };
}): () => void;
