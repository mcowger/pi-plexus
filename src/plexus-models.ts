import { getModel } from "@earendil-works/pi-ai";
import type { Api, Model } from "@earendil-works/pi-ai";

export interface PlexusModelArchitecture {
	modality?: string;
	input_modalities?: string[];
	output_modalities?: string[];
	tokenizer?: string;
	instruct_type?: string | null;
}

export interface PlexusModelPricing {
	prompt?: string;
	completion?: string;
	input_cache_read?: string;
	input_cache_write?: string;
}

export interface PlexusTopProvider {
	context_length?: number | null;
	max_completion_tokens?: number | null;
	is_moderated?: boolean;
}

export interface PlexusApiModel {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
	preferred_api?: string | string[];
	name?: string;
	description?: string;
	context_length?: number | null;
	architecture?: PlexusModelArchitecture;
	pricing?: PlexusModelPricing;
	supported_parameters?: string[];
	top_provider?: PlexusTopProvider;
	/** When set, look up the full model definition from pi's MODELS for maximum fidelity. */
	pi_provider?: string;
	pi_model?: string;
}

export interface PlexusApiResponse {
	object: string;
	data: PlexusApiModel[];
}

export type PiModel = Model<Api>;

const DEFAULT_CONTEXT_WINDOW = 8192;
const REASONING_PARAMS = new Set(["reasoning", "include_reasoning", "reasoning_effort"]);

const parsePrice = (value: string | undefined): number => {
	if (!value) return 0;
	const parsed = parseFloat(value);
	return Number.isNaN(parsed) ? 0 : parsed;
};

const mapPreferredApi = (preferred_api: string | string[] | undefined): Api => {
	const SUPPORTED_MAP: Record<string, Api> = {
		chat_completions: "openai-completions",
		messages: "anthropic-messages",
		gemini: "google-generative-ai",
		responses: "openai-responses",
	};

	if (!preferred_api) return "openai-completions";

	const candidates = Array.isArray(preferred_api) ? preferred_api : [preferred_api];

	for (const candidate of candidates) {
		const mapped = SUPPORTED_MAP[candidate];
		if (mapped) return mapped;
	}

	return "openai-completions";
};

const mapInputModalities = (architecture: PlexusModelArchitecture | undefined): ("text" | "image")[] => {
	const modalities = architecture?.input_modalities ?? [];
	const result: ("text" | "image")[] = [];

	if (modalities.includes("text")) result.push("text");
	if (modalities.includes("image")) result.push("image");

	return result.length > 0 ? result : ["text"];
};

const inferReasoning = (supported_parameters: string[] | undefined): boolean => {
	if (!supported_parameters) return false;
	return supported_parameters.some((p) => REASONING_PARAMS.has(p));
};

/**
 * Attempt to look up a model definition from pi's built-in MODELS registry
 * using the pi_provider and pi_model hints from the plexus API.
 * Returns null if either hint is missing or the model isn't found.
 */
const lookupPiModel = (piProvider?: string, piModel?: string): Model<Api> | null => {
	if (!piProvider || !piModel) return null;

	// pi_provider/pi_model are dynamic strings from the plexus API,
	// so we cast to bypass the branded type constraints on getModel.
	// biome-ignore lint/suspicious/noExplicitAny: dynamic string args don't satisfy generic constraints
	return getModel(piProvider as any, piModel as any) ?? null;
};

export const convertToPiModel = (apiModel: PlexusApiModel, baseUrl: string): PiModel => {
	const piModelDef = lookupPiModel(apiModel.pi_provider, apiModel.pi_model);

	// When pi's MODELS has this model, use its curated definition for maximum fidelity,
	// overriding with plexus-specific fields (id, provider, baseUrl, cost from plexus pricing).
	if (piModelDef) {
		return {
			id: apiModel.id,
			name: apiModel.name ?? piModelDef.name ?? apiModel.id,
			api: piModelDef.api,
			provider: "plexus",
			baseUrl,
			reasoning: piModelDef.reasoning,
			...(piModelDef.thinkingLevelMap && { thinkingLevelMap: piModelDef.thinkingLevelMap }),
			input: piModelDef.input,
			cost: {
				input: parsePrice(apiModel.pricing?.prompt) || piModelDef.cost.input,
				output: parsePrice(apiModel.pricing?.completion) || piModelDef.cost.output,
				cacheRead: parsePrice(apiModel.pricing?.input_cache_read) || piModelDef.cost.cacheRead,
				cacheWrite: parsePrice(apiModel.pricing?.input_cache_write) || piModelDef.cost.cacheWrite,
			},
			contextWindow: piModelDef.contextWindow,
			maxTokens: piModelDef.maxTokens,
			...(piModelDef.compat && { compat: piModelDef.compat }),
		};
	}

	// No pi MODELS match – fall back to parsing the plexus API fields.
	const contextWindow = apiModel.context_length ?? apiModel.top_provider?.context_length ?? DEFAULT_CONTEXT_WINDOW;

	const maxTokens = apiModel.top_provider?.max_completion_tokens ?? contextWindow;

	return {
		id: apiModel.id,
		name: apiModel.name ?? apiModel.id,
		api: mapPreferredApi(apiModel.preferred_api),
		provider: "plexus",
		baseUrl,
		reasoning: inferReasoning(apiModel.supported_parameters),
		input: mapInputModalities(apiModel.architecture),
		cost: {
			input: parsePrice(apiModel.pricing?.prompt),
			output: parsePrice(apiModel.pricing?.completion),
			cacheRead: parsePrice(apiModel.pricing?.input_cache_read),
			cacheWrite: parsePrice(apiModel.pricing?.input_cache_write),
		},
		contextWindow,
		maxTokens,
	};
};

export const fetchPlexusModels = async (
	apiKey: string,
	modelsUrl: string,
): Promise<{ models: PlexusApiModel[]; raw: PlexusApiResponse }> => {
	const response = await fetch(modelsUrl, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Plexus API error: ${response.status} ${response.statusText}`);
	}

	const raw = (await response.json()) as PlexusApiResponse;
	return { models: raw.data ?? [], raw };
};

export const convertModels = (apiModels: PlexusApiModel[], baseUrl: string): PiModel[] => {
	const result: PiModel[] = [];

	for (const apiModel of apiModels) {
		if (!apiModel.id) continue;
		result.push(convertToPiModel(apiModel, baseUrl));
	}

	return result;
};
