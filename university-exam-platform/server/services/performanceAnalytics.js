const ExamResult = require("../models/ExamResult");

function isValidPublishedResult(result) {
  const obtained = Number(result?.marksObtained);
  const maximum = Number(result?.maximumMarks);
  const attempt = result?.attempt;
  const student = result?.student;
  const exam = result?.exam;
  if (result?.isPublished !== true || !Number.isFinite(obtained) || !Number.isFinite(maximum) || maximum <= 0 || obtained < 0 || obtained > maximum) return false;
  if (!attempt || attempt.status !== "submitted" || attempt.evaluationStatus !== "finalized" || !attempt.evaluationFinalizedAt || !Number.isFinite(new Date(attempt.evaluationFinalizedAt).getTime()) || !attempt.submittedAt || !Number.isFinite(new Date(attempt.submittedAt).getTime())) return false;
  if (!student || student.role !== "student" || student.isActive !== true || !exam || !["published", "archived"].includes(exam.status)) return false;
  if (String(attempt.student) !== String(student._id) || String(attempt.exam) !== String(exam._id) || String(result.exam?._id || result.exam) !== String(exam._id)) return false;
  return (exam.eligibleStudents || []).some((id) => String(id) === String(student._id));
}

function resultRecency(result) {
  const submitted = new Date(result.attempt?.submittedAt || 0).getTime();
  const published = new Date(result.publishedAt || result.createdAt || 0).getTime();
  return [Number.isFinite(submitted) ? submitted : 0, Number.isFinite(published) ? published : 0];
}

function selectLatestEligibleResults(results = []) {
  const latestByStudentExam = new Map();
  for (const result of results) {
    if (!isValidPublishedResult(result)) continue;
    const key = `${String(result.student._id)}:${String(result.exam._id)}`;
    const current = latestByStudentExam.get(key);
    const nextRecency = resultRecency(result);
    const currentRecency = current ? resultRecency(current) : null;
    if (!current || nextRecency[0] > currentRecency[0] || (nextRecency[0] === currentRecency[0] && nextRecency[1] > currentRecency[1])) latestByStudentExam.set(key, result);
  }
  return [...latestByStudentExam.values()].sort((left, right) => new Date(left.publishedAt || left.createdAt || 0) - new Date(right.publishedAt || right.createdAt || 0));
}

async function loadEligibleFinalizedResults(examIds, studentId) {
  if (!Array.isArray(examIds) || !examIds.length) return [];
  const filter = { exam: { $in: examIds }, isPublished: true, maximumMarks: { $gt: 0 }, attempt: { $ne: null } };
  if (studentId) filter.student = studentId;
  const records = await ExamResult.find(filter)
    .populate({ path: "attempt", select: "student exam status evaluationStatus evaluationFinalizedAt submittedAt" })
    .populate({ path: "student", select: "name email studentId programme role isActive" })
    .populate({ path: "exam", select: "title module startsAt status eligibleStudents" })
    .lean();
  return selectLatestEligibleResults(records);
}

function calculateWeightedScore(results = []) {
  let marksObtained = 0;
  let maximumMarks = 0;
  for (const result of results) {
    const obtained = Number(result.marksObtained);
    const maximum = Number(result.maximumMarks);
    if (!Number.isFinite(obtained) || !Number.isFinite(maximum) || maximum <= 0 || obtained < 0 || obtained > maximum) continue;
    marksObtained += obtained;
    maximumMarks += maximum;
  }
  return { marksObtained, maximumMarks, averagePercentage: maximumMarks > 0 ? (marksObtained / maximumMarks) * 100 : null };
}

function buildStudentPerformance(results = []) {
  const groups = new Map();
  for (const result of results) {
    const student = result.student;
    if (!student?._id) continue;
    const id = String(student._id);
    if (!groups.has(id)) groups.set(id, { id, student, results: [] });
    groups.get(id).results.push(result);
  }
  return [...groups.values()].map((group) => {
    const score = calculateWeightedScore(group.results);
    const percentages = group.results.map((result) => Number(result.marksObtained) / Number(result.maximumMarks) * 100).filter(Number.isFinite);
    return { ...group, ...score, resultCount: group.results.length, highestPercentage: percentages.length ? Math.max(...percentages) : null, lowestPercentage: percentages.length ? Math.min(...percentages) : null };
  });
}

function buildExamPerformance(results = []) {
  const groups = new Map();
  for (const result of results) {
    const exam = result.exam;
    if (!exam?._id) continue;
    const id = String(exam._id);
    if (!groups.has(id)) groups.set(id, { id, exam, results: [] });
    groups.get(id).results.push(result);
  }
  return [...groups.values()].map((group) => {
    const score = calculateWeightedScore(group.results);
    const percentages = group.results.map((result) => Number(result.marksObtained) / Number(result.maximumMarks) * 100).filter(Number.isFinite);
    return { ...group, ...score, resultCount: group.results.length, highestPercentage: percentages.length ? Math.max(...percentages) : null, lowestPercentage: percentages.length ? Math.min(...percentages) : null };
  });
}

module.exports = { isValidPublishedResult, selectLatestEligibleResults, loadEligibleFinalizedResults, calculateWeightedScore, buildStudentPerformance, buildExamPerformance };
