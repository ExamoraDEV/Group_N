const mongoose = require("mongoose");

const snapshotSchema = new mongoose.Schema({
  originalQuestion: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  text: { type: String, required: true }, type: { type: String, enum: ["mcq", "true_false", "short_answer", "essay", "bar_chart"], required: true },
  module: String, difficulty: String, marks: { type: Number, required: true, min: 0.5 }, options: [{ text: String, key: String }],
  correctAnswer: String, expectedAnswer: String, markingPoints: [{ description: String, expectedConcept: String, keywords: [String], marks: Number, explanation: String }],
  modelAnswer: String, rubric: [{ description: String, expectedConcept: String, keywords: [String], marks: Number, explanation: String }], chartData: [{ category: String, value: Number }], allowNegative: { type: Boolean, default: false }, markingGuide: String, explanation: String,
}, { _id: false });

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    instructions: { type: String, default: "", trim: true },
    lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    eligibleStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },
    publicationNotificationsAt: { type: Date, default: null },
    startNotificationsAt: { type: Date, default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    totalMarks: { type: Number, required: true, min: 0 },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
    questionMarkAllocations: { type: mongoose.Schema.Types.Mixed, default: {} },
    questionSnapshots: { type: [snapshotSchema], default: [] },
    maxAttempts: { type: Number, default: 1, min: 1, max: 10 },
    randomizeQuestions: { type: Boolean, default: false },
    autoSubmit: { type: Boolean, default: true },
    resultPublished: { type: Boolean, default: false },
    category: { type: String, default: "Examination", trim: true },
  },
  { timestamps: true }
);

examSchema.index({ eligibleStudents: 1, status: 1, startsAt: 1 });
examSchema.index({ lecturer: 1, startsAt: 1 });

module.exports = mongoose.model("Exam", examSchema);
