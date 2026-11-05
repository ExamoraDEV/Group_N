const Exam = require("../models/Exam");
const ExamAttempt = require("../models/ExamAttempt");
const StudentNotification = require("../models/StudentNotification");
const User = require("../models/User");

let timer = null;
let running = false;

function formatSchedule(value) {
  const timeZone = process.env.UNIVERSITY_TIME_ZONE || "Asia/Colombo";
  try { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)); }
  catch { return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" }).format(new Date(value)); }
}

async function upsertNotifications(exam, type, students) {
  if (!students.length) return;
  const publication = type === "exam_published";
  const title = publication ? "New Exam Published" : "Your Exam Has Started";
  const scheduledAt = formatSchedule(exam.startsAt);
  const message = publication
    ? `A new exam, "${exam.title}", has been published for ${exam.module}. It starts ${scheduledAt}.`
    : `Your ${exam.module} exam, "${exam.title}", is now open. Open Ongoing Exams to begin.`;
  const href = `/student/exams/${exam._id}/attempt`;
  const operations = students.map((student) => ({
    updateOne: {
      filter: { student, dedupeKey: `${type}:${exam._id}` },
      update: { $setOnInsert: { student, type, title, message, exam: exam._id, href, dedupeKey: `${type}:${exam._id}` } },
      upsert: true,
    },
  }));
  for (let offset = 0; offset < operations.length; offset += 500) {
    await StudentNotification.bulkWrite(operations.slice(offset, offset + 500), { ordered: false });
  }
}

async function createPublicationNotifications(exam) {
  await upsertNotifications(exam, "exam_published", exam.eligibleStudents || []);
  await Exam.updateOne({ _id: exam._id, status: "published", publicationNotificationsAt: null }, { $set: { publicationNotificationsAt: new Date() } });
}

async function reconcileExamLifecycle(now = new Date()) {
  if (running) return;
  running = true;
  try {
    await ExamAttempt.updateMany(
      { status: "in_progress", deadlineAt: { $lte: now } },
      { $set: { status: "expired", closedAt: now, closeReason: "deadline_passed_without_submission", evaluationStatus: "pending" } }
    );

    const exams = await Exam.find({
      status: "published",
      publishedAt: { $ne: null },
      $or: [
        { publicationNotificationsAt: null },
        { startNotificationsAt: null, startsAt: { $lte: now } },
      ],
    })
      .select("_id title module startsAt endsAt eligibleStudents publishedAt publicationNotificationsAt startNotificationsAt")
      .lean();
    for (const exam of exams) {
      if (!exam.publicationNotificationsAt) await createPublicationNotifications(exam);
      if (exam.startNotificationsAt) continue;
      if (new Date(exam.startsAt) > now) continue;
      const activeStudents = await User.find({ _id: { $in: exam.eligibleStudents || [] }, role: "student", isActive: true }).select("_id").lean();
      const eligibleIds = activeStudents.map((student) => student._id);
      const attempts = await ExamAttempt.find({ exam: exam._id, student: { $in: exam.eligibleStudents || [] } })
        .select("student status deadlineAt")
        .lean();
      const attemptByStudent = new Map(attempts.map((attempt) => [String(attempt.student), attempt]));
      const eligibleToNotify = eligibleIds.filter((student) => {
        const attempt = attemptByStudent.get(String(student));
        if (attempt && ["submitted", "expired"].includes(attempt.status)) return false;
        if (new Date(exam.endsAt) <= now && !attempt) return false;
        return true;
      });
      if (eligibleToNotify.length) await upsertNotifications(exam, "exam_started", eligibleToNotify);
      await Exam.updateOne({ _id: exam._id, status: "published", startNotificationsAt: null }, { $set: { startNotificationsAt: now } });
    }
  } finally {
    running = false;
  }
}

function startExamLifecycleWorker({ intervalMs = 20000, logger = console } = {}) {
  if (timer) return timer;
  const run = () => reconcileExamLifecycle().catch((error) => logger.error("Exam lifecycle reconciliation failed:", error.name));
  run();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
  return timer;
}

function stopExamLifecycleWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { createPublicationNotifications, reconcileExamLifecycle, startExamLifecycleWorker, stopExamLifecycleWorker };
