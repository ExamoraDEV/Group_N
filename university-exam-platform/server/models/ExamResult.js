const mongoose = require("mongoose");

const examResultSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: "ExamAttempt", default: null },
    marksObtained: { type: Number, required: true, min: 0 },
    maximumMarks: { type: Number, required: true, min: 0 },
    grade: { type: String, default: null, trim: true },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

examResultSchema.index({ student: 1, isPublished: 1, publishedAt: -1 });

module.exports = mongoose.model("ExamResult", examResultSchema);
