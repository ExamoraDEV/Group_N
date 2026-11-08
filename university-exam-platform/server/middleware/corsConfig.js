const cors = require("cors");

const PRODUCTION_CLIENT_ORIGIN = "https://examoradev.github.io";

function normalizeOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === "production") return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function createCorsOptions(env = process.env) {
  const allowedOrigins = new Set(
    [PRODUCTION_CLIENT_ORIGIN, normalizeOrigin(env.CLIENT_ORIGIN)].filter(Boolean)
  );

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isLocalDevelopmentOrigin(origin, env.NODE_ENV)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
  };
}

module.exports = { PRODUCTION_CLIENT_ORIGIN, createCorsOptions, normalizeOrigin, isLocalDevelopmentOrigin, cors };
