const test = require("node:test");
const assert = require("node:assert/strict");
const { studentExamState } = require("./studentExamState");

const now = new Date("2026-10-30T05:00:00.000Z");
const exam = { startsAt: new Date("2026-10-30T06:00:00.000Z"), endsAt: new Date("2026-10-30T07:00:00.000Z") };

test("classifies future eligible exams as upcoming", () => {
  assert.equal(studentExamState(exam, null, now), "upcoming");
});

test("classifies open exam windows as ongoing before and after attempt creation", () => {
  const openExam = { startsAt: new Date("2026-10-30T04:00:00.000Z"), endsAt: new Date("2026-10-30T07:00:00.000Z") };
  assert.equal(studentExamState(openExam, null, now), "ongoing");
  assert.equal(studentExamState(openExam, { status: "in_progress", deadlineAt: "2026-10-30T05:30:00.000Z" }, now), "ongoing");
});

test("a submitted attempt is completed independent of the exam end time", () => {
  assert.equal(studentExamState(exam, { status: "submitted" }, now), "completed");
});

test("expired and unattempted exams outside their window are missed, not completed", () => {
  const endedExam = { startsAt: new Date("2026-10-30T03:00:00.000Z"), endsAt: new Date("2026-10-30T04:00:00.000Z") };
  assert.equal(studentExamState(endedExam, null, now), "missed");
  assert.equal(studentExamState(endedExam, { status: "expired" }, now), "missed");
  assert.equal(studentExamState(endedExam, { status: "in_progress", deadlineAt: "2026-10-30T04:00:00.000Z" }, now), "missed");
});
