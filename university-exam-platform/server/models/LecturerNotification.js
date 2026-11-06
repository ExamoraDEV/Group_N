const mongoose = require("mongoose");

const lecturerNotificationSchema = new mongoose.Schema({
  lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["submission", "reminder", "result", "academic", "exam"], default: "academic" },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  message: { type: String, required: true, trim: true, maxlength: 1000 },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", default: null },
  readAt: { type: Date, default: null },
  dedupeKey: { type: String, default: null },
}, { timestamps: true });

lecturerNotificationSchema.index({ lecturer: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } });
lecturerNotificationSchema.index({ lecturer: 1, createdAt: -1 });
module.exports = mongoose.model("LecturerNotification", lecturerNotificationSchema);
