const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateWeightedScore, selectLatestEligibleResults, buildStudentPerformance } = require("./performanceAnalytics");
const { rankStudents } = require("./performanceRanking");

const student = { _id: "student-1", role: "student", isActive: true, name: "Student One" };
const exam = (id) => ({ _id: id, status: "published", eligibleStudents: [student._id] });
const result = ({ examId, obtained, maximum, submittedAt, publishedAt = submittedAt, status = "finalized", evaluationFinalizedAt = submittedAt, studentDoc = student }) => ({
  student: studentDoc,
  exam: exam(examId),
  isPublished: true,
  marksObtained: obtained,
  maximumMarks: maximum,
  publishedAt: new Date(publishedAt),
  attempt: { student: student._id, exam: examId, status: "submitted", evaluationStatus: status, evaluationFinalizedAt: new Date(evaluationFinalizedAt), submittedAt: new Date(submittedAt) },
});

test("weighted average uses total marks and maximum marks across exams", () => {
  const score = calculateWeightedScore([
    { marksObtained: 80, maximumMarks: 100 },
    { marksObtained: 40, maximumMarks: 50 },
    { marksObtained: 90, maximumMarks: 100 },
  ]);
  assert.equal(score.marksObtained, 210);
  assert.equal(score.maximumMarks, 250);
  assert.equal(score.averagePercentage, 84);
});

test("weighted average supports differently weighted assessments", () => {
  const score = calculateWeightedScore([{ marksObtained: 90, maximumMarks: 100 }, { marksObtained: 20, maximumMarks: 50 }]);
  assert.equal(score.averagePercentage, (110 / 150) * 100);
});

test("only published finalized submitted results count toward averages", () => {
  const finalized = result({ examId: "exam-1", obtained: 80, maximum: 100, submittedAt: "2026-10-01" });
  const pending = result({ examId: "exam-2", obtained: 50, maximum: 50, submittedAt: "2026-10-02", status: "pending" });
  const invalidMaximum = result({ examId: "exam-3", obtained: 5, maximum: 0, submittedAt: "2026-10-03" });
  const invalidMarks = result({ examId: "exam-4", obtained: 101, maximum: 100, submittedAt: "2026-10-04" });
  const eligible = selectLatestEligibleResults([finalized, pending, invalidMaximum, invalidMarks]);
  assert.deepEqual(eligible, [finalized]);
  assert.equal(calculateWeightedScore(eligible).averagePercentage, 80);
});

test("latest finalized attempt is counted once per student and examination", () => {
  const olderAttempt = result({ examId: "exam-1", obtained: 80, maximum: 100, submittedAt: "2026-10-01" });
  const latestAttempt = result({ examId: "exam-1", obtained: 90, maximum: 100, submittedAt: "2026-10-02" });
  const otherExam = result({ examId: "exam-2", obtained: 40, maximum: 50, submittedAt: "2026-10-03" });
  const unique = selectLatestEligibleResults([olderAttempt, latestAttempt, otherExam]);
  assert.equal(unique.length, 2);
  assert.ok(unique.includes(latestAttempt));
  assert.equal(calculateWeightedScore(unique).averagePercentage, (130 / 150) * 100);
});

test("no eligible exams return unavailable average and do not enter rankings", () => {
  const score = calculateWeightedScore([]);
  assert.equal(score.averagePercentage, null);
  assert.deepEqual(rankStudents([{ id: "none", name: "No Results", averagePercentage: null }]), []);
});

test("students with tied weighted averages share a rank and remain ordered consistently", () => {
  const grouped = buildStudentPerformance([
    { student: { ...student, _id: "s1", name: "Zara" }, marksObtained: 90, maximumMarks: 100 },
    { student: { ...student, _id: "s2", name: "Amy" }, marksObtained: 45, maximumMarks: 50 },
    { student: { ...student, _id: "s3", name: "Ben" }, marksObtained: 80, maximumMarks: 100 },
  ]);
  const ranked = rankStudents(grouped.map(({ id, student: record, averagePercentage, marksObtained, resultCount }) => ({ id, name: record.name, averagePercentage, totalMarks: marksObtained, resultCount })));
  assert.deepEqual(ranked.map((row) => [row.name, row.rank]), [["Amy", 1], ["Zara", 1], ["Ben", 3]]);
});
