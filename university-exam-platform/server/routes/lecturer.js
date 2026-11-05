const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, requireRole } = require("../middleware/auth");
const Exam = require("../models/Exam");
const Question = require("../models/Question");
const ExamAttempt = require("../models/ExamAttempt");
const ExamResult = require("../models/ExamResult");
const User = require("../models/User");
const LecturerNotification = require("../models/LecturerNotification");
const StudentNotification = require("../models/StudentNotification");
const { createPublicationNotifications } = require("../services/examLifecycleWorker");
const { normalizeQuestion, validateQuestion } = require("../services/questionValidation");
const { evaluateAnswer, buildLecturerEvaluation } = require("../services/answerEvaluation");
const { rankStudents } = require("../services/performanceRanking");
const { loadEligibleFinalizedResults, calculateWeightedScore, buildStudentPerformance, buildExamPerformance } = require("../services/performanceAnalytics");
const { buildParticipation } = require("../services/examParticipation");

const router = express.Router();
router.use(requireAuth, requireRole("lecturer"));
const oid = (value) => typeof value === "string" && mongoose.isValidObjectId(value);
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const safeError = (res, error, message) => {
  console.error("Lecturer API request failed:", error.name);
  return res.status(500).json({ message });
};
const ownerFilter = (lecturer, id) => ({ _id: id, lecturer });
const attemptFilter = async (lecturer, extra = {}) => {
  const exams = await Exam.find({ lecturer }).select("_id").lean();
  return { exam: { $in: exams.map((exam) => exam._id) }, ...extra };
};
async function expireOwnedAttempts(lecturer) {
  const exams = await Exam.find({ lecturer }).select("_id").lean();
  if (!exams.length) return;
  const now = new Date();
  await ExamAttempt.updateMany({ exam: { $in: exams.map((exam) => exam._id) }, status: "in_progress", deadlineAt: { $lte: now } }, { $set: { status: "expired", closedAt: now, closeReason: "deadline_passed_without_submission", evaluationStatus: "pending" }, $unset: { submittedAt: 1 } });
}
const examPayload = (body = {}) => ({
  title: body.title,
  module: body.module,
  description: body.description || "",
  instructions: body.instructions || "",
  startsAt: body.startsAt,
  endsAt: body.endsAt,
  durationMinutes: Number(body.durationMinutes),
  totalMarks: Number(body.totalMarks),
  category: body.category || "Examination",
  maxAttempts: Number(body.maxAttempts || 1),
  randomizeQuestions: Boolean(body.randomizeQuestions),
  autoSubmit: body.autoSubmit !== false,
  eligibleStudents: Array.isArray(body.eligibleStudents) ? body.eligibleStudents : [],
  questions: Array.isArray(body.questions) ? body.questions : [],
  questionMarkAllocations: body.questionMarkAllocations && typeof body.questionMarkAllocations === "object" ? body.questionMarkAllocations : {},
});
function validateExam(data) {
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 180) return "Enter an exam title (up to 180 characters).";
  if (typeof data.module !== "string" || !data.module.trim() || data.module.length > 120) return "Enter a module name (up to 120 characters).";
  const start = new Date(data.startsAt); const end = new Date(data.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return "Choose a valid end time after the start time.";
  if (!Number.isFinite(data.durationMinutes) || data.durationMinutes < 1 || data.durationMinutes > 1440) return "Duration must be from 1 to 1440 minutes.";
  if (!Number.isFinite(data.totalMarks) || data.totalMarks <= 0) return "Total marks must be greater than zero.";
  if (!Number.isInteger(data.maxAttempts) || data.maxAttempts < 1 || data.maxAttempts > 10) return "Maximum attempts must be between 1 and 10.";
  if (data.eligibleStudents.some((id) => !oid(id))) return "One or more student IDs are invalid.";
  if (data.questions.some((id) => !oid(id))) return "One or more question IDs are invalid.";
  if (new Set(data.eligibleStudents.map(String)).size !== data.eligibleStudents.length) return "Remove duplicate eligible student entries.";
  if (new Set(data.questions.map(String)).size !== data.questions.length) return "Remove duplicate question entries.";
  return null;
}
async function checkQuestions(lecturer, ids, totalMarks, required, allocations = {}) {
  const questions = ids.length ? await Question.find({ lecturer, _id: { $in: ids } }).lean() : [];
  if (questions.length !== new Set(ids.map(String)).size) return { error: "Questions must belong to your question bank." };
  if (Object.entries(allocations).some(([id, marks]) => !ids.includes(id) || !Number.isFinite(Number(marks)) || Number(marks) <= 0 || Number(marks) > 1000)) return { error: "Question mark allocations must be positive and belong to selected questions." };
  const sum = questions.reduce((value, q) => value + Number(allocations[String(q._id)] ?? q.marks), 0);
  if (required && questions.length === 0) return { error: "Add at least one question before publishing." };
  if (required && Math.abs(sum - totalMarks) > 0.001) return { error: `Question marks total ${sum}, which must match exam total ${totalMarks}.` };
  return { questions };
}
const scaleCriteria = (items = [], originalMarks, allocatedMarks) => {
  if (!items.length || Number(originalMarks) === Number(allocatedMarks)) return items;
  let assigned = 0;
  return items.map((item, index) => { const marks = index === items.length - 1 ? Number((allocatedMarks - assigned).toFixed(2)) : Number((Number(item.marks) * allocatedMarks / originalMarks).toFixed(2)); assigned += marks; return { ...item, marks }; });
};
const snapshotOf = (q, marks = q.marks) => ({ originalQuestion: q._id, text: q.text, type: q.type, module: q.module, difficulty: q.difficulty, marks, options: q.options, correctAnswer: q.correctAnswer, expectedAnswer: q.expectedAnswer, markingPoints: scaleCriteria(q.markingPoints, q.marks, marks), modelAnswer: q.modelAnswer, rubric: scaleCriteria(q.rubric, q.marks, marks), chartData: q.chartData, allowNegative: q.allowNegative, markingGuide: q.markingGuide, explanation: q.explanation });

router.get("/dashboard", async (req, res) => {
  try {
    const lecturer = req.user._id;
    await expireOwnedAttempts(lecturer);
    const [exams, allExams, questionCount, notificationCount, notifications] = await Promise.all([
      Exam.find({ lecturer }).sort({ updatedAt: -1 }).limit(12).lean(),
      Exam.find({ lecturer }).select("_id status startsAt endsAt title module updatedAt").lean(),
      Question.countDocuments({ lecturer }),
      LecturerNotification.countDocuments({ lecturer, readAt: null }),
      LecturerNotification.find({ lecturer }).sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    const ids = allExams.map((e) => e._id);
    const [attempts, publishedResults, pendingEvaluation, totalAttempts, submittedAttempts, evaluatedAttempts] = await Promise.all([
      ExamAttempt.find({ exam: { $in: ids } }).populate("student", "name studentId email").populate("exam", "title module").sort({ updatedAt: -1 }).limit(100).lean(),
      ExamResult.countDocuments({ exam: { $in: ids }, isPublished: true }),
      ExamAttempt.countDocuments({ exam: { $in: ids }, status: "submitted", evaluationStatus: { $ne: "finalized" } }),
      ExamAttempt.countDocuments({ exam: { $in: ids } }),
      ExamAttempt.countDocuments({ exam: { $in: ids }, status: "submitted" }),
      ExamAttempt.countDocuments({ exam: { $in: ids }, evaluationStatus: "finalized" }),
    ]);
    const now = Date.now();
    const stats = { total: allExams.length, draft: 0, published: 0, upcoming: 0, ongoing: 0, completed: 0, pendingEvaluation, publishedResults, questions: questionCount, unreadNotifications: notificationCount, totalAttempts, submittedAttempts, evaluatedAttempts };
    allExams.forEach((exam) => {
      if (exam.status === "draft") stats.draft++;
      if (exam.status === "published") {
        stats.published++;
        if (new Date(exam.startsAt).getTime() > now) stats.upcoming++;
        else if (new Date(exam.endsAt).getTime() > now) stats.ongoing++;
        else stats.completed++;
      }
    });
    return res.json({ profile: { id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role, department: req.user.department || null, lecturerId: req.user.lecturerId || null }, stats,
      exams: exams.slice(0, 8), upcoming: allExams.filter((e) => e.status === "published" && new Date(e.startsAt) > new Date()).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)).slice(0, 6),
      recentAttempts: attempts.slice(0, 8).map((a) => ({ id: String(a._id), exam: a.exam?.title, module: a.exam?.module, student: a.student?.name, studentId: a.student?.studentId, status: a.status, evaluationStatus: a.evaluationStatus, submittedAt: a.submittedAt })), notifications });
  } catch (error) { return safeError(res, error, "Unable to load lecturer dashboard."); }
});

router.get("/exams", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = { lecturer: req.user._id };
    const now = new Date();
    if (["draft", "published", "archived"].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.status === "scheduled") Object.assign(filter, { status: "published", startsAt: { $gt: now } });
    if (req.query.status === "ongoing") Object.assign(filter, { status: "published", startsAt: { $lte: now }, endsAt: { $gt: now } });
    if (req.query.status === "completed") Object.assign(filter, { status: "published", endsAt: { $lte: now } });
    if (req.query.module) filter.module = new RegExp(esc(String(req.query.module).slice(0, 120)), "i");
    if (req.query.search) { const re = new RegExp(esc(String(req.query.search).slice(0, 100)), "i"); filter.$or = [{ title: re }, { module: re }]; }
    const [items, total] = await Promise.all([Exam.find(filter).populate("eligibleStudents", "name studentId").populate("questions", "text type marks module topic").sort(req.query.sort === "created_asc" ? { createdAt: 1 } : req.query.sort === "date_desc" ? { startsAt: -1 } : { startsAt: 1 }).skip((page - 1) * limit).limit(limit).lean(), Exam.countDocuments(filter)]);
    const counts = await ExamAttempt.aggregate([{ $match: { exam: { $in: items.map((e) => e._id) } } }, { $group: { _id: "$exam", count: { $sum: 1 } } }]);
    const map = new Map(counts.map((x) => [String(x._id), x.count]));
    res.json({ items: items.map((e) => ({ ...e, attemptCount: map.get(String(e._id)) || 0 })), page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { return safeError(res, error, "Unable to load exams."); }
});

router.post("/exams", async (req, res) => {
  try {
    const data = examPayload(req.body); const validation = validateExam(data);
    if (validation) return res.status(400).json({ message: validation });
    const studentCount = data.eligibleStudents.length ? await User.countDocuments({ _id: { $in: data.eligibleStudents }, role: "student", isActive: true }) : 0;
    if (studentCount !== new Set(data.eligibleStudents).size) return res.status(400).json({ message: "Eligible students must be active student accounts." });
    const checked = await checkQuestions(req.user._id, data.questions, data.totalMarks, false, data.questionMarkAllocations);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const exam = await Exam.create({ ...data, title: data.title.trim(), module: data.module.trim(), lecturer: req.user._id, status: "draft", questionSnapshots: checked.questions.map((q) => snapshotOf(q, Number(data.questionMarkAllocations[String(q._id)] ?? q.marks))) });
    res.status(201).json({ exam });
  } catch (error) { return safeError(res, error, "Unable to save exam draft."); }
});

router.get("/exams/:id", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try { const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)).populate("questions").populate("eligibleStudents", "name studentId email").lean(); if (!exam) return res.status(404).json({ message: "Exam not found." }); res.json({ exam }); }
  catch (error) { return safeError(res, error, "Unable to load exam details."); }
});

router.get("/exams/:id/participation", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try {
    const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id))
      .select("title module startsAt endsAt durationMinutes totalMarks status eligibleStudents")
      .lean();
    if (!exam) return res.status(404).json({ message: "Exam not found." });

    await ExamAttempt.updateMany(
      { exam: exam._id, status: "in_progress", deadlineAt: { $lte: new Date() } },
      { $set: { status: "expired", closedAt: new Date(), closeReason: "deadline_passed_without_submission", evaluationStatus: "pending" }, $unset: { submittedAt: 1 } },
    );

    const eligibleIds = [...new Set((exam.eligibleStudents || []).map(String))];
    const [students, attempts] = await Promise.all([
      User.find({ _id: { $in: eligibleIds }, role: "student", isActive: true, isDeactivated: { $ne: true } })
        .select("name studentId email isActive isDeactivated")
        .lean(),
      ExamAttempt.find({ exam: exam._id, student: { $in: eligibleIds } })
        .select("student status evaluationStatus startedAt submittedAt createdAt attemptNumber")
        .lean(),
    ]);
    return res.json(buildParticipation({ exam, students, attempts }));
  } catch (error) { return safeError(res, error, "Unable to load exam participation."); }
});

router.patch("/exams/:id", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try {
    const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)); if (!exam) return res.status(404).json({ message: "Exam not found." });
    if (exam.status !== "draft") return res.status(409).json({ message: "Only draft exams can be edited. Archive or cancel through the allowed workflow." });
    const data = examPayload({ ...exam.toObject(), ...req.body }); const validation = validateExam(data); if (validation) return res.status(400).json({ message: validation });
    const hasAttempts = await ExamAttempt.exists({ exam: exam._id }); if (hasAttempts) return res.status(409).json({ message: "This exam has attempts and cannot be changed." });
    const activeStudents = data.eligibleStudents.length ? await User.countDocuments({ _id: { $in: data.eligibleStudents }, role: "student", isActive: true }) : 0;
    if (activeStudents !== data.eligibleStudents.length) return res.status(400).json({ message: "Eligible students must be active student accounts." });
    const checked = await checkQuestions(req.user._id, data.questions, data.totalMarks, false, data.questionMarkAllocations); if (checked.error) return res.status(400).json({ message: checked.error });
    Object.assign(exam, data); exam.questionSnapshots = checked.questions.map((q) => snapshotOf(q, Number(data.questionMarkAllocations[String(q._id)] ?? q.marks))); await exam.save(); res.json({ exam });
  } catch (error) { return safeError(res, error, "Unable to update exam."); }
});

router.post("/exams/:id/publish", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try {
    const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)); if (!exam) return res.status(404).json({ message: "Exam not found." });
    if (exam.status !== "draft") return res.status(409).json({ message: "Only draft exams can be published." });
    const checked = await checkQuestions(req.user._id, exam.questions.map(String), exam.totalMarks, true, exam.questionMarkAllocations || {}); if (checked.error) return res.status(400).json({ message: checked.error });
    if (!exam.eligibleStudents.length) return res.status(400).json({ message: "Select at least one eligible student before publishing." });
    if (new Date(exam.endsAt) <= new Date() || new Date(exam.startsAt) >= new Date(exam.endsAt)) return res.status(400).json({ message: "Exam schedule is invalid or has already ended." });
    const activeStudents = await User.countDocuments({ _id: { $in: exam.eligibleStudents }, role: "student", isActive: true });
    if (activeStudents !== exam.eligibleStudents.length) return res.status(400).json({ message: "Remove students who are inactive or no longer have student accounts." });
    const conflict = await Exam.findOne({ _id: { $ne: exam._id }, status: "published", startsAt: { $lt: exam.endsAt }, endsAt: { $gt: exam.startsAt }, $or: [{ lecturer: req.user._id }, { eligibleStudents: { $in: exam.eligibleStudents } }] }).select("title startsAt endsAt").lean();
    if (conflict) return res.status(409).json({ message: `This schedule overlaps with ${conflict.title}. Resolve the schedule conflict before publishing.` });
    exam.questionSnapshots = checked.questions.map((q) => snapshotOf(q, Number(exam.questionMarkAllocations?.[String(q._id)] ?? q.marks))); exam.status = "published"; exam.publishedAt = new Date(); await exam.save();
    try { await createPublicationNotifications(exam); } catch (notificationError) { console.error("Exam publication notification enqueue failed:", notificationError.name); }
    res.json({ success: true, exam });
  } catch (error) { return safeError(res, error, "Unable to publish exam."); }
});

router.post("/exams/:id/archive", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try { const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)); if (!exam) return res.status(404).json({ message: "Exam not found." }); if (await ExamAttempt.exists({ exam: exam._id, status: "in_progress" })) return res.status(409).json({ message: "An exam with active attempts cannot be archived." }); exam.status = "archived"; await exam.save(); res.json({ success: true, exam }); }
  catch (error) { return safeError(res, error, "Unable to archive exam."); }
});

router.delete("/exams/:id", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." });
  try { const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)); if (!exam) return res.status(404).json({ message: "Exam not found." }); if (exam.status !== "draft" || await ExamAttempt.exists({ exam: exam._id })) return res.status(409).json({ message: "Only a draft with no attempts can be deleted." }); await exam.deleteOne(); res.json({ success: true }); }
  catch (error) { return safeError(res, error, "Unable to delete exam draft."); }
});

router.get("/questions", async (req, res) => {
  try { const filter = { lecturer: req.user._id }; if (req.query.module) filter.module = new RegExp(esc(String(req.query.module).slice(0, 120)), "i"); if (req.query.type && ["mcq","true_false","short_answer","essay","bar_chart"].includes(req.query.type)) filter.type = req.query.type; if (req.query.difficulty && ["easy","medium","hard"].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty; if (req.query.search) filter.text = new RegExp(esc(String(req.query.search).slice(0, 100)), "i"); const items = await Question.find(filter).sort({ updatedAt: -1 }).limit(200).lean(); res.json({ items }); }
  catch (error) { return safeError(res, error, "Unable to load question bank."); }
});
router.post("/questions", async (req, res) => {
  const body = normalizeQuestion(req.body || {}); const error = validateQuestion(body); if (error) return res.status(400).json({ message: error });
  try { const item = await Question.create({ ...body, lecturer: req.user._id }); res.status(201).json({ question: item }); }
  catch (err) { if (err.name === "ValidationError" || err.name === "CastError") return res.status(400).json({ message: err.message }); return safeError(res, err, "Unable to save question."); }
});
router.patch("/questions/:id", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid question ID." });
  try { const item = await Question.findOne({ _id: req.params.id, lecturer: req.user._id }); if (!item) return res.status(404).json({ message: "Question not found." }); if (await Exam.exists({ lecturer: req.user._id, questions: item._id, status: "published" })) return res.status(409).json({ message: "Questions used by published exams cannot be edited." }); const body = normalizeQuestion({ ...item.toObject(), ...req.body }); const error = validateQuestion(body); if (error) return res.status(400).json({ message: error }); Object.assign(item, body); await item.save(); res.json({ question: item }); }
  catch (err) { if (err.name === "ValidationError" || err.name === "CastError") return res.status(400).json({ message: err.message }); return safeError(res, err, "Unable to update question."); }
});
router.delete("/questions/:id", async (req, res) => { if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid question ID." }); try { const item = await Question.findOne({ _id: req.params.id, lecturer: req.user._id }); if (!item) return res.status(404).json({ message: "Question not found." }); if (await Exam.exists({ lecturer: req.user._id, questions: item._id })) return res.status(409).json({ message: "A question assigned to an exam cannot be deleted." }); await item.deleteOne(); res.json({ success: true }); } catch (err) { return safeError(res, err, "Unable to delete question."); } });

router.get("/schedule", async (req, res) => { try { const items = await Exam.find({ lecturer: req.user._id, status: { $ne: "archived" } }).sort({ startsAt: 1 }).limit(200).lean(); const published = items.filter((e) => e.status === "published"); const decorated = items.map((exam) => ({ ...exam, conflictsWith: exam.status !== "published" ? [] : published.filter((other) => String(other._id) !== String(exam._id) && new Date(exam.startsAt) < new Date(other.endsAt) && new Date(other.startsAt) < new Date(exam.endsAt)).map((other) => ({ id: String(other._id), title: other.title })) })); res.json({ items: decorated }); } catch (err) { return safeError(res, err, "Unable to load exam schedule."); } });
router.get("/attempts", async (req, res) => { try { await expireOwnedAttempts(req.user._id); const filter = await attemptFilter(req.user._id); if (req.query.exam && oid(req.query.exam)) filter.exam = req.query.exam; if (req.query.status) filter.status = req.query.status; const items = await ExamAttempt.find(filter).populate("student", "name studentId email").populate("exam", "title module totalMarks").sort({ updatedAt: -1 }).limit(200).lean(); res.json({ items }); } catch (err) { return safeError(res, err, "Unable to load exam attempts."); } });
router.get("/submissions", async (req, res) => { try { await expireOwnedAttempts(req.user._id); const filter = await attemptFilter(req.user._id, { status: "submitted" }); if (req.query.exam && oid(req.query.exam)) filter.exam = req.query.exam; const items = await ExamAttempt.find(filter).populate("student", "name studentId email").populate("exam", "title module totalMarks").sort({ submittedAt: -1 }).limit(200).lean(); res.json({ items }); } catch (err) { return safeError(res, err, "Unable to load submissions."); } });
router.get("/submissions/:id", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid submission ID." });
  try {
    const allowed = await attemptFilter(req.user._id, { _id: req.params.id, status: "submitted" });
    const item = await ExamAttempt.findOne(allowed).populate("student", "name studentId email").populate("exam", "title module totalMarks");
    if (!item) return res.status(404).json({ message: "Submitted work was not found for an exam you manage." });
    let suggestionsChanged = false;
    for (const answer of item.answers) {
      const question = answer.questionSnapshot;
      if (!question) continue;
      question._id = String(question.originalQuestion || answer.question);
      if (answer.automaticMarks === null || answer.automaticMarks === undefined || !answer.markingMethod || (question.type === "bar_chart" && answer.markingMethod === "lecturer_review_required")) {
        const suggestion = evaluateAnswer(question, answer.response);
        answer.automaticMarks = suggestion.marks;
        answer.markingMethod = suggestion.method;
        answer.markingFeedback = suggestion.criterionScores?.map((score) => ({ point: score.criterion, marksAwarded: score.marksAwarded, maximumMarks: score.maximumMarks, rationale: score.feedback, requiresReview: score.requiresReview })) || [{ point: "Correct answer", marksAwarded: suggestion.marks, maximumMarks: Number(question.marks), rationale: suggestion.rationale, requiresReview: suggestion.requiresReview }];
        if (suggestion.criterionScores) answer.criterionScores = suggestion.criterionScores;
        if (question.type === "short_answer" || question.type === "essay") answer.rubricCalculatedMarks = suggestion.marks;
        if (answer.marksAwarded === null || answer.marksAwarded === undefined) answer.marksAwarded = suggestion.marks;
        suggestionsChanged = true;
      }
    }
    if (suggestionsChanged) await item.save();
    const submission = item.toObject();
    submission.answers = submission.answers.map((answer) => ({ ...answer, question: answer.questionSnapshot ? { ...answer.questionSnapshot, _id: String(answer.questionSnapshot.originalQuestion || answer.question) } : answer.question }));
    res.json({ submission });
  } catch (err) { return safeError(res, err, "Unable to load submission."); }
});

router.patch("/submissions/:id/evaluate", async (req, res) => {
  if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid submission ID." });
  const grades = req.body?.answers;
  if (!Array.isArray(grades)) return res.status(400).json({ message: "Evaluation answers are required." });
  try {
    const allowed = await attemptFilter(req.user._id, { _id: req.params.id, status: "submitted" });
    const attempt = await ExamAttempt.findOne(allowed).populate("exam"); if (!attempt) return res.status(404).json({ message: "Submission not found." });
    if (!attempt.answers.length) return res.status(409).json({ message: "This attempt has no answer records and cannot be evaluated. No result was created." });
    const resultPublished = await ExamResult.exists({ attempt: attempt._id, isPublished: true });
    if (resultPublished) return res.status(409).json({ message: "Published results are locked. Contact an administrator to reopen evaluation with an audit process." });
    const uniqueQuestionIds = new Set(attempt.answers.map((answer) => String(answer.question)));
    if (uniqueQuestionIds.size !== attempt.answers.length) return res.status(409).json({ message: "Duplicate question entries were found in the attempt. Results were not changed." });
    const byId = new Map();
    for (const grade of grades) {
      if (!grade || !oid(String(grade.questionId || "")) || byId.has(String(grade.questionId))) return res.status(400).json({ message: "Each question must have one valid, unique evaluation record." });
      byId.set(String(grade.questionId), grade);
    }
    const validQuestionIds = new Set(attempt.answers.map((answer) => String(answer.question)));
    if ([...byId.keys()].some((id) => !validQuestionIds.has(id))) return res.status(400).json({ message: "An evaluation references a question outside this submission." });
    const finalize = req.body?.finalize === true;
    let changed = false;
    for (const answer of attempt.answers) {
      const question = answer.questionSnapshot;
      if (!question) return res.status(409).json({ message: "A published question snapshot is missing; this submission cannot be safely evaluated." });
      const questionId = String(question.originalQuestion || answer.question);
      const grade = byId.get(questionId);
      if (!grade) { if (finalize) return res.status(400).json({ message: "Finalize requires a reviewed score for every question." }); else continue; }
      const suggestion = evaluateAnswer(question, answer.response);
      const priorScores = answer.criterionScores?.map((score) => score.toObject?.() || score) || [];
      const previous = { marksAwarded: answer.marksAwarded, automaticMarks: answer.automaticMarks, rubricCalculatedMarks: answer.rubricCalculatedMarks, manualOverrideMarks: answer.manualOverrideMarks, marksSource: answer.marksSource, feedback: answer.feedback, criterionScores: priorScores, evaluatedBy: answer.evaluatedBy, evaluatedAt: answer.evaluatedAt };
      if (answer.automaticMarks === null || answer.automaticMarks === undefined || (question.type === "bar_chart" && answer.markingMethod === "lecturer_review_required")) {
        answer.automaticMarks = suggestion.marks;
        answer.markingMethod = suggestion.method;
      }
      const overrideProvided = Object.prototype.hasOwnProperty.call(grade, "manualOverrideMarks");
      const evaluationResult = buildLecturerEvaluation(question, answer.response, { criterionScores: grade.criterionScores, manualOverrideMarks: overrideProvided ? grade.manualOverrideMarks : null });
      const { criterionScores, rubricTotal, manualOverrideMarks: override, finalMarks } = evaluationResult;
      const reviewed = grade.reviewed === true;
      if (finalize && !reviewed) return res.status(400).json({ message: "Review and confirm every question before finalizing." });
      if (criterionScores.length) answer.criterionScores = criterionScores.map((score, index) => ({ ...score, automaticMarks: Number(previous.criterionScores[index]?.automaticMarks ?? suggestion.criterionScores[index]?.marksAwarded ?? 0) }));
      const currentScores = answer.criterionScores?.map((score) => score.toObject?.() || score) || [];
      if (answer.evaluatedAt && (answer.marksAwarded !== finalMarks || answer.manualOverrideMarks !== override || JSON.stringify(previous.criterionScores) !== JSON.stringify(currentScores))) answer.evaluationHistory.push(previous);
      answer.rubricCalculatedMarks = rubricTotal;
      answer.manualOverrideMarks = override;
      answer.marksAwarded = finalMarks;
      answer.marksSource = evaluationResult.marksSource;
      answer.feedback = String(grade.feedback || "").slice(0, 2000);
      answer.reviewed = reviewed;
      answer.evaluatedBy = req.user._id;
      answer.evaluatedAt = new Date();
      changed = true;
    }
    const reviewedCount = attempt.answers.filter((answer) => answer.reviewed).length;
    const allReviewed = reviewedCount === attempt.answers.length;
    const allScored = attempt.answers.every((answer) => answer.marksAwarded !== null && answer.marksAwarded !== undefined);
    if (finalize && (!allReviewed || !allScored)) return res.status(400).json({ message: "Every submitted question must have a final score and be marked reviewed." });
    const marksObtained = attempt.answers.reduce((sum, answer) => sum + Number(answer.marksAwarded || 0), 0);
    const maximumMarks = attempt.exam.questionSnapshots?.length ? [...new Map(attempt.exam.questionSnapshots.map((question) => [String(question.originalQuestion), Number(question.marks)])).values()].reduce((sum, marks) => sum + marks, 0) : Number(attempt.exam.totalMarks);
    if (marksObtained > maximumMarks + 0.001) return res.status(409).json({ message: "Calculated marks exceed the configured examination maximum." });
    attempt.evaluationStatus = finalize ? "finalized" : allReviewed && allScored ? "evaluated" : reviewedCount ? "partial" : "pending";
    attempt.evaluationFinalizedAt = finalize ? new Date() : null;
    attempt.evaluationFinalizedBy = finalize ? req.user._id : null;
    await attempt.save();
    if (finalize) {
      await ExamResult.findOneAndUpdate({ attempt: attempt._id }, { $set: { student: attempt.student, exam: attempt.exam._id, attempt: attempt._id, marksObtained, maximumMarks, grade: null } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    } else await ExamResult.deleteOne({ attempt: attempt._id, isPublished: false });
    res.json({ success: true, evaluationStatus: attempt.evaluationStatus, finalizedAt: attempt.evaluationFinalizedAt, changed, provisional: !finalize, marksObtained, maximumMarks });
  } catch (err) { if (err.statusCode === 400) return res.status(400).json({ message: err.message }); return safeError(res, err, "Unable to save evaluation."); }
});

router.get("/results", async (req, res) => { try { const filter = await attemptFilter(req.user._id); const exams = await Exam.find({ lecturer: req.user._id }).select("_id").lean(); const results = await ExamResult.find({ exam: { $in: exams.map((x) => x._id) } }).populate("student", "name studentId email").populate("exam", "title module totalMarks resultPublished").populate("attempt", "submittedAt evaluationStatus").sort({ updatedAt: -1 }).limit(500).lean(); res.json({ items: results, gradingRules: null, note: "No grading boundaries are configured; grades and pass/fail labels are not inferred." }); } catch (err) { return safeError(res, err, "Unable to load results."); } });
router.post("/exams/:id/publish-results", async (req, res) => { if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid exam ID." }); try { const exam = await Exam.findOne(ownerFilter(req.user._id, req.params.id)); if (!exam) return res.status(404).json({ message: "Exam not found." }); const attempts = await ExamAttempt.find({ exam: exam._id, status: "submitted" }); if (!attempts.length || attempts.some((a) => a.evaluationStatus !== "finalized" || !a.evaluationFinalizedAt)) return res.status(409).json({ message: "All submitted attempts must be finalized before publishing results." }); const ids = attempts.map((a) => a._id); const publishedAt = new Date(); await ExamResult.updateMany({ exam: exam._id, attempt: { $in: ids } }, { $set: { isPublished: true, publishedAt } }); exam.resultPublished = true; await exam.save(); await Promise.all(attempts.map((a) => StudentNotification.updateOne({ student: a.student, dedupeKey: `result:${exam._id}:${a._id}` }, { $setOnInsert: { student: a.student, dedupeKey: `result:${exam._id}:${a._id}`, type: "result_published", title: "Exam result published", message: `Your result for ${exam.title} is now available.`, href: "/student/results" } }, { upsert: true }))); res.json({ success: true, publishedCount: attempts.length }); } catch (err) { return safeError(res, err, "Unable to publish results."); } });

router.get("/analytics/students/:studentId", async (req, res) => {
  if (!oid(req.params.studentId)) return res.status(400).json({ message: "Invalid student ID." });
  try {
    const [exams, student] = await Promise.all([
      Exam.find({ lecturer: req.user._id, eligibleStudents: req.params.studentId }).select("_id title module startsAt endsAt totalMarks status").lean(),
      User.findOne({ _id: req.params.studentId, role: "student", isActive: true }).select("name email studentId programme").lean(),
    ]);
    if (!student || !exams.length) return res.status(404).json({ message: "Student is not in your authorized exam scope." });
    const examIds = exams.map((exam) => exam._id);
    const [results, attempts] = await Promise.all([
      loadEligibleFinalizedResults(examIds, student._id),
      ExamAttempt.find({ student: student._id, exam: { $in: examIds } }).select("exam status evaluationStatus submittedAt").lean(),
    ]);
    const history = results.map((result) => ({ examId: String(result.exam?._id), exam: result.exam?.title || "Examination", module: result.exam?.module || "Unassigned", examDate: result.exam?.startsAt || null, submissionDate: result.attempt?.submittedAt || null, marksObtained: result.marksObtained, maximumMarks: result.maximumMarks, percentage: result.maximumMarks ? result.marksObtained / result.maximumMarks * 100 : null, publishedAt: result.publishedAt }));
    const percentages = history.map((row) => row.percentage).filter(Number.isFinite);
    const overallScore = calculateWeightedScore(results);
    const byModuleMap = new Map();
    history.forEach((row) => { const group = byModuleMap.get(row.module) || { module: row.module, marksObtained: 0, maximumMarks: 0, resultCount: 0 }; group.marksObtained += row.marksObtained; group.maximumMarks += row.maximumMarks; group.resultCount += 1; byModuleMap.set(row.module, group); });
    const attemptByExam = new Map(attempts.map((attempt) => [String(attempt.exam), attempt]));
    const pendingExams = exams.filter((exam) => { const attempt = attemptByExam.get(String(exam._id)); return exam.status === "published" && attempt?.status === "submitted" && attempt.evaluationStatus !== "finalized"; }).map((exam) => ({ id: String(exam._id), title: exam.title, module: exam.module, evaluationStatus: attemptByExam.get(String(exam._id)).evaluationStatus }));
    return res.json({ student, summary: { publishedResults: history.length, averagePercentage: overallScore.averagePercentage, totalMarksObtained: overallScore.marksObtained, totalMaximumMarks: overallScore.maximumMarks, highestPercentage: percentages.length ? Math.max(...percentages) : null, eligibleExams: exams.length, pendingEvaluations: pendingExams.length }, history, byModule: [...byModuleMap.values()].map((group) => ({ module: group.module, averagePercentage: group.maximumMarks > 0 ? group.marksObtained / group.maximumMarks * 100 : null, resultCount: group.resultCount })), pendingExams });
  } catch (err) { return safeError(res, err, "Unable to load student performance."); }
});

router.get("/analytics", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const metric = ["average", "total", "name"].includes(req.query.sort) ? req.query.sort : "average";
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100).toLowerCase() : "";
  try {
    const exams = await Exam.find({ lecturer: req.user._id }).select("_id title module startsAt status eligibleStudents").lean();
    const examIds = exams.map((exam) => exam._id);
    const eligibleIds = [...new Set(exams.flatMap((exam) => (exam.eligibleStudents || []).map(String)))];
    const [attemptsByExam, eligibleCount, finalizedResults, pendingEvaluation] = await Promise.all([
      ExamAttempt.aggregate([{ $match: { exam: { $in: examIds }, status: "submitted" } }, { $group: { _id: "$exam", submittedCount: { $sum: 1 }, pendingEvaluations: { $sum: { $cond: [{ $ne: ["$evaluationStatus", "finalized"] }, 1, 0] } } } }]),
      User.countDocuments({ _id: { $in: eligibleIds }, role: "student", isActive: true }),
      loadEligibleFinalizedResults(examIds),
      ExamAttempt.countDocuments({ exam: { $in: examIds }, status: "submitted", evaluationStatus: { $ne: "finalized" } }),
    ]);
    const studentMetrics = buildStudentPerformance(finalizedResults);
    const rawRankings = studentMetrics.map((group) => {
      const latest = group.results.reduce((current, result) => !current || new Date(result.publishedAt || result.createdAt || 0) > new Date(current.publishedAt || current.createdAt || 0) ? result : current, null);
      return { id: group.id, name: group.student.name, studentId: group.student.studentId, email: group.student.email, programme: group.student.programme, averagePercentage: group.averagePercentage, totalMarks: group.marksObtained, totalMaximumMarks: group.maximumMarks, resultCount: group.resultCount, latestPercentage: latest?.maximumMarks > 0 ? latest.marksObtained / latest.maximumMarks * 100 : null, latestPublishedAt: latest?.publishedAt || null };
    });
    const ranked = rankStudents(rawRankings, metric);
    const weightedRanked = rankStudents(rawRankings, "average");
    const matching = ranked.filter((row) => !search || `${row.name} ${row.studentId || ""}`.toLowerCase().includes(search));
    const items = matching.slice((page - 1) * limit, page * limit);
    const byExamMap = new Map(buildExamPerformance(finalizedResults).map((row) => [String(row.exam._id), row]));
    const attemptsMap = new Map(attemptsByExam.map((row) => [String(row._id), row]));
    const byExam = exams.filter((exam) => exam.status === "published").map((exam) => {
      const results = byExamMap.get(String(exam._id));
      const attempts = attemptsMap.get(String(exam._id));
      return { id: String(exam._id), title: exam.title, module: exam.module, startsAt: exam.startsAt, resultCount: results?.resultCount || 0, averagePercentage: results?.averagePercentage ?? null, highestPercentage: results?.highestPercentage ?? null, lowestPercentage: results?.lowestPercentage ?? null, eligibleStudentCount: exam.eligibleStudents?.length || 0, pendingEvaluations: attempts?.pendingEvaluations || 0, attemptCount: attempts?.submittedCount || 0 };
    });
    const publishedExams = exams.filter((exam) => exam.status === "published");
    const classAverages = rawRankings.map((row) => row.averagePercentage).filter(Number.isFinite);
    const resultSummary = { count: finalizedResults.length, averagePercentage: classAverages.length ? classAverages.reduce((sum, value) => sum + value, 0) / classAverages.length : null, highestPercentage: classAverages.length ? Math.max(...classAverages) : null, lowestPercentage: classAverages.length ? Math.min(...classAverages) : null };
    res.json({
      summary: { totalStudents: eligibleCount, rankedStudents: weightedRanked.length, insufficientResults: Math.max(0, eligibleCount - weightedRanked.length), totalAssessments: publishedExams.length, publishedResultCount: resultSummary.count, averageClassPercentage: resultSummary.averagePercentage, highestPercentage: resultSummary.highestPercentage, lowestPercentage: resultSummary.lowestPercentage, pendingEvaluations: pendingEvaluation },
      ranking: { metric, description: metric === "average" ? "Weighted average = total finalized marks obtained ÷ total maximum marks for eligible published exams × 100. Only the latest finalized published attempt per exam is counted." : metric === "total" ? "Sum of marks from eligible finalized published results; comparisons are meaningful only when students share the same assessments." : "Alphabetical by student name. Student average percentages still use the weighted formula." },
      items, topStudents: weightedRanked.filter((student) => student.rank <= 3), page, limit, total: matching.length, pages: Math.ceil(matching.length / limit), byExam,
    });
  } catch (err) { return safeError(res, err, "Unable to load analytics."); }
});
router.get("/eligible-students", async (req, res) => { try { const filter = { role: "student", isActive: true }; if (req.query.search) { const re = new RegExp(esc(String(req.query.search).slice(0, 100)), "i"); filter.$or = [{ name: re }, { email: re }, { studentId: re }]; } const students = await User.find(filter).select("name email studentId programme").sort({ name: 1 }).limit(500).lean(); res.json({ items: students }); } catch (err) { return safeError(res, err, "Unable to load eligible students."); } });
router.get("/students", async (req, res) => { try { const exams = await Exam.find({ lecturer: req.user._id }).select("_id title module eligibleStudents").lean(); const studentIds = [...new Set(exams.flatMap((e) => e.eligibleStudents.map(String)))]; const filter = { _id: { $in: studentIds }, role: "student", isActive: true }; if (req.query.search) { const re = new RegExp(esc(String(req.query.search).slice(0, 100)), "i"); filter.$or = [{ name: re }, { email: re }, { studentId: re }]; } const students = await User.find(filter).select("name email studentId programme").sort({ name: 1 }).limit(300).lean(); const attempts = await ExamAttempt.find({ exam: { $in: exams.map((e) => e._id) }, student: { $in: students.map((s) => s._id) } }).select("student exam status evaluationStatus").lean(); res.json({ items: students.map((s) => ({ ...s, examCount: exams.filter((e) => e.eligibleStudents.some((id) => String(id) === String(s._id))).length, attempts: attempts.filter((a) => String(a.student) === String(s._id)).length })), scope: "Students eligible for this lecturer's exams only." }); } catch (err) { return safeError(res, err, "Unable to load associated students."); } });

router.get("/notifications", async (req, res) => { try { const filter = { lecturer: req.user._id }; if (req.query.type) filter.type = req.query.type; const [items, unreadCount] = await Promise.all([LecturerNotification.find(filter).sort({ createdAt: -1 }).limit(100).lean(), LecturerNotification.countDocuments({ lecturer: req.user._id, readAt: null })]); res.json({ items, unreadCount }); } catch (err) { return safeError(res, err, "Unable to load notifications."); } });
router.patch("/notifications/read-all", async (req, res) => { try { const result = await LecturerNotification.updateMany({ lecturer: req.user._id, readAt: null }, { $set: { readAt: new Date() } }); res.json({ success: true, modifiedCount: result.modifiedCount }); } catch (err) { return safeError(res, err, "Unable to mark notifications as read."); } });
router.patch("/notifications/:id/read", async (req, res) => { if (!oid(req.params.id)) return res.status(400).json({ message: "Invalid notification ID." }); try { const item = await LecturerNotification.findOneAndUpdate({ _id: req.params.id, lecturer: req.user._id }, { $set: { readAt: new Date() } }, { new: true }); if (!item) return res.status(404).json({ message: "Notification not found." }); res.json({ success: true }); } catch (err) { return safeError(res, err, "Unable to update notification."); } });

router.get("/profile", (req, res) => res.json({ id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role, department: req.user.department || null, lecturerId: req.user.lecturerId || null }));
router.patch("/profile", async (req, res) => { const allowed = ["name", "department"]; const fields = Object.keys(req.body || {}); if (!fields.length || fields.some((f) => !allowed.includes(f))) return res.status(400).json({ message: "Only name and department may be updated." }); const updates = {}; for (const field of fields) { const value = req.body[field]; if (typeof value !== "string" || value.trim().length > 120 || (field === "name" && !value.trim())) return res.status(400).json({ message: `Invalid ${field}.` }); updates[field] = value.trim() || null; } try { const user = await User.findOneAndUpdate({ _id: req.user._id, role: "lecturer", isActive: true }, { $set: updates }, { new: true, runValidators: true }).select("name email role department lecturerId"); if (!user) return res.status(404).json({ message: "Lecturer profile not found." }); res.json({ id: String(user._id), name: user.name, email: user.email, role: user.role, department: user.department || null, lecturerId: user.lecturerId || null }); } catch (err) { return safeError(res, err, "Unable to update profile."); } });

module.exports = router;
