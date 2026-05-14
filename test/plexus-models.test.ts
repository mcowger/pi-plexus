import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { convertModels, convertToPiModel } from "../src/plexus-models.js";
import type { PlexusApiModel, PlexusApiResponse } from "../src/plexus-models.js";

const BASE_URL = "https://plexus.example.com/v1";

const MODELS_JSON = JSON.parse(readFileSync(join(import.meta.dir, "../models.json"), "utf8")) as PlexusApiResponse;

// ---------------------------------------------------------------------------
// preferred_api mapping
// ---------------------------------------------------------------------------

describe("preferred_api mapping", () => {
	const model = (preferred_api: PlexusApiModel["preferred_api"]): PlexusApiModel => ({
		id: "test-model",
		preferred_api,
	});

	test("chat_completions -> openai-completions", () => {
		expect(convertToPiModel(model("chat_completions"), BASE_URL).api).toBe("openai-completions");
	});

	test("messages -> anthropic-messages", () => {
		expect(convertToPiModel(model("messages"), BASE_URL).api).toBe("anthropic-messages");
	});

	test("responses -> openai-responses", () => {
		expect(convertToPiModel(model("responses"), BASE_URL).api).toBe("openai-responses");
	});

	test("gemini -> google-generative-ai", () => {
		expect(convertToPiModel(model("gemini"), BASE_URL).api).toBe("google-generative-ai");
	});

	test("undefined -> openai-completions", () => {
		expect(convertToPiModel(model(undefined), BASE_URL).api).toBe("openai-completions");
	});

	test("unrecognized string -> openai-completions", () => {
		expect(convertToPiModel(model("grpc"), BASE_URL).api).toBe("openai-completions");
	});

	test("array with recognized value", () => {
		expect(convertToPiModel(model(["messages"]), BASE_URL).api).toBe("anthropic-messages");
	});

	test("array picks first recognized value", () => {
		expect(convertToPiModel(model(["messages", "responses"]), BASE_URL).api).toBe("anthropic-messages");
	});

	test("array with no recognized values -> openai-completions", () => {
		expect(convertToPiModel(model(["grpc", "websocket"]), BASE_URL).api).toBe("openai-completions");
	});
});

// ---------------------------------------------------------------------------
// input modalities
// ---------------------------------------------------------------------------

describe("input modalities", () => {
	const model = (input_modalities: string[]): PlexusApiModel => ({
		id: "test-model",
		architecture: { input_modalities },
	});

	test("text only", () => {
		expect(convertToPiModel(model(["text"]), BASE_URL).input).toEqual(["text"]);
	});

	test("text and image", () => {
		expect(convertToPiModel(model(["text", "image"]), BASE_URL).input).toEqual(["text", "image"]);
	});

	test("file is filtered out, text remains", () => {
		expect(convertToPiModel(model(["text", "image", "file"]), BASE_URL).input).toEqual(["text", "image"]);
	});

	test("audio and video filtered, defaults to text", () => {
		expect(convertToPiModel(model(["audio", "video"]), BASE_URL).input).toEqual(["text"]);
	});

	test("empty modalities defaults to text", () => {
		expect(convertToPiModel(model([]), BASE_URL).input).toEqual(["text"]);
	});

	test("no architecture defaults to text", () => {
		expect(convertToPiModel({ id: "test-model" }, BASE_URL).input).toEqual(["text"]);
	});
});

// ---------------------------------------------------------------------------
// context window fallback chain
// ---------------------------------------------------------------------------

describe("contextWindow", () => {
	test("uses context_length when present", () => {
		const m = convertToPiModel({ id: "m", context_length: 100000 }, BASE_URL);
		expect(m.contextWindow).toBe(100000);
	});

	test("falls back to top_provider.context_length", () => {
		const m = convertToPiModel({ id: "m", context_length: null, top_provider: { context_length: 50000 } }, BASE_URL);
		expect(m.contextWindow).toBe(50000);
	});

	test("falls back to 8192 when both missing", () => {
		const m = convertToPiModel({ id: "m" }, BASE_URL);
		expect(m.contextWindow).toBe(8192);
	});

	test("context_length takes priority over top_provider", () => {
		const m = convertToPiModel({ id: "m", context_length: 200000, top_provider: { context_length: 50000 } }, BASE_URL);
		expect(m.contextWindow).toBe(200000);
	});
});

// ---------------------------------------------------------------------------
// maxTokens fallback chain
// ---------------------------------------------------------------------------

describe("maxTokens", () => {
	test("uses top_provider.max_completion_tokens when present", () => {
		const m = convertToPiModel(
			{ id: "m", context_length: 200000, top_provider: { max_completion_tokens: 64000 } },
			BASE_URL,
		);
		expect(m.maxTokens).toBe(64000);
	});

	test("falls back to contextWindow when max_completion_tokens is null", () => {
		const m = convertToPiModel(
			{ id: "m", context_length: 200000, top_provider: { max_completion_tokens: null } },
			BASE_URL,
		);
		expect(m.maxTokens).toBe(200000);
	});

	test("falls back to contextWindow when top_provider absent", () => {
		const m = convertToPiModel({ id: "m", context_length: 100000 }, BASE_URL);
		expect(m.maxTokens).toBe(100000);
	});
});

// ---------------------------------------------------------------------------
// reasoning inference
// ---------------------------------------------------------------------------

describe("reasoning", () => {
	const model = (supported_parameters: string[]): PlexusApiModel => ({
		id: "test-model",
		supported_parameters,
	});

	test("true when 'reasoning' present", () => {
		expect(convertToPiModel(model(["temperature", "reasoning"]), BASE_URL).reasoning).toBe(true);
	});

	test("true when 'include_reasoning' present", () => {
		expect(convertToPiModel(model(["include_reasoning"]), BASE_URL).reasoning).toBe(true);
	});

	test("true when 'reasoning_effort' present", () => {
		expect(convertToPiModel(model(["reasoning_effort"]), BASE_URL).reasoning).toBe(true);
	});

	test("false when no reasoning params", () => {
		expect(convertToPiModel(model(["temperature", "top_p"]), BASE_URL).reasoning).toBe(false);
	});

	test("false when supported_parameters absent", () => {
		expect(convertToPiModel({ id: "m" }, BASE_URL).reasoning).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

describe("pricing", () => {
	test("parses all four fields", () => {
		const m = convertToPiModel(
			{
				id: "m",
				pricing: {
					prompt: "0.000003",
					completion: "0.000015",
					input_cache_read: "0.0000003",
					input_cache_write: "0.00000375",
				},
			},
			BASE_URL,
		);
		expect(m.cost.input).toBeCloseTo(0.000003);
		expect(m.cost.output).toBeCloseTo(0.000015);
		expect(m.cost.cacheRead).toBeCloseTo(0.0000003);
		expect(m.cost.cacheWrite).toBeCloseTo(0.00000375);
	});

	test("missing pricing fields default to 0", () => {
		const m = convertToPiModel({ id: "m", pricing: {} }, BASE_URL);
		expect(m.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	});

	test("absent pricing defaults to 0", () => {
		const m = convertToPiModel({ id: "m" }, BASE_URL);
		expect(m.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	});

	test("non-numeric string defaults to 0", () => {
		const m = convertToPiModel({ id: "m", pricing: { prompt: "free" } }, BASE_URL);
		expect(m.cost.input).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// name and provider
// ---------------------------------------------------------------------------

describe("name and provider", () => {
	test("uses name when present", () => {
		expect(convertToPiModel({ id: "m", name: "My Model" }, BASE_URL).name).toBe("My Model");
	});

	test("falls back to id when name absent", () => {
		expect(convertToPiModel({ id: "my-model-id" }, BASE_URL).name).toBe("my-model-id");
	});

	test("provider is always plexus", () => {
		expect(convertToPiModel({ id: "m" }, BASE_URL).provider).toBe("plexus");
	});

	test("baseUrl is passed through", () => {
		expect(convertToPiModel({ id: "m" }, BASE_URL).baseUrl).toBe(BASE_URL);
	});
});

// ---------------------------------------------------------------------------
// convertModels
// ---------------------------------------------------------------------------

describe("convertModels", () => {
	test("skips models without id", () => {
		const models = convertModels([{ id: "valid" }, { id: "" } as PlexusApiModel], BASE_URL);
		expect(models).toHaveLength(1);
		expect(models[0].id).toBe("valid");
	});

	test("empty array returns empty array", () => {
		expect(convertModels([], BASE_URL)).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// pi_provider / pi_model MODELS lookup
// ---------------------------------------------------------------------------

describe("pi_provider/pi_model MODELS lookup", () => {
	test("deepseek-v4-flash via pi_provider/pi_model gets full fidelity from MODELS", () => {
		const apiModel: PlexusApiModel = {
			id: "deepseek-v4-flash",
			pi_provider: "deepseek",
			pi_model: "deepseek-v4-flash",
		};
		const m = convertToPiModel(apiModel, BASE_URL);

		// Core fields from pi's curated definition
		expect(m.api).toBe("openai-completions");
		expect(m.reasoning).toBe(true);
		expect(m.input).toEqual(["text"]);
		expect(m.contextWindow).toBe(1000000);
		expect(m.maxTokens).toBe(384000);
		expect(m.name).toBe("DeepSeek V4 Flash");

		// Plexus-specific overrides
		expect(m.id).toBe("deepseek-v4-flash");
		expect(m.provider).toBe("plexus");
		expect(m.baseUrl).toBe(BASE_URL);

		// Compat from pi's definition
		expect(m.compat).toBeDefined();
		expect(m.compat?.thinkingFormat).toBe("deepseek");
		expect(m.compat?.requiresReasoningContentOnAssistantMessages).toBe(true);

		// Thinking level map from pi's definition
		expect(m.thinkingLevelMap).toBeDefined();
		expect(m.thinkingLevelMap?.high).toBe("high");
		expect(m.thinkingLevelMap?.xhigh).toBe("max");
	});

	test("pi_provider/pi_model with price override from plexus pricing", () => {
		const apiModel: PlexusApiModel = {
			id: "deepseek-v4-flash",
			pi_provider: "deepseek",
			pi_model: "deepseek-v4-flash",
			pricing: {
				prompt: "0.10",
				completion: "0.20",
				input_cache_read: "0.001",
				input_cache_write: "0.05",
			},
		};
		const m = convertToPiModel(apiModel, BASE_URL);

		// Plexus pricing takes precedence when present
		expect(m.cost.input).toBeCloseTo(0.1);
		expect(m.cost.output).toBeCloseTo(0.2);
		expect(m.cost.cacheRead).toBeCloseTo(0.001);
		expect(m.cost.cacheWrite).toBeCloseTo(0.05);
	});

	test("pi_provider/pi_model falls back to pi cost when plexus pricing is absent", () => {
		const apiModel: PlexusApiModel = {
			id: "deepseek-v4-flash",
			pi_provider: "deepseek",
			pi_model: "deepseek-v4-flash",
		};
		const m = convertToPiModel(apiModel, BASE_URL);

		// Falls back to pi's curated cost
		expect(m.cost.input).toBe(0.14);
		expect(m.cost.output).toBe(0.28);
		expect(m.cost.cacheRead).toBeCloseTo(0.0028);
		expect(m.cost.cacheWrite).toBe(0);
	});

	test("pi_provider/pi_model with name override from plexus", () => {
		const apiModel: PlexusApiModel = {
			id: "deepseek-v4-flash",
			name: "My Custom DeepSeek",
			pi_provider: "deepseek",
			pi_model: "deepseek-v4-flash",
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		expect(m.name).toBe("My Custom DeepSeek");
	});

	test("pi_provider without pi_model falls back to plexus parsing", () => {
		const apiModel: PlexusApiModel = {
			id: "test-model",
			pi_provider: "deepseek",
			// pi_model missing
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		// No compat from pi since the lookup didn't happen
		expect(m.compat).toBeUndefined();
	});

	test("pi_model without pi_provider falls back to plexus parsing", () => {
		const apiModel: PlexusApiModel = {
			id: "test-model",
			// pi_provider missing
			pi_model: "deepseek-v4-flash",
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		expect(m.compat).toBeUndefined();
	});

	test("unknown pi_provider falls back to plexus parsing", () => {
		const apiModel: PlexusApiModel = {
			id: "test-model",
			pi_provider: "nonexistent-provider",
			pi_model: "some-model",
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		expect(m.compat).toBeUndefined();
		expect(m.reasoning).toBe(false); // plexus fallback default
	});

	test("unknown pi_model under known provider falls back to plexus parsing", () => {
		const apiModel: PlexusApiModel = {
			id: "test-model",
			pi_provider: "deepseek",
			pi_model: "nonexistent-model",
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		expect(m.compat).toBeUndefined();
	});

	test("no pi_provider/pi_model falls back to plexus parsing entirely", () => {
		const apiModel: PlexusApiModel = {
			id: "test-model",
			preferred_api: "chat_completions",
			context_length: 50000,
		};
		const m = convertToPiModel(apiModel, BASE_URL);
		expect(m.api).toBe("openai-completions");
		expect(m.contextWindow).toBe(50000);
		expect(m.compat).toBeUndefined();
		expect(m.thinkingLevelMap).toBeUndefined();
	});

	test("anthropic model via pi_provider/pi_model gets correct api and compat", () => {
		const apiModel: PlexusApiModel = {
			id: "claude-sonnet-4-6",
			pi_provider: "anthropic",
			pi_model: "claude-sonnet-4-6",
		};
		const m = convertToPiModel(apiModel, BASE_URL);

		expect(m.api).toBe("anthropic-messages");
		expect(m.reasoning).toBe(true);
		expect(m.input).toEqual(["text", "image"]);
		expect(m.contextWindow).toBe(1000000);
		expect(m.maxTokens).toBe(64000);
		// Anthropic models don't have compat in their native definition
		expect(m.compat).toBeUndefined();
	});

	test("convertModels mixes pi-looked-up and plexus-parsed models", () => {
		const apiModels: PlexusApiModel[] = [
			{
				id: "deepseek-v4-flash",
				pi_provider: "deepseek",
				pi_model: "deepseek-v4-flash",
			},
			{
				id: "some-other-model",
				preferred_api: "chat_completions",
				context_length: 32000,
			},
		];
		const models = convertModels(apiModels, BASE_URL);

		expect(models).toHaveLength(2);

		// First model: looked up from pi MODELS
		expect(models[0].compat?.thinkingFormat).toBe("deepseek");
		expect(models[0].contextWindow).toBe(1000000);

		// Second model: plexus fallback
		expect(models[1].compat).toBeUndefined();
		expect(models[1].contextWindow).toBe(32000);
	});
});

// ---------------------------------------------------------------------------
// Integration tests against real plexus models.json fixture
// ---------------------------------------------------------------------------

describe("models.json fixture", () => {
	test("converts all 23 models without error", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		expect(models).toHaveLength(23);
	});

	test("all converted models have required fields", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		for (const m of models) {
			expect(m.id).toBeTruthy();
			expect(m.provider).toBe("plexus");
			expect(m.baseUrl).toBe(BASE_URL);
			expect(typeof m.contextWindow).toBe("number");
			expect(typeof m.maxTokens).toBe("number");
			expect(m.contextWindow).toBeGreaterThan(0);
			expect(m.maxTokens).toBeGreaterThan(0);
			expect(Array.isArray(m.input)).toBe(true);
			expect(m.input.length).toBeGreaterThan(0);
		}
	});

	test("deepseek-v4-flash gets full fidelity from pi MODELS via pi_provider/pi_model", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const ds = models.find((m) => m.id === "deepseek-v4-flash");
		expect(ds).toBeDefined();

		// From pi's curated definition
		expect(ds?.api).toBe("openai-completions");
		expect(ds?.reasoning).toBe(true);
		expect(ds?.input).toEqual(["text"]);
		expect(ds?.contextWindow).toBe(1000000);
		expect(ds?.maxTokens).toBe(384000);

		// Compat from pi
		expect(ds?.compat?.thinkingFormat).toBe("deepseek");
		expect(ds?.compat?.requiresReasoningContentOnAssistantMessages).toBe(true);

		// ThinkingLevelMap from pi
		expect(ds?.thinkingLevelMap?.high).toBe("high");
		expect(ds?.thinkingLevelMap?.xhigh).toBe("max");

		// Plexus overrides
		expect(ds?.provider).toBe("plexus");
		expect(ds?.baseUrl).toBe(BASE_URL);
	});

	test("claude-haiku-4-5 gets anthropic-messages api from pi MODELS", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const haiku = models.find((m) => m.id === "claude-haiku-4-5");
		expect(haiku).toBeDefined();
		expect(haiku?.api).toBe("anthropic-messages");
		expect(haiku?.reasoning).toBe(true);
		expect(haiku?.input).toContain("image");
	});

	test("claude-sonnet-4-6 (no pi_provider) uses plexus fallback", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const sonnet = models.find((m) => m.id === "claude-sonnet-4-6");
		expect(sonnet).toBeDefined();
		// No pi_provider/pi_model, so no compat from pi
		expect(sonnet?.compat).toBeUndefined();
		expect(sonnet?.thinkingLevelMap).toBeUndefined();
		// But plexus fields still work
		expect(sonnet?.contextWindow).toBe(1000000);
	});

	test("qwen3.5-plus-02-15 (sparse model) gets safe defaults from plexus fallback", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const sparse = models.find((m) => m.id === "qwen3.5-plus-02-15");
		expect(sparse).toBeDefined();
		expect(sparse?.contextWindow).toBe(8192);
		expect(sparse?.maxTokens).toBe(8192);
		expect(sparse?.input).toEqual(["text"]);
		expect(sparse?.reasoning).toBe(false);
		expect(sparse?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	});

	test("small-fast has no reasoning", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const m = models.find((m) => m.id === "small-fast");
		expect(m?.reasoning).toBe(false);
	});

	test("models with pi_provider/pi_model have compat; others don't", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const withCompat = models.filter((m) => m.compat);
		const _withoutCompat = models.filter((m) => !m.compat);

		// Only deepseek-v4-flash has pi_provider/pi_model pointing to a compat-bearing model
		const compatIds = withCompat.map((m) => m.id).sort();
		expect(compatIds).toContain("deepseek-v4-flash");

		// claude-haiku-4-5 has pi_provider but anthropic models don't have compat
		// so it won't appear here, which is correct
		expect(compatIds).not.toContain("claude-haiku-4-5");
	});
});
