import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface AuthJson {
	plexus?: {
		type: string;
		key?: string;
		baseUrl?: string;
	};
	[key: string]: unknown;
}

const readAuthJson = async (): Promise<AuthJson | null> => {
	try {
		const authPath = join(getAgentDir(), "auth.json");
		const content = await readFile(authPath, "utf8");
		return JSON.parse(content) as AuthJson;
	} catch {
		return null;
	}
};

export const getApiKey = async (): Promise<string | null> => {
	const auth = await readAuthJson();
	if (auth?.plexus?.type === "api_key" && auth.plexus.key) {
		return auth.plexus.key;
	}
	return process.env.PLEXUS_API_KEY ?? null;
};

export const getRawBaseUrl = async (): Promise<string | null> => {
	const auth = await readAuthJson();
	if (auth?.plexus?.baseUrl) {
		return auth.plexus.baseUrl;
	}
	return process.env.PLEXUS_BASE_URL ?? null;
};

const normalizeRoot = (raw: string): string => raw.replace(/\/+$/, "");

export const getBaseUrl = async (): Promise<string | null> => {
	const raw = await getRawBaseUrl();
	if (!raw) return null;
	return `${normalizeRoot(raw)}/v1`;
};

export const getModelsUrl = async (): Promise<string | null> => {
	const raw = await getRawBaseUrl();
	if (!raw) return null;
	return `${normalizeRoot(raw)}/v1/models`;
};

export const getBaseUrlSync = (): string | null => {
	const raw = process.env.PLEXUS_BASE_URL ?? null;
	if (!raw) return null;
	return `${normalizeRoot(raw)}/v1`;
};
