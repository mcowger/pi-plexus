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

	test("converts all 30 models from models.json without error", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		expect(models).toHaveLength(30);
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

	test("claude-haiku-4-5 maps to anthropic-messages", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const haiku = models.find((m) => m.id === "claude-haiku-4-5");
		expect(haiku?.api).toBe("anthropic-messages");
	});

	test("gpt-5.4 maps to openai-responses", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const gpt = models.find((m) => m.id === "gpt-5.4");
		expect(gpt?.api).toBe("openai-responses");
	});

	test("deepseek-v4-flash maps to openai-completions", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const ds = models.find((m) => m.id === "deepseek-v4-flash");
		expect(ds?.api).toBe("openai-completions");
	});

	test("sparse model (qwen3.5-plus-02-15) gets safe defaults", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const sparse = models.find((m) => m.id === "qwen3.5-plus-02-15");
		expect(sparse).toBeDefined();
		expect(sparse?.contextWindow).toBe(8192);
		expect(sparse?.maxTokens).toBe(8192);
		expect(sparse?.input).toEqual(["text"]);
		expect(sparse?.reasoning).toBe(false);
		expect(sparse?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	});

	test("claude-sonnet-4-6 has image input and correct context", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const sonnet = models.find((m) => m.id === "claude-sonnet-4-6");
		expect(sonnet?.input).toContain("image");
		expect(sonnet?.contextWindow).toBe(1000000);
		expect(sonnet?.maxTokens).toBe(128000);
	});

	test("small-fast has no reasoning (no reasoning params)", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		const m = models.find((m) => m.id === "small-fast");
		expect(m?.reasoning).toBe(false);
	});

	test("gemini models filter out non-text/image modalities", () => {
		const models = convertModels(MODELS_JSON.data, BASE_URL);
		for (const m of models) {
			expect(m.input.every((i) => i === "text" || i === "image")).toBe(true);
		}
	});
});
