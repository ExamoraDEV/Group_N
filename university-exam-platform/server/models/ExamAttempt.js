const mongoose = require("mongoose");

const examAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
    status: { type: String, enum: ["in_progress", "submitted", "expired"], required: true, index: true },
    startedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    closeReason: { type: String, enum: ["deadline_passed_without_submission", "exam_window_closed_without_submission"], default: null },
    answers: [{
      question: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
      questionSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
      response: { type: mongoose.Schema.Types.Mixed, default: null },
      savedAt: { type: Date, default: null },
      marksAwarded: { type: Number, default: null, min: 0 },
      feedback: { type: String, default: "", maxlength: 2000 },
      automaticMarks: { type: Number, default: null, min: 0 },
      rubricCalculatedMarks: { type: Number, default: null, min: 0 },
      manualOverrideMarks: { type: Number, default: null, min: 0 },
      marksSource: { type: String, enum: ["automatic", "rubric", "manual_override", "lecturer"], default: "automatic" },
      reviewed: { type: Boolean, default: false },
      markingMethod: { type: String, default: "", maxlength: 80 },
      markingFeedback: [{ point: String, marksAwarded: Number, maximumMarks: Number, rationale: String, requiresReview: Boolean }],
      criterionScores: [{ criterion: String, expectedConcept: String, marksAwarded: Number, automaticMarks: Number, maximumMarks: Number, feedback: String, requiresReview: Boolean, matchedPhrase: String }],
      evaluationHistory: [{ marksAwarded: Number, automaticMarks: Number, rubricCalculatedMarks: Number, manualOverrideMarks: Number, marksSource: String, feedback: String, criterionScores: [{ criterion: String, expectedConcept: String, marksAwarded: Number, automaticMarks: Number, maximumMarks: Number, feedback: String, requiresReview: Boolean, matchedPhrase: String }], evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, evaluatedAt: Date }],
      evaluatedAt: { type: Date, default: null },
      evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],
    flaggedQuestions: [{ type: mongoose.Schema.Types.ObjectId }],
    browserActivity: [{ type: { type: String, enum: ["fullscreen_exit", "visibility_hidden", "window_blur", "copy_attempt", "cut_attempt", "paste_attempt", "context_menu"], required: true }, occurredAt: { type: Date, required: true }, dedupeKey: { type: String, maxlength: 120 } }],
    evaluationStatus: { type: String, enum: ["not_started", "pending", "partial", "evaluated", "finalized"], default: "not_started" },
    evaluationFinalizedAt: { type: Date, default: null },
    evaluationFinalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

examAttemptSchema.index({ student: 1, status: 1, updatedAt: -1 });
examAttemptSchema.index({ student: 1, exam: 1 }, { unique: true, partialFilterExpression: { status: "in_progress" } });

module.exports = mongoose.model("ExamAttempt", examAttemptSchema);
