const test = require("node:test");
const assert = require("node:assert/strict");
const { PRODUCTION_CLIENT_ORIGIN, createCorsOptions, normalizeOrigin, cors } = require("./corsConfig");
const { createCookieOptions } = require("./auth");

function checkOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed));
  });
}

test("allows the exact GitHub Pages production origin with credentials", async () => {
  const options = createCorsOptions({ NODE_ENV: "production" });
  assert.equal(PRODUCTION_CLIENT_ORIGIN, "https://examoradev.github.io");
  assert.equal(options.credentials, true);
  assert.equal(await checkOrigin(options, PRODUCTION_CLIENT_ORIGIN), true);
});

test("normalizes a configured client URL to its browser origin", async () => {
  const options = createCorsOptions({ NODE_ENV: "production", CLIENT_ORIGIN: "https://school.example/app/" });
  assert.equal(await checkOrigin(options, "https://school.example"), true);
  assert.equal(normalizeOrigin("not a URL"), null);
});

test("allows localhost only outside production and rejects unrelated origins", async () => {
  const development = createCorsOptions({ NODE_ENV: "development" });
  const production = createCorsOptions({ NODE_ENV: "production" });
  assert.equal(await checkOrigin(development, "http://localhost:5173"), true);
  assert.equal(await checkOrigin(development, "http://127.0.0.1:5174"), true);
  await assert.rejects(checkOrigin(production, "http://localhost:5173"), /Origin is not allowed/);
  await assert.rejects(checkOrigin(production, "https://untrusted.example"), /Origin is not allowed/);
});

test("production and development session cookies use matching safe attributes", () => {
  const production = createCookieOptions({ NODE_ENV: "production" });
  const development = createCookieOptions({ NODE_ENV: "development" });
  assert.deepEqual(
    { httpOnly: production.httpOnly, secure: production.secure, sameSite: production.sameSite, path: production.path, maxAge: production.maxAge },
    { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 8 * 60 * 60 * 1000 }
  );
  assert.equal(development.secure, false);
  assert.equal(development.sameSite, "lax");
});

test("credentialed JSON preflight returns the production allow-origin headers", async (t) => {
  const request = {
    method: "OPTIONS",
    headers: {
      origin: PRODUCTION_CLIENT_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  };
  const responseHeaders = new Map();
  const response = {
    statusCode: 200,
    setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value); },
    getHeader(name) { return responseHeaders.get(name.toLowerCase()); },
    end() { this.ended = true; },
  };
  let nextCalled = false;
  cors(createCorsOptions({ NODE_ENV: "production" }))(request, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 204);
  assert.equal(responseHeaders.get("access-control-allow-origin"), PRODUCTION_CLIENT_ORIGIN);
  assert.equal(responseHeaders.get("access-control-allow-credentials"), "true");
  assert.match(responseHeaders.get("access-control-allow-methods"), /POST/);
  assert.equal(response.ended, true);
  assert.equal(nextCalled, false);
});
