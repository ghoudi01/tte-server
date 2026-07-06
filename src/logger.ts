const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

type Level = "debug" | "info" | "warn" | "error";

const levels: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = levels[LOG_LEVEL as Level] ?? levels.info;

function timestamp(): string {
  return new Date().toISOString();
}

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (levels[level] < currentLevel) return;
  const entry = { time: timestamp(), level, msg, ...meta };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
