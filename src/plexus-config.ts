import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const getConfigDir = (): string => join(getAgentDir(), "extensions", "plexus");
const getConfigPath = (): string => join(getConfigDir(), "config.json");

interface PlexusConfig {
	baseUrl?: string;
	defaultModel?: string;
}

const normalizeRoot = (raw: string): string => raw.replace(/\/+$/, "");

export const getConfigSync = (): PlexusConfig => {
	try {
		if (existsSync(getConfigPath())) {
			return JSON.parse(readFileSync(getConfigPath(), "utf8")) as PlexusConfig;
		}
	} catch {}
	return {};
};

export const saveBaseUrl = async (baseUrl: string, defaultModel?: string): Promise<void> => {
	await mkdir(getConfigDir(), { recursive: true });
	const existing = getConfigSync();
	const config: PlexusConfig = {
		...existing,
		baseUrl: normalizeRoot(baseUrl),
		...(defaultModel !== undefined && { defaultModel }),
	};
	await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

export const getRawBaseUrl = (): string | null => {
	const config = getConfigSync();
	if (config.baseUrl) return config.baseUrl;
	return process.env.PLEXUS_BASE_URL ?? null;
};

export const getModelsUrl = (): string | null => {
	const raw = getRawBaseUrl();
	return raw ? `${normalizeRoot(raw)}/v1/models` : null;
};

export const getBaseUrlSync = (): string | null => {
	const raw = getRawBaseUrl();
	return raw ? `${normalizeRoot(raw)}/v1` : null;
};

// Alias for backward compatibility
export const getBaseUrl = getBaseUrlSync;

export const getDefaultModel = (): string | null => {
	const config = getConfigSync();
	return config.defaultModel ?? null;
};