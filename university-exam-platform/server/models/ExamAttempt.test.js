const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const ExamAttempt = require("./ExamAttempt");

test("exam attempts persist flags and allowed browser review events", async () => {
  const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const attempt = new ExamAttempt({
    student: ids[0], exam: ids[1], status: "in_progress", startedAt: new Date(), deadlineAt: new Date(Date.now() + 60000),
    answers: [{ question: ids[2], questionSnapshot: { text: "Q" }, response: "answer" }],
    flaggedQuestions: [ids[2]],
    browserActivity: [{ type: "fullscreen_exit", occurredAt: new Date(), dedupeKey: "fullscreen_exit:test" }],
  });
  await attempt.validate();
  assert.equal(String(attempt.flaggedQuestions[0]), String(ids[2]));
  assert.equal(attempt.browserActivity[0].type, "fullscreen_exit");
});

test("exam attempts reject unsupported browser event types", async () => {
  const ids = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId());
  const attempt = new ExamAttempt({
    student: ids[0], exam: ids[1], status: "in_progress", startedAt: new Date(), deadlineAt: new Date(Date.now() + 60000),
    answers: [{ question: ids[2], questionSnapshot: { text: "Q" } }],
    browserActivity: [{ type: "screenshot_detected", occurredAt: new Date(), dedupeKey: "unsupported" }],
  });
  await assert.rejects(attempt.validate(), /browserActivity/);
});
