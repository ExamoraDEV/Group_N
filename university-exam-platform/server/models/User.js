const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    studentId: {
      type: String,
      trim: true,
      default: null,
    },

    programme: {
      type: String,
      trim: true,
      default: null,
    },

    department: { type: String, trim: true, default: null },
    lecturerId: { type: String, trim: true, default: null },
    lastLoginAt: { type: Date, default: null },
    isDeactivated: { type: Boolean, default: false, index: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      required: true,
      enum: ["student", "lecturer", "admin"],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: "string" } } });
userSchema.index({ lecturerId: 1 }, { unique: true, partialFilterExpression: { lecturerId: { $type: "string" } } });

module.exports = mongoose.model("User", userSchema);
