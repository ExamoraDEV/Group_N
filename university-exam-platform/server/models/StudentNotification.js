const mongoose = require("mongoose");

const studentNotificationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["announcement", "schedule_change", "result_published", "academic", "exam_published", "exam_started"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    href: { type: String, default: null, trim: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", default: null, index: true },
    dedupeKey: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentNotificationSchema.index({ student: 1, readAt: 1, createdAt: -1 });
studentNotificationSchema.index({ student: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });

module.exports = mongoose.model("StudentNotification", studentNotificationSchema);
