function buildParticipation({ exam, students, attempts }) {
  const eligibleById = new Map((students || []).map((student) => [String(student._id), student]));
  const attemptsByStudent = new Map();

  for (const attempt of attempts || []) {
    const studentId = String(attempt.student?._id || attempt.student || "");
    if (!eligibleById.has(studentId)) continue;
    const list = attemptsByStudent.get(studentId) || [];
    list.push(attempt);
    attemptsByStudent.set(studentId, list);
  }

  const attemptedStudents = [];
  const notAttemptedStudents = [];
  let submittedStudents = 0;

  for (const [studentId, student] of eligibleById) {
    const studentAttempts = attemptsByStudent.get(studentId) || [];
    if (!studentAttempts.length) {
      notAttemptedStudents.push(student);
      continue;
    }

    studentAttempts.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
      || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (studentAttempts.some((attempt) => attempt.status === "submitted")) submittedStudents += 1;
    const latest = studentAttempts[0];
    attemptedStudents.push({
      ...student,
      attemptId: String(latest._id),
      attemptNumber: latest.attemptNumber || 1,
      attemptStatus: latest.status,
      evaluationStatus: latest.status === "submitted" ? latest.evaluationStatus : null,
      startedAt: latest.startedAt || null,
      submittedAt: latest.submittedAt || null,
    });
  }

  const sortByName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  attemptedStudents.sort(sortByName);
  notAttemptedStudents.sort(sortByName);
  const totalEligible = eligibleById.size;
  return {
    exam,
    summary: {
      totalEligible,
      attempted: attemptedStudents.length,
      notAttempted: notAttemptedStudents.length,
      submitted: submittedStudents,
      submissionRate: totalEligible ? submittedStudents / totalEligible * 100 : 0,
    },
    attemptedStudents,
    notAttemptedStudents,
  };
}

module.exports = { buildParticipation };
