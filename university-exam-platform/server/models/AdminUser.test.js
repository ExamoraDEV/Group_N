const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("./User");

test("User schema supports a secure Admin account and account lifecycle metadata", async () => {
  const admin = new User({ name: "Examora Administrator", email: "admin001@university.edu", role: "admin", password: "bcrypt-hash-value" });
  await admin.validate();
  assert.equal(admin.isActive, true);
  assert.equal(admin.isDeactivated, false);
  assert.equal(admin.lastLoginAt, null);
  assert.equal(User.schema.path("password").options.select, false);
});

test("User schema rejects unsupported account roles", async () => {
  const invalid = new User({ name: "Unauthorized", email: "other@university.edu", role: "superadmin", password: "hash" });
  await assert.rejects(invalid.validate(), /role/);
});
