import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import type { Api } from "@earendil-works/pi-ai";
import { readCachedModels, readCachedModelsSync, writeCachedModels, writeRawResponse } from "./src/plexus-cache.js";
import { getBaseUrl, getBaseUrlSync, getModelsUrl, saveBaseUrl } from "./src/plexus-config.js";
import { log } from "./src/plexus-log.js";
import { convertModels, fetchPlexusModels } from "./src/plexus-models.js";
import type { PiModel } from "./src/plexus-models.js";

const PLEXUS_PROVIDER = "plexus";

const createProviderConfig = (models: PiModel[], baseUrl: string): ProviderConfig => ({
	api: "openai-completions" as Api,
	apiKey: "PLEXUS_API_KEY",
	authHeader: true,
	baseUrl,
	models,
});

const attemptLiveRefresh = async (pi: ExtensionAPI, apiKey: string): Promise<void> => {
	const baseUrl = getBaseUrl();
	const modelsUrl = getModelsUrl();

	log("attemptLiveRefresh", { hasApiKey: !!apiKey, baseUrl, modelsUrl });

	if (!baseUrl || !modelsUrl) {
		log("attemptLiveRefresh: missing baseUrl, skipping");
		return;
	}

	try {
		const { models: apiModels, raw } = await fetchPlexusModels(apiKey, modelsUrl);
		const models = convertModels(apiModels, baseUrl);

		log("attemptLiveRefresh: fetched models", { count: models.length, sampleModelBaseUrl: models[0]?.baseUrl });

		await Promise.all([writeCachedModels(models), writeRawResponse(raw)]);
		pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(models, baseUrl));
		log("attemptLiveRefresh: provider registered");
	} catch (error) {
		log("attemptLiveRefresh: fetch failed", { error: String(error) });
	}
};

export default function plexusExtension(pi: ExtensionAPI) {
	const cached = readCachedModelsSync();
	const startupBaseUrl = getBaseUrlSync() ?? "http://localhost/v1";
	const startupModels = cached?.models ?? [];

	log("startup", {
		cachedModelCount: startupModels.length,
		startupBaseUrl,
		sampleCachedModelBaseUrl: startupModels[0]?.baseUrl,
	});

	pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(startupModels, startupBaseUrl));

	pi.on("session_start", async (_event, ctx) => {
		const apiKey = await ctx.modelRegistry.authStorage.getApiKey(PLEXUS_PROVIDER);
		const baseUrl = getBaseUrl();

		log("session_start", { hasApiKey: !!apiKey, baseUrl });

		if (!apiKey || !baseUrl) {
			log("session_start: no auth configured, skipping refresh");
			return;
		}

		await attemptLiveRefresh(pi, apiKey);
	});

	pi.registerCommand("plexus", {
		description: "Plexus provider commands: login, refresh",
		getArgumentCompletions: () => [
			{ value: "login", label: "login", description: "Configure Plexus base URL and API key" },
			{ value: "refresh", label: "refresh", description: "Refresh Plexus models from the API" },
		],
		handler: async (args, ctx) => {
			const sub = args.trim();

			if (sub === "login") {
				const baseUrl = await ctx.ui.input("Plexus base URL", "https://plexus.example.com");
				if (!baseUrl) return;

				const apiKey = await ctx.ui.input("Plexus API key");
				if (!apiKey) return;

				await saveBaseUrl(baseUrl.trim());
				ctx.modelRegistry.authStorage.set(PLEXUS_PROVIDER, { type: "api_key", key: apiKey.trim() });

				log("login: saved", { baseUrl: baseUrl.trim() });
				ctx.ui.notify("Plexus credentials saved", "info");

				await attemptLiveRefresh(pi, apiKey.trim());
				return;
			}

			if (sub === "refresh") {
				const apiKey = await ctx.modelRegistry.authStorage.getApiKey(PLEXUS_PROVIDER);
				const baseUrl = getBaseUrl();
				const modelsUrl = getModelsUrl();

				log("refresh command", { hasApiKey: !!apiKey, baseUrl });

				if (!apiKey) {
					ctx.ui.notify("No Plexus API key configured. Run /plexus login first.", "error");
					return;
				}
				if (!baseUrl || !modelsUrl) {
					ctx.ui.notify("No Plexus base URL configured. Run /plexus login first.", "error");
					return;
				}

				try {
					ctx.ui.notify("Fetching Plexus models...", "info");
					const { models: apiModels, raw } = await fetchPlexusModels(apiKey, modelsUrl);
					const models = convertModels(apiModels, baseUrl);

					await Promise.all([writeCachedModels(models), writeRawResponse(raw)]);
					pi.registerProvider(PLEXUS_PROVIDER, createProviderConfig(models, baseUrl));

					log("refresh command: done", { count: models.length });
					ctx.ui.notify(`Refreshed ${models.length} Plexus models`, "info");
				} catch (error) {
					log("refresh command: failed", { error: String(error) });
					ctx.ui.notify(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`, "error");
				}
				return;
			}

			ctx.ui.notify("Usage: /plexus login | /plexus refresh", "info");
		},
	});
}
