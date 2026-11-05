const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { requireAuth, requireRole } = require("./auth");

function responseStub() {
  return {
    statusCode: 200,
    payload: null,
    clearedCookie: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    clearCookie(name) { this.clearedCookie = name; return this; },
  };
}

test("student is denied lecturer-only backend access", () => {
  const response = responseStub();
  let nextCalled = false;
  requireRole("lecturer")({ user: { role: "student" } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("lecturer is denied student-only backend access", () => {
  const response = responseStub();
  let nextCalled = false;
  requireRole("student")({ user: { role: "lecturer" } }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("matching database role passes role middleware", () => {
  let nextCalled = false;
  const response = responseStub();
  requireRole("student")({ user: { role: "student" } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("Admin-only role middleware denies student and lecturer sessions", () => {
  for (const role of ["student", "lecturer"]) {
    let nextCalled = false;
    const response = responseStub();
    requireRole("admin")({ user: { role } }, response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalled, false);
  }
});

test("a previously issued session is rejected after the account is deactivated", async () => {
  const oldSecret = process.env.JWT_SECRET;
  const secret = "test-only-jwt-secret-that-is-long-enough-0003";
  const findById = User.findById;
  process.env.JWT_SECRET = secret;
  User.findById = () => ({ select: async () => ({ _id: "507f1f77bcf86cd799439011", email: "22STD001@university.edu", role: "student", isActive: true, isDeactivated: true }) });
  try {
    const token = jwt.sign({ sub: "507f1f77bcf86cd799439011" }, secret, { algorithm: "HS256" });
    const response = responseStub();
    await requireAuth({ cookies: { examora_session: token } }, response, () => assert.fail("next must not run"));
    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.code, "ACCOUNT_DEACTIVATED");
    assert.equal(response.clearedCookie, "examora_session");
  } finally {
    User.findById = findById;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test("missing session is rejected before database access", async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-only-jwt-secret-that-is-long-enough-0001";
  try {
    const response = responseStub();
    await requireAuth({ cookies: {} }, response, () => assert.fail("next must not run"));
    assert.equal(response.statusCode, 401);
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test("invalid or expired JWT is rejected and its cookie cleared", async () => {
  const oldSecret = process.env.JWT_SECRET;
  const secret = "test-only-jwt-secret-that-is-long-enough-0002";
  process.env.JWT_SECRET = secret;
  try {
    const expiredToken = jwt.sign({ sub: "507f1f77bcf86cd799439011" }, secret, { expiresIn: -1, algorithm: "HS256" });
    const response = responseStub();
    await requireAuth({ cookies: { examora_session: expiredToken } }, response, () => assert.fail("next must not run"));
    assert.equal(response.statusCode, 401);
    assert.equal(response.clearedCookie, "examora_session");
  } finally {
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
