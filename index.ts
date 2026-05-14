import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api } from "@earendil-works/pi-ai";
import { readCachedModels, readCachedModelsSync, writeCachedModels, writeRawResponse } from "./src/plexus-cache.js";
import { getApiKey, getBaseUrl, getBaseUrlSync, getModelsUrl } from "./src/plexus-config.js";
import { convertModels, fetchPlexusModels } from "./src/plexus-models.js";
import type { PiModel } from "./src/plexus-models.js";

const PLEXUS_PROVIDER = "plexus";

const createProviderConfig = (models: PiModel[], baseUrl: string) => ({
	api: "openai-completions" as Api,
	apiKey: "PLEXUS_API_KEY",
	authHeader: true,
	baseUrl,
	models,
});

const attemptLiveRefresh = async (pi: ExtensionAPI): Promise<void> => {
	const [apiKey, baseUrl, modelsUrl] = await Promise.all([getApiKey(), getBaseUrl(), getModelsUrl()]);

	if (!apiKey || !baseUrl || !modelsUrl) return;

	try {
		const { models: apiModels, raw } = await fetchPlexusModels(apiKey, modelsUrl);
		const models = convertModels(apiModels, baseUrl);

		await Promise.all([writeCachedModels(models), writeRawResponse(raw)]);

		pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(models, baseUrl));
	} catch {
		// keep prior registration; do not surface startup fetch errors
	}
};

export default function plexusExtension(pi: ExtensionAPI) {
	const cached = readCachedModelsSync();
	const startupBaseUrl = getBaseUrlSync() ?? "http://localhost/v1";
	const startupModels = cached?.models ?? [];

	pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(startupModels, startupBaseUrl));

	pi.on("session_start", async (_event, _ctx) => {
		const [apiKey, baseUrl] = await Promise.all([getApiKey(), getBaseUrl()]);

		if (!apiKey || !baseUrl) {
			const freshCache = await readCachedModels();
			if (freshCache) {
				pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(freshCache.models, baseUrl ?? startupBaseUrl));
			}
			return;
		}

		await attemptLiveRefresh(pi);
	});

	pi.registerCommand("plexus-refresh", {
		description: "Refresh Plexus models from the API and update the local cache",
		handler: async (_args, ctx) => {
			const [apiKey, baseUrl, modelsUrl] = await Promise.all([getApiKey(), getBaseUrl(), getModelsUrl()]);

			if (!apiKey) {
				ctx.ui.notify("PLEXUS_API_KEY not set", "error");
				return;
			}

			if (!baseUrl || !modelsUrl) {
				ctx.ui.notify("PLEXUS_BASE_URL not set", "error");
				return;
			}

			try {
				ctx.ui.notify("Fetching Plexus models...", "info");

				const { models: apiModels, raw } = await fetchPlexusModels(apiKey, modelsUrl);
				const models = convertModels(apiModels, baseUrl);

				await Promise.all([writeCachedModels(models), writeRawResponse(raw)]);

				pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(models, baseUrl));

				ctx.ui.notify(`Refreshed ${models.length} Plexus models and updated the local cache`, "info");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Failed to refresh: ${message}`, "error");
			}
		},
	});
}
