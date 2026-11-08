import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The role-named type sizes in app/globals.css (text-row, text-label, …):
// without this, tailwind-merge reads them as text colours and drops one of
// a size and a colour that share a class list.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["caption", "label", "row", "control", "prose", "subheading", "heading", "display"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
