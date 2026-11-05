function studentExamState(exam, attempt, now = new Date()) {
  if (attempt?.status === "submitted") return "completed";
  if (attempt?.status === "expired") return "missed";
  if (attempt?.status === "in_progress") {
    return Number.isFinite(new Date(attempt.deadlineAt).getTime()) && new Date(attempt.deadlineAt) > now
      ? "ongoing"
      : "missed";
  }
  if (new Date(exam.startsAt) > now) return "upcoming";
  if (new Date(exam.startsAt) <= now && new Date(exam.endsAt) > now) return "ongoing";
  return "missed";
}

module.exports = { studentExamState };
