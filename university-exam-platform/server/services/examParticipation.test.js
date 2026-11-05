const test = require("node:test");
const assert = require("node:assert/strict");
const { buildParticipation } = require("./examParticipation");

const student = (id, extra = {}) => ({ _id: id, name: `Student ${id}`, ...extra });
const attempt = (id, userId, status, startedAt, extra = {}) => ({ _id: id, student: userId, status, startedAt: new Date(startedAt), ...extra });

test("participation counts eligible students once and classifies in-progress and submitted attempts", () => {
  const result = buildParticipation({
    exam: { _id: "exam1" },
    students: [student("s1"), student("s2"), student("s3")],
    attempts: [
      attempt("a1", "s1", "submitted", "2026-01-01", { evaluationStatus: "finalized", submittedAt: new Date("2026-01-01") }),
      attempt("a2", "s1", "in_progress", "2026-02-01"),
      attempt("a3", "s2", "in_progress", "2026-01-03"),
      attempt("outside", "not-eligible", "submitted", "2026-01-04"),
    ],
  });

  assert.deepEqual({ totalEligible: result.summary.totalEligible, attempted: result.summary.attempted, notAttempted: result.summary.notAttempted, submitted: result.summary.submitted }, { totalEligible: 3, attempted: 2, notAttempted: 1, submitted: 1 });
  assert.ok(Math.abs(result.summary.submissionRate - 100 / 3) < 1e-10);
  assert.equal(result.attemptedStudents.find((item) => item._id === "s1").attemptStatus, "in_progress");
  assert.equal(result.attemptedStudents.find((item) => item._id === "s1").evaluationStatus, null);
  assert.deepEqual(result.notAttemptedStudents.map((item) => item._id), ["s3"]);
});

test("submission rate is zero when no active eligible students exist", () => {
  const result = buildParticipation({ exam: {}, students: [], attempts: [] });
  assert.deepEqual(result.summary, { totalEligible: 0, attempted: 0, notAttempted: 0, submitted: 0, submissionRate: 0 });
});
