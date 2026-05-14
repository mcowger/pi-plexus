import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const getConfigDir = (): string => join(getAgentDir(), "extensions", "plexus");
const getConfigPath = (): string => join(getConfigDir(), "config.json");

interface PlexusConfig {
	baseUrl?: string;
}

const normalizeRoot = (raw: string): string => raw.replace(/\/+$/, "");

export const saveBaseUrl = async (baseUrl: string): Promise<void> => {
	await mkdir(getConfigDir(), { recursive: true });
	const config: PlexusConfig = { baseUrl: normalizeRoot(baseUrl) };
	await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

export const getRawBaseUrl = (): string | null => {
	try {
		if (existsSync(getConfigPath())) {
			const config = JSON.parse(readFileSync(getConfigPath(), "utf8")) as PlexusConfig;
			if (config.baseUrl) return config.baseUrl;
		}
	} catch {}
	return process.env.PLEXUS_BASE_URL ?? null;
};

export const getBaseUrl = (): string | null => {
	const raw = getRawBaseUrl();
	return raw ? `${normalizeRoot(raw)}/v1` : null;
};

export const getModelsUrl = (): string | null => {
	const raw = getRawBaseUrl();
	return raw ? `${normalizeRoot(raw)}/v1/models` : null;
};

export const getBaseUrlSync = (): string | null => getBaseUrl();
