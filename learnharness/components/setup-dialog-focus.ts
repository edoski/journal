import { focusWhereHeTypes } from "@/components/ui/overlay";

/** The sign-in dialog's close focus (round 8): when it closes because he
 *  signed in, his next key goes to the box he types in, never back to the
 *  Sign in button that opened it. Closed without signing in, Radix gives
 *  focus back as usual. */
export function signedInCloseFocus(signedIn: boolean, doc: () => Document | undefined = () => globalThis.document) {
	return (event: Event) => {
		if (!signedIn) return;
		event.preventDefault();
		focusWhereHeTypes(doc(), false);
	};
}
