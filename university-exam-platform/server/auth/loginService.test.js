const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { authenticateCredentials, validLoginInput } = require("./loginService");

async function fixture(user) {
  const passwordHash = user ? await bcrypt.hash("correct-test-password", 4) : null;
  const storedUser = user ? { isActive: true, password: passwordHash, ...user } : null;
  let query;
  let selected;
  const User = { findOne(value) { query = value; return { select(valueToSelect) { selected = valueToSelect; return Promise.resolve(storedUser); } }; } };
  return { User, getQuery: () => query, getSelected: () => selected };
}

test("validates missing credentials before any account lookup", async () => {
  assert.equal(validLoginInput("", "secret"), false);
  assert.equal(validLoginInput("student@university.edu", ""), false);
  const f = await fixture(null);
  assert.equal(await authenticateCredentials({ ...f, bcrypt, email: "", password: "x", env: {} }), null);
  assert.equal(f.getQuery(), undefined);
});

test("existing student plus correct bcrypt password resolves student destination", async () => {
  const f = await fixture({ email: "22STD001@university.edu", role: "student" });
  const result = await authenticateCredentials({ ...f, bcrypt, email: "  22STD001@UNIVERSITY.EDU ", password: "correct-test-password", env: {} });
  assert.equal(result.redirectPath, "/student/dashboard");
  assert.equal(f.getQuery().email, "22std001@university.edu");
  assert.equal(f.getQuery().isActive, undefined);
  assert.equal(f.getSelected(), "+password");
});

test("existing lecturer plus correct bcrypt password resolves lecturer destination", async () => {
  const f = await fixture({ email: "lec001@university.edu", role: "lecturer" });
  const result = await authenticateCredentials({ ...f, bcrypt, email: "LEC001@university.edu", password: "correct-test-password", env: {} });
  assert.equal(result.redirectPath, "/lecturer/dashboard");
});

test("rejects wrong passwords and unknown accounts", async () => {
  const f = await fixture({ email: "22STD001@university.edu", role: "student" });
  assert.equal(await authenticateCredentials({ ...f, bcrypt, email: "22STD001@university.edu", password: "wrong-password", env: {} }), null);
  const absent = await fixture(null);
  assert.equal(await authenticateCredentials({ ...absent, bcrypt, email: "22STD999@university.edu", password: "correct-test-password", env: {} }), null);
});

test("rejects role and email-prefix mismatches even with a correct password", async () => {
  const studentEmailLecturerRole = await fixture({ email: "22STD001@university.edu", role: "lecturer" });
  const lecturerEmailStudentRole = await fixture({ email: "lec001@university.edu", role: "student" });
  const credentials = { bcrypt, password: "correct-test-password", env: {} };
  assert.equal(await authenticateCredentials({ ...studentEmailLecturerRole, ...credentials, email: "22STD001@university.edu" }), null);
  assert.equal(await authenticateCredentials({ ...lecturerEmailStudentRole, ...credentials, email: "lec001@university.edu" }), null);
});

test("rejects inactive users", async () => {
  const f = await fixture({ email: "22STD001@university.edu", role: "student", isActive: false });
  assert.deepEqual(await authenticateCredentials({ ...f, bcrypt, email: "22STD001@university.edu", password: "correct-test-password", env: {} }), { deactivated: true });
});

test("valid credentials for an explicitly deactivated account return no session user", async () => {
  const f = await fixture({ email: "22STD001@university.edu", role: "student", isDeactivated: true });
  assert.deepEqual(await authenticateCredentials({ ...f, bcrypt, email: "22STD001@university.edu", password: "correct-test-password", env: {} }), { deactivated: true });
  assert.equal(await authenticateCredentials({ ...f, bcrypt, email: "22STD001@university.edu", password: "wrong-password", env: {} }), null);
});

test("configured Admin can authenticate only for the Admin portal", async () => {
  const f = await fixture({ email: "admin001@university.edu", role: "admin" });
  const result = await authenticateCredentials({ ...f, bcrypt, email: "ADMIN001@university.edu", password: "correct-test-password", env: {} });
  assert.equal(result.redirectPath, "/admin/dashboard");
});
