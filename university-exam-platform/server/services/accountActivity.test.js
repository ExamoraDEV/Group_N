const test = require("node:test");
const assert = require("node:assert/strict");
const { activityStatus } = require("./accountActivity");

test("account activity uses the rolling 30-day last-login threshold and keeps deactivation separate", () => {
  const now = new Date("2026-11-05T00:00:00.000Z");
  assert.equal(activityStatus({ isActive: true, lastLoginAt: new Date("2026-10-20T00:00:00.000Z") }, now), "active");
  assert.equal(activityStatus({ isActive: true, lastLoginAt: new Date("2026-09-01T00:00:00.000Z") }, now), "inactive");
  assert.equal(activityStatus({ isActive: true, lastLoginAt: null }, now), "never_logged_in");
  assert.equal(activityStatus({ isActive: true, isDeactivated: true, lastLoginAt: new Date("2026-11-04T00:00:00.000Z") }, now), "deactivated");
});
