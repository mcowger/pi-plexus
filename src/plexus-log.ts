import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const getLogPath = (): string => join(getAgentDir(), "extensions", "plexus", "plexus.log");

const getCacheDir = (): string => join(getAgentDir(), "extensions", "plexus");

export const log = (message: string, data?: Record<string, unknown>): void => {
	try {
		mkdirSync(getCacheDir(), { recursive: true });
		const line = `${new Date().toISOString()} ${message}${data ? ` ${JSON.stringify(data)}` : ""}\n`;
		appendFileSync(getLogPath(), line, "utf8");
	} catch {
		// never throw from logging
	}
};
