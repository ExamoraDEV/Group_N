const express = require("express");
const mongoose = require("mongoose");
const { requireAuth, requireRole } = require("../middleware/auth");
const User = require("../models/User");
const Exam = require("../models/Exam");
const ExamAttempt = require("../models/ExamAttempt");
const ExamResult = require("../models/ExamResult");
const StudentNotification = require("../models/StudentNotification");
const Question = require("../models/Question");
const LecturerNotification = require("../models/LecturerNotification");
const { studentExamState } = require("../services/studentExamState");
const { evaluateAnswer } = require("../services/answerEvaluation");
const { normalizeBarResponse } = require("../services/barChartValidation");

const router = express.Router();
const EXAM_FILTERS = new Set(["all", "available", "upcoming", "ongoing", "completed", "missed"]);

router.use(requireAuth, requireRole("student"));

function validObjectId(value) {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function readPagination(query) {
  const pageValue = query.page === undefined ? "1" : String(query.page);
  const limitValue = query.limit === undefined ? "10" : String(query.limit);
  if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
    return null;
  }
  const page = Number(pageValue);
  const limit = Number(limitValue);
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit)) return null;
  const safeLimit = Math.min(limit, 50);
  const skip = (page - 1) * safeLimit;
  if (!Number.isSafeInteger(skip)) return null;
  return { page, limit: safeLimit, skip };
}

function escapedSearch(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicExam(exam, attempt, now = new Date()) {
  const state = studentExamState(exam, attempt, now);
  const deadlineExpired = attempt?.status === "in_progress" && studentExamState(exam, attempt, now) === "missed";
  return {
    id: String(exam._id),
    title: exam.title,
    module: exam.module,
    description: exam.description,
    instructions: exam.instructions,
    lecturer: exam.lecturer?.name || null,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    durationMinutes: exam.durationMinutes,
    totalMarks: exam.totalMarks,
    questionCount: exam.questionSnapshots?.length || exam.questions?.length || 0,
    status: state,
    canStart: state === "ongoing" && attempt?.status !== "in_progress",
    resultPublished: Boolean(exam.resultPublished),
    attempt: attempt
      ? {
          id: String(attempt._id),
          status: deadlineExpired ? "expired" : attempt.status,
          startedAt: attempt.startedAt,
          deadlineAt: attempt.deadlineAt,
          submittedAt: attempt.submittedAt,
          evaluationStatus: attempt.evaluationStatus,
          closeReason: attempt.closeReason || null,
        }
      : null,
  };
}

function sendFailure(response, error, message) {
  console.error("Student API request failed:", error.name);
  return response.status(500).json({ message });
}

async function getAttemptMap(studentId, examIds) {
  const attempts = await ExamAttempt.find({ student: studentId, exam: { $in: examIds } })
    .sort({ updatedAt: -1 })
    .select("exam status startedAt deadlineAt submittedAt updatedAt evaluationStatus answers.marksAwarded closeReason closedAt")
    .lean();
  const map = new Map();
  for (const attempt of attempts) preferAttempt(map, attempt);
  return map;
}

function preferAttempt(map, attempt) {
  const key = String(attempt.exam);
  const current = map.get(key);
  if (!current || (attempt.status === "in_progress" && current.status !== "in_progress") || (attempt.status === "submitted" && !["in_progress", "submitted"].includes(current.status))) map.set(key, attempt);
}

async function closeExpiredAttempt(attempt, now = new Date()) {
  if (attempt?.status !== "in_progress" || new Date(attempt.deadlineAt) > now) return false;
  attempt.status = "expired";
  attempt.closedAt = now;
  attempt.closeReason = "deadline_passed_without_submission";
  attempt.evaluationStatus = "pending";
  await attempt.save();
  return true;
}

router.get("/dashboard", async (request, response) => {
  try {
    const studentId = request.user._id;
    const now = new Date();
    await ExamAttempt.updateMany({ student: studentId, status: "in_progress", deadlineAt: { $lte: now } }, { $set: { status: "expired", closedAt: now, closeReason: "deadline_passed_without_submission", evaluationStatus: "pending" } });
    const assignedExams = await Exam.find({ eligibleStudents: studentId, status: "published" })
      .populate("lecturer", "name")
      .sort({ startsAt: 1 })
      .lean();
    const examIds = assignedExams.map((exam) => exam._id);
    const [attemptMap, publishedResults, unreadNotifications, recentAttempts, recentResults, recentNotifications, recentAnnouncements] = await Promise.all([
      getAttemptMap(studentId, examIds),
      ExamResult.find({ student: studentId, isPublished: true, exam: { $in: examIds } }).select("exam marksObtained maximumMarks").lean(),
      StudentNotification.countDocuments({ student: studentId, readAt: null }),
      ExamAttempt.find({ student: studentId, exam: { $in: examIds } }).populate("exam", "title module").sort({ updatedAt: -1 }).limit(5).lean(),
      ExamResult.find({ student: studentId, isPublished: true, exam: { $in: examIds } }).populate("exam", "title module").sort({ publishedAt: -1 }).limit(5).lean(),
      StudentNotification.find({ student: studentId }).sort({ createdAt: -1 }).limit(5).lean(),
      StudentNotification.find({ student: studentId, type: "announcement" }).sort({ createdAt: -1 }).limit(4).lean(),
    ]);

    const publishedResultMap = new Map(publishedResults.map((result) => [String(result.exam), result]));
    const validResultPercentages = publishedResults
      .filter((result) => result.maximumMarks > 0)
      .map((result) => (result.marksObtained / result.maximumMarks) * 100);
    const classified = assignedExams.map((exam) => ({
      ...publicExam(exam, attemptMap.get(String(exam._id)), now),
      resultPublished: publishedResultMap.has(String(exam._id)),
      marksAwarded: publishedResultMap.get(String(exam._id))?.marksObtained ?? null,
      maximumMarks: publishedResultMap.get(String(exam._id))?.maximumMarks ?? null,
    }));
    const upcomingExams = classified.filter((exam) => exam.status === "upcoming");
    const availableExams = classified.filter((exam) => exam.status === "ongoing" && !exam.attempt);
    const ongoingExams = classified.filter((exam) => exam.status === "ongoing");
    const completedExams = classified.filter((exam) => exam.status === "completed");
    const missedExams = classified.filter((exam) => exam.status === "missed");
    const recentActivity = [
      ...recentAttempts.map((attempt) => ({
        id: `attempt-${attempt._id}`,
        type: attempt.status === "submitted" ? "submission" : "exam_activity",
        title: attempt.exam?.title || "Examination activity",
        detail: attempt.status === "submitted"
          ? "Exam submitted"
          : attempt.status === "expired"
            ? "Exam deadline passed without a submission"
            : "Exam in progress",
        occurredAt: attempt.updatedAt,
      })),
      ...recentResults.map((result) => ({
        id: `result-${result._id}`,
        type: "result",
        title: result.exam?.title || "Exam result",
        detail: "A result has been published",
        occurredAt: result.publishedAt || result.updatedAt,
      })),
      ...recentNotifications.map((notification) => ({
        id: `notification-${notification._id}`,
        type: "notification",
        title: notification.title,
        detail: notification.message,
        occurredAt: notification.createdAt,
      })),
    ]
      .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
      .slice(0, 8);

    return response.json({
      profile: {
        id: String(request.user._id),
        name: request.user.name,
        email: request.user.email,
        role: request.user.role,
        studentId: request.user.studentId || null,
        programme: request.user.programme || null,
      },
      summary: {
        totalAssigned: assignedExams.length,
        available: availableExams.length,
        upcoming: upcomingExams.length,
        ongoing: ongoingExams.length,
        completed: completedExams.length,
        missed: missedExams.length,
        publishedResults: publishedResults.length,
        unreadNotifications,
      },
      performance: {
        averagePercentage: validResultPercentages.length
          ? validResultPercentages.reduce((sum, percentage) => sum + percentage, 0) / validResultPercentages.length
          : null,
        resultCount: publishedResults.length,
      },
      upcomingExams: upcomingExams.slice(0, 5),
      availableExams: availableExams.slice(0, 5),
      ongoingExams: ongoingExams.slice(0, 5),
      completedExams: completedExams.slice(0, 5),
      missedExams: missedExams.slice(0, 5),
      recentResults: recentResults.map((result) => ({
        id: String(result._id),
        title: result.exam?.title || "Examination result",
        module: result.exam?.module || null,
        marksObtained: result.marksObtained,
        maximumMarks: result.maximumMarks,
        percentage: result.maximumMarks > 0 ? (result.marksObtained / result.maximumMarks) * 100 : null,
        grade: result.grade || null,
        publishedAt: result.publishedAt,
      })),
      recentActivity,
      announcements: recentAnnouncements.map((notification) => ({
          id: String(notification._id),
          title: notification.title,
          message: notification.message,
          createdAt: notification.createdAt,
          readAt: notification.readAt,
        })),
      examTakingAvailable: true,
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to load the student dashboard.");
  }
});

async function listExams(request, response) {
  const pagination = readPagination(request.query);
  const status = request.studentExamStatus || request.query.status || "all";
  const sort = request.query.sort || "date_asc";
  if (!pagination) return response.status(400).json({ message: "Invalid pagination values." });
  if (!EXAM_FILTERS.has(status)) return response.status(400).json({ message: "Invalid exam status filter." });
  if (!["date_asc", "date_desc"].includes(sort)) return response.status(400).json({ message: "Invalid exam sort order." });
  const moduleName = typeof request.query.module === "string" ? request.query.module.trim().slice(0, 120) : "";
  if (moduleName) request.studentModuleFilter = moduleName;

  try {
    const studentId = request.user._id;
    const now = new Date();
    await ExamAttempt.updateMany({ student: studentId, status: "in_progress", deadlineAt: { $lte: now } }, { $set: { status: "expired", closedAt: now, closeReason: "deadline_passed_without_submission", evaluationStatus: "pending" } });
    const filter = { eligibleStudents: studentId, status: "published" };
    if (moduleName) filter.module = moduleName;
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    if (search) {
      const pattern = new RegExp(escapedSearch(search), "i");
      filter.$or = [{ title: pattern }, { module: pattern }];
    }

    const [allExams, attemptRows] = await Promise.all([
      Exam.find(filter).populate("lecturer", "name").sort({ startsAt: sort === "date_desc" ? -1 : 1 }).lean(),
      ExamAttempt.find({ student: studentId }).sort({ updatedAt: -1 }).select("exam status startedAt deadlineAt submittedAt updatedAt evaluationStatus closeReason closedAt answers.marksAwarded").lean(),
    ]);
    const attemptMap = new Map();
    for (const attempt of attemptRows) preferAttempt(attemptMap, attempt);
    const allItems = allExams.map((exam) => {
      const attempt = attemptMap.get(String(exam._id)) || null;
      const item = publicExam(exam, attempt, now);
      item.resultPublished = Boolean(attempt?.status === "submitted" && exam.resultPublished);
      item.submissionDate = attempt?.status === "submitted" ? attempt.submittedAt : null;
      item.missedReason = item.status === "missed" ? attempt?.closeReason || (!attempt ? "Exam window closed without an attempt." : "No valid submission was received before the deadline.") : null;
      return item;
    }).filter((item) => status === "all" || (status === "available" ? item.status === "ongoing" && item.attempt?.status !== "in_progress" : item.status === status));
    const total = allItems.length;
    const items = allItems.slice(pagination.skip, pagination.skip + pagination.limit);

    const modules = await Exam.distinct("module", { eligibleStudents: studentId, status: "published" });
    const publishedResults = await ExamResult.find({
      student: studentId,
      isPublished: true,
      exam: { $in: items.map((exam) => exam.id) },
    }).select("exam marksObtained maximumMarks grade publishedAt").lean();
    const publishedResultMap = new Map(publishedResults.map((result) => [String(result.exam), result]));

    return response.json({
      items: items.map((exam) => {
        const result = publishedResultMap.get(exam.id);
        return { ...exam, resultPublished: Boolean(result), marksAwarded: result?.marksObtained ?? null, result: result ? { marksObtained: result.marksObtained, maximumMarks: result.maximumMarks, grade: result.grade, publishedAt: result.publishedAt } : null };
      }),
      modules: modules.sort((left, right) => left.localeCompare(right)),
      publishedResults: [...publishedResultMap.keys()],
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
      serverNow: now,
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to load examinations.");
  }
}

router.get("/exams", listExams);
for (const [path, status] of [["all", "all"], ["available", "available"], ["upcoming", "upcoming"], ["ongoing", "ongoing"], ["completed", "completed"], ["missed", "missed"]]) {
  router.get(`/exams/${path}`, (request, response) => {
    request.studentExamStatus = status;
    return listExams(request, response);
  });
}

router.get("/exams/:examId", async (request, response) => {
  if (!validObjectId(request.params.examId)) {
    return response.status(400).json({ message: "Invalid examination id." });
  }

  try {
    const exam = await Exam.findOne({
      _id: request.params.examId,
      eligibleStudents: request.user._id,
      status: "published",
    })
      .populate("lecturer", "name")
      .lean();
    if (!exam) return response.status(404).json({ message: "Examination not found." });

    const attempts = await ExamAttempt.find({ student: request.user._id, exam: exam._id })
      .sort({ updatedAt: -1 })
      .lean();
    const selectedAttemptMap = new Map();
    for (const attempt of attempts) preferAttempt(selectedAttemptMap, attempt);
    const selectedAttempt = selectedAttemptMap.get(String(exam._id)) || null;
    const publishedResult = await ExamResult.findOne({
      student: request.user._id,
      exam: exam._id,
      isPublished: true,
    }).select("marksObtained maximumMarks grade publishedAt").lean();
    return response.json({
      exam: {
        ...publicExam(exam, selectedAttempt),
        resultPublished: Boolean(publishedResult),
        result: publishedResult
          ? {
              marksObtained: publishedResult.marksObtained,
              maximumMarks: publishedResult.maximumMarks,
              grade: publishedResult.grade,
              publishedAt: publishedResult.publishedAt,
            }
          : null,
      },
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to load examination details.");
  }
});

// Exam answers are kept separate from the lecturer-only question bank fields.
router.post("/exams/:examId/start", async (request, response) => {
  if (!validObjectId(request.params.examId)) return response.status(400).json({ message: "Invalid examination id." });
  try {
    const now = new Date();
    const exam = await Exam.findOne({ _id: request.params.examId, eligibleStudents: request.user._id, status: "published" }).lean();
    if (!exam) return response.status(404).json({ message: "Examination not found or not assigned to you." });
    if (now < exam.startsAt || now >= exam.endsAt) return response.status(409).json({ message: "This examination is outside its permitted start window." });
    const existing = await ExamAttempt.findOne({ student: request.user._id, exam: exam._id, status: "in_progress" }).sort({ createdAt: -1 });
    if (existing) return response.json({ serverNow: now, attempt: { id: String(existing._id), startedAt: existing.startedAt, deadlineAt: existing.deadlineAt, status: existing.status }, resumed: true });
    if (await ExamAttempt.exists({ student: request.user._id, exam: exam._id, status: "expired" })) return response.status(409).json({ message: "This exam attempt expired. A missed attempt cannot be restarted." });
    const attemptCount = await ExamAttempt.countDocuments({ student: request.user._id, exam: exam._id });
    if (attemptCount >= (exam.maxAttempts || 1)) return response.status(409).json({ message: "You have used the permitted number of attempts." });
    let snapshots = exam.questionSnapshots?.length ? exam.questionSnapshots : [];
    if (!snapshots.length) {
      const legacyQuestions = await Question.find({ _id: { $in: exam.questions }, lecturer: exam.lecturer }).lean();
      snapshots = legacyQuestions.map((q) => ({ originalQuestion: q._id, text: q.text, type: q.type, module: q.module, difficulty: q.difficulty, marks: q.marks, options: q.options, correctAnswer: q.correctAnswer, expectedAnswer: q.expectedAnswer, markingPoints: q.markingPoints, modelAnswer: q.modelAnswer, rubric: q.rubric, chartData: q.chartData, allowNegative: q.allowNegative, markingGuide: q.markingGuide, explanation: q.explanation }));
    }
    if (!snapshots.length) return response.status(409).json({ message: "Exam question snapshots are unavailable. Contact your lecturer." });
    const selected = exam.randomizeQuestions ? [...snapshots].sort(() => Math.random() - 0.5) : snapshots;
    const deadlineAt = new Date(Math.min(now.getTime() + exam.durationMinutes * 60000, new Date(exam.endsAt).getTime()));
    const attempt = await ExamAttempt.create({ student: request.user._id, exam: exam._id, status: "in_progress", startedAt: now, deadlineAt, evaluationStatus: "not_started", answers: selected.map((q) => ({ question: q.originalQuestion, questionSnapshot: q, response: null })) });
    return response.status(201).json({ serverNow: now, attempt: { id: String(attempt._id), startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, status: attempt.status }, resumed: false });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await ExamAttempt.findOne({ student: request.user._id, exam: request.params.examId, status: "in_progress" });
      if (existing) return response.json({ serverNow: new Date(), attempt: { id: String(existing._id), startedAt: existing.startedAt, deadlineAt: existing.deadlineAt, status: existing.status }, resumed: true });
    }
    return sendFailure(response, error, "Unable to start examination.");
  }
});

router.get("/attempts/:attemptId", async (request, response) => {
  if (!validObjectId(request.params.attemptId)) return response.status(400).json({ message: "Invalid attempt id." });
  try {
    const attempt = await ExamAttempt.findOne({ _id: request.params.attemptId, student: request.user._id }).populate({ path: "exam", select: "title module instructions totalMarks durationMinutes endsAt", match: { eligibleStudents: request.user._id, status: "published" } }).lean();
    if (!attempt || !attempt.exam) return response.status(404).json({ message: "Exam attempt not found." });
    const serverNow = new Date();
    await closeExpiredAttempt(attempt, serverNow);
    return response.json({ serverNow, attempt: { id: String(attempt._id), status: attempt.status, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, submittedAt: attempt.submittedAt, closedAt: attempt.closedAt, closeReason: attempt.closeReason, evaluationStatus: attempt.evaluationStatus, exam: attempt.exam, answers: attempt.answers.map((a) => ({ question: { _id: a.question, text: a.questionSnapshot?.text, type: a.questionSnapshot?.type, marks: a.questionSnapshot?.marks, options: a.questionSnapshot?.options, allowNegative: a.questionSnapshot?.allowNegative }, response: a.response, savedAt: a.savedAt })), flaggedQuestions: (attempt.flaggedQuestions || []).map(String) } });
  } catch (error) { return sendFailure(response, error, "Unable to load exam attempt."); }
});

router.patch("/attempts/:attemptId/answer", async (request, response) => {
  if (!validObjectId(request.params.attemptId)) return response.status(400).json({ message: "Invalid attempt id." });
  const { questionId, response: answer } = request.body || {};
  if (!validObjectId(questionId) || (typeof answer !== "string" && typeof answer !== "boolean" && !Array.isArray(answer)) || (typeof answer === "string" && answer.length > 10000) || (Array.isArray(answer) && answer.length > 20)) return response.status(400).json({ message: "A valid question and answer are required." });
  try {
    const attempt = await ExamAttempt.findOne({ _id: request.params.attemptId, student: request.user._id, status: "in_progress" });
    if (!attempt) return response.status(404).json({ message: "Active exam attempt not found." });
    if (await closeExpiredAttempt(attempt)) return response.status(409).json({ message: "The examination deadline has passed. Saved answers are preserved and this attempt is expired." });
    const item = attempt.answers.find((a) => String(a.question) === questionId);
    if (!item) return response.status(400).json({ message: "Question is not part of this attempt." });
    if (!await Exam.exists({ _id: attempt.exam, eligibleStudents: request.user._id, status: "published" })) return response.status(404).json({ message: "Examination is no longer available to this account." });
    const question = item.questionSnapshot;
    if (!question) return response.status(400).json({ message: "Question snapshot is not available for this attempt." });
    if (question.type === "mcq" && (typeof answer !== "string" || !question.options.some((option) => option.key === answer))) return response.status(400).json({ message: "Choose one of the available answer options." });
    if (question.type === "true_false" && !["true", "false"].includes(String(answer).toLowerCase())) return response.status(400).json({ message: "Choose True or False." });
    let storedAnswer = answer;
    if (question.type === "bar_chart") {
      const normalized = normalizeBarResponse(answer, question.allowNegative === true);
      if (normalized.error) return response.status(400).json({ message: normalized.error });
      storedAnswer = normalized.data;
    } else if (Array.isArray(answer)) return response.status(400).json({ message: "This question does not accept chart data." });
    item.response = storedAnswer; item.savedAt = new Date(); await attempt.save();
    return response.json({ success: true, savedAt: item.savedAt, serverNow: new Date(), deadlineAt: attempt.deadlineAt });
  } catch (error) { return sendFailure(response, error, "Unable to save answer."); }
});

router.patch("/attempts/:attemptId/flags", async (request, response) => {
  if (!validObjectId(request.params.attemptId)) return response.status(400).json({ message: "Invalid attempt id." });
  const { questionId, flagged } = request.body || {};
  if (!validObjectId(questionId) || typeof flagged !== "boolean") return response.status(400).json({ message: "A valid question and flag state are required." });
  try {
    const attempt = await ExamAttempt.findOne({ _id: request.params.attemptId, student: request.user._id, status: "in_progress" });
    if (!attempt) return response.status(404).json({ message: "Active exam attempt not found." });
    if (await closeExpiredAttempt(attempt)) return response.status(409).json({ message: "The examination deadline has passed." });
    if (!attempt.answers.some((a) => String(a.question) === questionId)) return response.status(400).json({ message: "Question is not part of this attempt." });
    const ids = new Set((attempt.flaggedQuestions || []).map(String));
    if (flagged) ids.add(questionId); else ids.delete(questionId);
    attempt.flaggedQuestions = [...ids]; await attempt.save();
    return response.json({ flaggedQuestions: attempt.flaggedQuestions.map(String) });
  } catch (error) { return sendFailure(response, error, "Unable to save question flag."); }
});

router.post("/attempts/:attemptId/activity", async (request, response) => {
  if (!validObjectId(request.params.attemptId)) return response.status(400).json({ message: "Invalid attempt id." });
  const allowed = new Set(["fullscreen_exit", "visibility_hidden", "window_blur", "copy_attempt", "cut_attempt", "paste_attempt", "context_menu"]);
  const events = request.body?.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > 10 || events.some((event) => !allowed.has(event?.type) || typeof event?.dedupeKey !== "string" || event.dedupeKey.length > 120)) return response.status(400).json({ message: "Invalid activity event metadata." });
  try {
    const attempt = await ExamAttempt.findOne({ _id: request.params.attemptId, student: request.user._id, status: "in_progress" });
    if (!attempt) return response.status(404).json({ message: "Active exam attempt not found." });
    if (await closeExpiredAttempt(attempt)) return response.status(409).json({ message: "The examination deadline has passed." });
    const existing = new Set((attempt.browserActivity || []).map((event) => event.dedupeKey).filter(Boolean));
    for (const event of events) if (!existing.has(event.dedupeKey)) { attempt.browserActivity.push({ type: event.type, occurredAt: new Date(), dedupeKey: event.dedupeKey }); existing.add(event.dedupeKey); }
    await attempt.save(); return response.json({ success: true });
  } catch (error) { return sendFailure(response, error, "Unable to record browser activity."); }
});
router.post("/attempts/:attemptId/submit", async (request, response) => {
  if (!validObjectId(request.params.attemptId)) return response.status(400).json({ message: "Invalid attempt id." });
  try {
    const attempt = await ExamAttempt.findOne({ _id: request.params.attemptId, student: request.user._id }).populate({ path: "exam", select: "title lecturer status eligibleStudents", match: { eligibleStudents: request.user._id, status: "published" } });
    if (!attempt) return response.status(404).json({ message: "Exam attempt not found." });
    if (attempt.status !== "in_progress") return response.status(409).json({ message: "This attempt has already been submitted or expired.", status: attempt.status });
    if (await closeExpiredAttempt(attempt)) return response.status(409).json({ message: "The examination deadline passed before submission. Your saved answers are preserved; this attempt is expired.", status: "expired", closedAt: attempt.closedAt });
    for (const answer of attempt.answers) {
      const q = answer.questionSnapshot;
      if (!q) continue;
      if (q.type === "bar_chart") {
        const normalized = normalizeBarResponse(answer.response, q.allowNegative === true, { submitting: true });
        if (normalized.error) return response.status(400).json({ message: normalized.error });
        answer.response = normalized.data;
      }
      const suggestion = evaluateAnswer(q, answer.response);
      answer.automaticMarks = suggestion.marks;
      answer.marksAwarded = suggestion.marks;
      answer.markingMethod = suggestion.method;
      answer.markingFeedback = suggestion.criterionScores?.map((score) => ({ point: score.criterion, marksAwarded: score.marksAwarded, maximumMarks: score.maximumMarks, rationale: score.feedback, requiresReview: score.requiresReview })) || [{ point: "Correct answer", marksAwarded: suggestion.marks, maximumMarks: Number(q.marks), rationale: suggestion.rationale, requiresReview: suggestion.requiresReview }];
      if (suggestion.criterionScores) answer.criterionScores = suggestion.criterionScores;
      if (q.type === "short_answer" || q.type === "essay") answer.rubricCalculatedMarks = suggestion.marks;
      answer.marksSource = "automatic";
      answer.evaluatedAt = new Date();
      answer.reviewed = false;
    }
    const now = new Date(); attempt.status = "submitted"; attempt.submittedAt = now; attempt.closedAt = null; attempt.closeReason = null; attempt.evaluationStatus = "pending"; attempt.evaluationFinalizedAt = null; attempt.evaluationFinalizedBy = null; await attempt.save();
    const dedupeKey = `submission:${attempt._id}`;
    await LecturerNotification.updateOne({ lecturer: attempt.exam.lecturer, dedupeKey }, { $setOnInsert: { lecturer: attempt.exam.lecturer, dedupeKey, exam: attempt.exam._id, type: "submission", title: "New student submission", message: `${request.user.name} submitted ${attempt.exam.title}.` } }, { upsert: true });
    return response.json({ success: true, status: attempt.status, submittedAt: attempt.submittedAt });
  } catch (error) { return sendFailure(response, error, "Unable to submit examination."); }
});

router.get("/results", async (request, response) => {
  const pagination = readPagination(request.query);
  if (!pagination) return response.status(400).json({ message: "Invalid pagination values." });
  const sort = request.query.sort || "published_desc";
  if (!["published_desc", "published_asc", "marks_desc", "marks_asc"].includes(sort)) {
    return response.status(400).json({ message: "Invalid result sort order." });
  }

  try {
    const examFilter = { eligibleStudents: request.user._id, status: "published" };
    const moduleName = typeof request.query.module === "string" ? request.query.module.trim().slice(0, 120) : "";
    if (moduleName) examFilter.module = moduleName;
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    if (search) examFilter.title = new RegExp(escapedSearch(search), "i");
    const eligibleExams = await Exam.find(examFilter).select("_id").lean();
    const filter = {
      student: request.user._id,
      isPublished: true,
      exam: { $in: eligibleExams.map((exam) => exam._id) },
    };
    const sortOrder = sort === "published_asc" ? { publishedAt: 1 } : sort === "marks_desc" ? { marksObtained: -1 } : sort === "marks_asc" ? { marksObtained: 1 } : { publishedAt: -1 };
    const [results, total] = await Promise.all([
      ExamResult.find(filter)
        .populate("exam", "title module startsAt")
        .populate("attempt", "submittedAt")
        .sort(sortOrder)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      ExamResult.countDocuments(filter),
    ]);
    const modules = await Exam.distinct("module", { eligibleStudents: request.user._id, status: "published" });
    return response.json({
      items: results.map((result) => ({
        id: String(result._id),
        exam: result.exam ? { title: result.exam.title, module: result.exam.module } : null,
        submissionDate: result.attempt?.submittedAt || null,
        marksObtained: result.marksObtained,
        maximumMarks: result.maximumMarks,
        percentage: result.maximumMarks > 0 ? (result.marksObtained / result.maximumMarks) * 100 : null,
        grade: result.grade || null,
        publishedAt: result.publishedAt,
      })),
      modules: modules.sort((left, right) => left.localeCompare(right)),
      page: pagination.page,
      limit: pagination.limit,
      total,
      pages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to load published results.");
  }
});

router.get("/analytics", async (request, response) => {
  try {
    const eligibleExams = await Exam.find({ eligibleStudents: request.user._id, status: "published" }).select("_id").lean();
    const results = await ExamResult.find({ student: request.user._id, isPublished: true })
      .where("exam").in(eligibleExams.map((exam) => exam._id))
      .populate("exam", "title module startsAt")
      .populate("attempt", "submittedAt")
      .sort({ publishedAt: 1 })
      .lean();
    const rows = results.map((result) => ({
      id: String(result._id),
      exam: result.exam?.title || "Examination",
      module: result.exam?.module || "Unassigned",
      marksObtained: result.marksObtained,
      maximumMarks: result.maximumMarks,
      percentage: result.maximumMarks > 0 ? (result.marksObtained / result.maximumMarks) * 100 : null,
      publishedAt: result.publishedAt,
      examDate: result.exam?.startsAt || null,
      submissionDate: result.attempt?.submittedAt || null,
    }));
    const validRows = rows.filter((row) => row.percentage !== null);
    const grouped = new Map();
    for (const row of validRows) {
      const group = grouped.get(row.module) || { module: row.module, total: 0, count: 0 };
      group.total += row.percentage;
      group.count += 1;
      grouped.set(row.module, group);
    }
    return response.json({
      averagePercentage: validRows.length
        ? validRows.reduce((total, row) => total + row.percentage, 0) / validRows.length
        : null,
      highestPercentage: validRows.length ? Math.max(...validRows.map((row) => row.percentage)) : null,
      results: rows,
      byModule: [...grouped.values()].map((group) => ({
        module: group.module,
        averagePercentage: group.total / group.count,
        resultCount: group.count,
      })),
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to load performance analytics.");
  }
});

router.get("/notifications", async (request, response) => {
  const pagination = readPagination(request.query);
  if (!pagination) return response.status(400).json({ message: "Invalid pagination values." });

  try {
    const filter = { student: request.user._id };
    const notificationType = request.query.type;
    if (notificationType && !["announcement", "schedule_change", "result_published", "academic", "exam_published", "exam_started"].includes(notificationType)) {
      return response.status(400).json({ message: "Invalid notification type." });
    }
    if (notificationType) filter.type = notificationType;
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    if (search) {
      const pattern = new RegExp(escapedSearch(search), "i");
      filter.$or = [{ title: pattern }, { message: pattern }];
    }
    const [items, total, unreadCount] = await Promise.all([
      StudentNotification.find(filter).populate("exam", "title module startsAt endsAt status")
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      StudentNotification.countDocuments(filter),
      StudentNotification.countDocuments({ student: request.user._id, readAt: null }),
    ]);
    return response.json({ items, unreadCount, page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) });
  } catch (error) {
    return sendFailure(response, error, "Unable to load notifications.");
  }
});

router.patch("/notifications/read-all", async (request, response) => {
  try {
    const result = await StudentNotification.updateMany(
      { student: request.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return response.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    return sendFailure(response, error, "Unable to mark notifications as read.");
  }
});

router.patch("/notifications/:notificationId/read", async (request, response) => {
  if (!validObjectId(request.params.notificationId)) {
    return response.status(400).json({ message: "Invalid notification id." });
  }

  try {
    const notification = await StudentNotification.findOne({
      _id: request.params.notificationId,
      student: request.user._id,
    });
    if (!notification) return response.status(404).json({ message: "Notification not found." });
    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
    }
    return response.json({ success: true, notification: { id: String(notification._id), readAt: notification.readAt } });
  } catch (error) {
    return sendFailure(response, error, "Unable to update notification.");
  }
});

router.get("/profile", (request, response) => {
  return response.json({
    id: String(request.user._id),
    name: request.user.name,
    email: request.user.email,
    studentId: request.user.studentId || null,
    programme: request.user.programme || null,
    role: request.user.role,
  });
});

router.patch("/profile", async (request, response) => {
  const allowedFields = ["name", "programme"];
  const submittedFields = Object.keys(request.body || {});
  if (!submittedFields.length || submittedFields.some((field) => !allowedFields.includes(field))) {
    return response.status(400).json({ message: "Only name and programme may be updated." });
  }

  const updates = {};
  for (const field of submittedFields) {
    const value = request.body[field];
    if (typeof value !== "string" || value.trim().length > 120 || (field === "name" && !value.trim())) {
      return response.status(400).json({ message: `Invalid ${field} value.` });
    }
    updates[field] = value.trim() || null;
  }

  try {
    const user = await User.findOneAndUpdate(
      { _id: request.user._id, role: "student", isActive: true },
      { $set: updates },
      { new: true, runValidators: true, projection: "name email studentId programme role" }
    );
    if (!user) return response.status(404).json({ message: "Student profile not found." });
    return response.json({
      id: String(user._id),
      name: user.name,
      email: user.email,
      studentId: user.studentId || null,
      programme: user.programme || null,
      role: user.role,
    });
  } catch (error) {
    return sendFailure(response, error, "Unable to update profile.");
  }
});

module.exports = router;
