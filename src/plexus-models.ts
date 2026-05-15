import { getModel } from "@earendil-works/pi-ai";
import type {
	Api,
	Model,
	OpenAICompletionsCompat,
	OpenAIResponsesCompat,
	AnthropicMessagesCompat,
} from "@earendil-works/pi-ai";

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

/**
 * Detect OpenAI completions compat settings from the provider and baseUrl of a
 * pi model definition. This mirrors the internal detectCompat() in pi's
 * openai-completions provider so that we can produce a fully-resolved compat
 * object for plexus-proxied models.
 *
 * Without this, providers like deepseek that are proxied through plexus won't
 * get the correct implied compat (e.g. supportsDeveloperRole: false) because
 * pi's runtime auto-detection checks model.provider and model.baseUrl, which
 * are "plexus" and the plexus URL — not the original provider.
 */
const detectOpenAICompletionsCompat = (piModel: Model<Api>): OpenAICompletionsCompat => {
	const provider = piModel.provider;
	const baseUrl = piModel.baseUrl;

	const isZai = provider === "zai" || baseUrl.includes("api.z.ai");
	const isMoonshot = provider === "moonshotai" || provider === "moonshotai-cn" || baseUrl.includes("api.moonshot.");
	const isCloudflareWorkersAI = provider === "cloudflare-workers-ai" || baseUrl.includes("api.cloudflare.com");
	const isCloudflareAiGateway = provider === "cloudflare-ai-gateway" || baseUrl.includes("gateway.ai.cloudflare.com");
	const isNonStandard =
		provider === "cerebras" ||
		baseUrl.includes("cerebras.ai") ||
		provider === "xai" ||
		baseUrl.includes("api.x.ai") ||
		baseUrl.includes("chutes.ai") ||
		baseUrl.includes("deepseek.com") ||
		isZai ||
		isMoonshot ||
		provider === "opencode" ||
		baseUrl.includes("opencode.ai") ||
		isCloudflareWorkersAI ||
		isCloudflareAiGateway;
	const useMaxTokens = baseUrl.includes("chutes.ai") || isMoonshot || isCloudflareAiGateway;
	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
	const isDeepSeek = provider === "deepseek" || baseUrl.includes("deepseek.com");
	const cacheControlFormat = provider === "openrouter" && piModel.id.startsWith("anthropic/") ? "anthropic" : undefined;

	const detected: OpenAICompletionsCompat = {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: !isNonStandard,
		supportsReasoningEffort: !isGrok && !isZai && !isMoonshot && !isCloudflareAiGateway,
		supportsUsageInStreaming: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: isDeepSeek,
		thinkingFormat: isDeepSeek
			? "deepseek"
			: isZai
				? "zai"
				: provider === "openrouter" || baseUrl.includes("openrouter.ai")
					? "openrouter"
					: "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		zaiToolStream: false,
		supportsStrictMode: !isMoonshot && !isCloudflareAiGateway,
		cacheControlFormat,
		sendSessionAffinityHeaders: false,
		supportsLongCacheRetention: !(isCloudflareWorkersAI || isCloudflareAiGateway),
	};

	return detected;
};

/**
 * Resolve a fully-specified compat object for a plexus-proxied model by
 * merging the pi model's stored compat overrides onto the detected defaults
 * from the pi model's original provider/baseUrl.
 *
 * This produces the same result that pi's getCompat() would compute for the
 * original model, ensuring that implied compat fields (like
 * supportsDeveloperRole: false for deepseek) are correct even though the
 * plexus model has provider="plexus" and a plexus baseUrl.
 */
const resolveCompat = (
	piModel: Model<Api>,
): OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat | undefined => {
	if (piModel.api === "openai-completions") {
		const detected = detectOpenAICompletionsCompat(piModel);
		const overrides = piModel.compat as OpenAICompletionsCompat | undefined;
		if (!overrides) return detected;
		return {
			supportsStore: overrides.supportsStore ?? detected.supportsStore,
			supportsDeveloperRole: overrides.supportsDeveloperRole ?? detected.supportsDeveloperRole,
			supportsReasoningEffort: overrides.supportsReasoningEffort ?? detected.supportsReasoningEffort,
			supportsUsageInStreaming: overrides.supportsUsageInStreaming ?? detected.supportsUsageInStreaming,
			maxTokensField: overrides.maxTokensField ?? detected.maxTokensField,
			requiresToolResultName: overrides.requiresToolResultName ?? detected.requiresToolResultName,
			requiresAssistantAfterToolResult:
				overrides.requiresAssistantAfterToolResult ?? detected.requiresAssistantAfterToolResult,
			requiresThinkingAsText: overrides.requiresThinkingAsText ?? detected.requiresThinkingAsText,
			requiresReasoningContentOnAssistantMessages:
				overrides.requiresReasoningContentOnAssistantMessages ?? detected.requiresReasoningContentOnAssistantMessages,
			thinkingFormat: overrides.thinkingFormat ?? detected.thinkingFormat,
			openRouterRouting: overrides.openRouterRouting ?? detected.openRouterRouting,
			vercelGatewayRouting: overrides.vercelGatewayRouting ?? detected.vercelGatewayRouting,
			zaiToolStream: overrides.zaiToolStream ?? detected.zaiToolStream,
			supportsStrictMode: overrides.supportsStrictMode ?? detected.supportsStrictMode,
			cacheControlFormat: overrides.cacheControlFormat ?? detected.cacheControlFormat,
			sendSessionAffinityHeaders: overrides.sendSessionAffinityHeaders ?? detected.sendSessionAffinityHeaders,
			supportsLongCacheRetention: overrides.supportsLongCacheRetention ?? detected.supportsLongCacheRetention,
		};
	}

	// For other APIs, fall back to the stored compat as-is.
	// At runtime, pi's provider will still merge with detected defaults,
	// but the plexus baseUrl won't match any known provider patterns,
	// so defaults are generally safe for anthropic-messages and openai-responses.
	return piModel.compat;
};

const adjustBaseUrl = (baseUrl: string, api: Api): string => {
	if (api === "anthropic-messages") {
		return baseUrl.replace(/\/v1\/?$/, "");
	}
	return baseUrl;
};

export const convertToPiModel = (apiModel: PlexusApiModel, baseUrl: string): PiModel => {
	const piModelDef = lookupPiModel(apiModel.pi_provider, apiModel.pi_model);

	// When pi's MODELS has this model, use its curated definition for maximum fidelity,
	// overriding with plexus-specific fields (id, provider, baseUrl, cost from plexus pricing).
	if (piModelDef) {
		const resolvedCompat = resolveCompat(piModelDef);
		return {
			id: apiModel.id,
			name: apiModel.name ?? piModelDef.name ?? apiModel.id,
			api: piModelDef.api,
			provider: "plexus",
			baseUrl: adjustBaseUrl(baseUrl, piModelDef.api),
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
			...(resolvedCompat && { compat: resolvedCompat }),
		};
	}

	// No pi MODELS match – fall back to parsing the plexus API fields.
	const contextWindow = apiModel.context_length ?? apiModel.top_provider?.context_length ?? DEFAULT_CONTEXT_WINDOW;

	const maxTokens = apiModel.top_provider?.max_completion_tokens ?? contextWindow;
	const fallbackApi = mapPreferredApi(apiModel.preferred_api);

	return {
		id: apiModel.id,
		name: apiModel.name ?? apiModel.id,
		api: fallbackApi,
		provider: "plexus",
		baseUrl: adjustBaseUrl(baseUrl, fallbackApi),
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
