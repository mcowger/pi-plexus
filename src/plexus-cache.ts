import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { PlexusApiResponse } from "./plexus-models.js";
import type { PiModel } from "./plexus-models.js";

const getCacheDir = (): string => join(getAgentDir(), "extensions", "plexus");

const getModelsCachePath = (): string => join(getCacheDir(), "plexus-models-cache.json");

const getResponseCachePath = (): string => join(getCacheDir(), "plexus-models-response.json");

interface ModelCache {
	models: PiModel[];
	timestamp: number;
}

export const readCachedModels = async (): Promise<ModelCache | null> => {
	try {
		const content = await readFile(getModelsCachePath(), "utf8");
		const cache = JSON.parse(content) as ModelCache;
		if (!Array.isArray(cache.models)) return null;
		return cache;
	} catch {
		return null;
	}
};

export const readCachedModelsSync = (): ModelCache | null => {
	try {
		const path = getModelsCachePath();
		if (!existsSync(path)) return null;
		const content = readFileSync(path, "utf8");
		const cache = JSON.parse(content) as ModelCache;
		if (!Array.isArray(cache.models)) return null;
		return cache;
	} catch {
		return null;
	}
};

export const writeCachedModels = async (models: PiModel[]): Promise<void> => {
	const cache: ModelCache = { models, timestamp: Date.now() };
	await mkdir(getCacheDir(), { recursive: true });
	await writeFile(getModelsCachePath(), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
};

export const writeRawResponse = async (data: PlexusApiResponse): Promise<void> => {
	await mkdir(getCacheDir(), { recursive: true });
	await writeFile(getResponseCachePath(), `${JSON.stringify(data, null, 2)}\n`, "utf8");
};
