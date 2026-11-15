import { createModels } from "@earendil-works/pi-ai";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import packageMetadata from "../../package.json" with { type: "json" };

export { claudeEngine, type SdkEngine } from "./sdk/engine.ts";

/** App identity for the pricing catalog. */
export const APP_IDENTITY = Object.freeze({
	userAgent: Object.freeze({ custom: `learnharness/${packageMetadata.version}` }),
	attribution: Object.freeze({ name: packageMetadata.name, url: packageMetadata.homepage }),
});

let collection: ReturnType<typeof createModels> | undefined;

/** The process-wide pi-ai Models collection, used as a CATALOG only:
 *  read-time pricing reads older records' API models from it. Nothing
 *  streams through it, so no environment key is ever read for a model call. */
export function piModels() {
	if (!collection) {
		collection = createModels({ identity: APP_IDENTITY });
		for (const provider of builtinProviders()) collection.setProvider(provider);
	}
	return collection;
}
