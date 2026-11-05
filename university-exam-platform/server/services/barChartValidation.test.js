const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBarResponse } = require("./barChartValidation");

test("normalizes chart drafts while retaining incomplete rows for autosave", () => {
  const result = normalizeBarResponse([{ category: "Colombo", value: "50" }, { category: "", value: "" }]);
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ category: "Colombo", value: 50 }, { category: "", value: "" }]);
});

test("requires complete unique chart bars for submission", () => {
  assert.match(normalizeBarResponse([{ category: "Colombo", value: "" }], false, { submitting: true }).error, /Complete or remove/);
  assert.match(normalizeBarResponse([{ category: "Colombo", value: 2 }, { category: " colombo ", value: 3 }], false, { submitting: true }).error, /unique/);
  assert.deepEqual(normalizeBarResponse([], false, { submitting: true }), { data: [], error: null });
});

test("enforces chart negative-value setting on draft and submission data", () => {
  assert.match(normalizeBarResponse([{ category: "Loss", value: -3 }]).error, /non-negative/);
  assert.deepEqual(normalizeBarResponse([{ category: "Loss", value: -3 }], true).data, [{ category: "Loss", value: -3 }]);
});
