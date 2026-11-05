const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { normalizeEmail, emailMatchesRole } = require("../auth/emailPolicy");
const { activityStatus } = require("../services/accountActivity");

const router = express.Router();
const ROLES = Object.freeze({ lecturers: "lecturer", students: "student" });
const ACCOUNT_FIELDS = "name email role studentId lecturerId programme department isActive isDeactivated deactivatedAt deactivatedBy lastLoginAt createdAt updatedAt";
const esc = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validId = (value) => typeof value === "string" && mongoose.isValidObjectId(value);
const roleFromPath = (value) => ROLES[value] || null;
const safeError = (res, error, fallback) => {
  if (error?.code === 11000) return res.status(409).json({ message: "That email or account ID is already in use." });
  if (error?.name === "ValidationError" || error?.name === "CastError") return res.status(400).json({ message: error.message });
  console.error("Admin account operation failed:", error?.name || "UnknownError");
  return res.status(500).json({ message: fallback });
};
const isManageableActive = { isDeactivated: { $ne: true }, isActive: { $ne: false } };
const deactivatedFilter = { $or: [{ isDeactivated: true }, { isActive: false }] };
const cutoffDate = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

function publicAccount(user, now = new Date()) {
  const data = typeof user.toObject === "function" ? user.toObject() : user;
  delete data.password;
  delete data.__v;
  return { ...data, activityStatus: activityStatus(data, now) };
}

router.get("/dashboard", async (_req, res) => {
  try {
    const cutoff = cutoffDate();
    const result = {};
    for (const role of ["lecturer", "student"]) {
      const prefix = role === "lecturer" ? "Lecturer" : "Student";
      const base = { role };
      const activeAccount = { ...base, ...isManageableActive };
      const [total, deactivated, active] = await Promise.all([
        User.countDocuments(base),
        User.countDocuments({ ...base, ...deactivatedFilter }),
        User.countDocuments({ ...activeAccount, lastLoginAt: { $gte: cutoff } }),
      ]);
      result[`total${prefix}Accounts`] = total;
      result[`deactivated${prefix}Accounts`] = deactivated;
      result[`active${prefix}Accounts`] = active;
      result[`inactive${prefix}Accounts`] = Math.max(0, total - deactivated - active);
    }
    return res.json({ stats: result, activityThresholdDays: 30 });
  } catch (error) { return safeError(res, error, "Unable to load account statistics."); }
});

router.post("/accounts/:role", async (req, res) => {
  const role = roleFromPath(req.params.role);
  if (!role) return res.status(404).json({ message: "Account type not found." });
  const { name, email, password, confirmPassword } = req.body || {};
  const accountId = role === "student" ? req.body?.studentId : req.body?.lecturerId;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) return res.status(400).json({ message: "Enter a name up to 120 characters." });
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !emailMatchesRole(normalizedEmail, role)) return res.status(400).json({ message: `Enter a valid ${role} university email address.` });
  const normalizedId = typeof accountId === "string" ? accountId.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(normalizedId)) return res.status(400).json({ message: `Enter a valid ${role === "student" ? "Student" : "Lecturer"} ID.` });
  if (typeof password !== "string" || Buffer.byteLength(password, "utf8") < 10 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ message: "Password must be between 10 and 72 UTF-8 bytes." });
  if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match." });
  try {
    const idField = role === "student" ? "studentId" : "lecturerId";
    const existing = await User.exists({ $or: [{ email: normalizedEmail }, { [idField]: normalizedId }] });
    if (existing) return res.status(409).json({ message: "That email or account ID is already in use." });
    const user = await User.create({ name: name.trim(), email: normalizedEmail, [idField]: normalizedId, role, password: await bcrypt.hash(password, 12), isActive: true, isDeactivated: false });
    return res.status(201).json({ account: publicAccount(user) });
  } catch (error) { return safeError(res, error, "Unable to create account."); }
});

router.get("/accounts/:role", async (req, res) => {
  const role = roleFromPath(req.params.role);
  if (!role) return res.status(404).json({ message: "Account type not found." });
  const { search = "", status = "all", sort = "name_asc" } = req.query;
  if (typeof search !== "string" || search.length > 100) return res.status(400).json({ message: "Search text is too long." });
  if (!["all", "active", "inactive", "never_logged_in"].includes(status)) return res.status(400).json({ message: "Invalid activity status." });
  const sortFields = { name_asc: { name: 1 }, name_desc: { name: -1 }, recent: { lastLoginAt: -1, name: 1 }, oldest: { lastLoginAt: 1, name: 1 }, created: { createdAt: -1 } };
  if (!sortFields[sort]) return res.status(400).json({ message: "Invalid sort order." });
  const filter = { role, ...isManageableActive };
  if (status === "active") filter.lastLoginAt = { $gte: cutoffDate() };
  if (status === "inactive") filter.$and = [{ ...isManageableActive }, { $or: [{ lastLoginAt: null }, { lastLoginAt: { $lt: cutoffDate() } }] }];
  if (status === "never_logged_in") filter.lastLoginAt = null;
  if (search.trim()) {
    const matcher = new RegExp(esc(search.trim()), "i");
    filter.$or = [{ name: matcher }, { email: matcher }, { studentId: matcher }, { lecturerId: matcher }];
  }
  try {
    const rows = await User.find(filter).select(ACCOUNT_FIELDS).sort(sortFields[sort]).limit(500).lean();
    return res.json({ items: rows.map((row) => publicAccount(row)) });
  } catch (error) { return safeError(res, error, "Unable to load accounts."); }
});

router.get("/activity", async (req, res) => {
  const { search = "", sort = "recent" } = req.query;
  if (typeof search !== "string" || search.length > 100) return res.status(400).json({ message: "Search text is too long." });
  const sortFields = { recent: { lastLoginAt: -1, name: 1 }, oldest: { lastLoginAt: 1, name: 1 }, name_asc: { name: 1 }, name_desc: { name: -1 } };
  if (!sortFields[sort]) return res.status(400).json({ message: "Invalid sort order." });
  const filter = { role: { $in: ["student", "lecturer"] }, ...isManageableActive };
  if (search.trim()) {
    const matcher = new RegExp(esc(search.trim()), "i");
    filter.$or = [{ name: matcher }, { email: matcher }, { studentId: matcher }, { lecturerId: matcher }];
  }
  try {
    const rows = await User.find(filter).select(ACCOUNT_FIELDS).sort(sortFields[sort]).limit(500).lean();
    return res.json({ items: rows.map((row) => publicAccount(row)) });
  } catch (error) { return safeError(res, error, "Unable to load account activity."); }
});

router.get("/deactivated/:role", async (req, res) => {
  const role = roleFromPath(req.params.role);
  if (!role) return res.status(404).json({ message: "Account type not found." });
  const { search = "" } = req.query;
  if (typeof search !== "string" || search.length > 100) return res.status(400).json({ message: "Search text is too long." });
  const filter = { role, ...deactivatedFilter };
  if (search.trim()) {
    const matcher = new RegExp(esc(search.trim()), "i");
    filter.$and = [deactivatedFilter, { $or: [{ name: matcher }, { email: matcher }, { studentId: matcher }, { lecturerId: matcher }] }];
  }
  try {
    const rows = await User.find(filter).select(ACCOUNT_FIELDS).populate("deactivatedBy", "name email").sort({ deactivatedAt: -1, name: 1 }).limit(500).lean();
    return res.json({ items: rows.map((row) => publicAccount(row)) });
  } catch (error) { return safeError(res, error, "Unable to load deactivated accounts."); }
});

router.patch("/accounts/:role/:id/deactivate", async (req, res) => {
  const role = roleFromPath(req.params.role);
  if (!role) return res.status(404).json({ message: "Account type not found." });
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid account ID." });
  try {
    const account = await User.findOneAndUpdate({ _id: req.params.id, role, ...isManageableActive }, { $set: { isDeactivated: true, deactivatedAt: new Date(), deactivatedBy: req.user._id } }, { new: true }).select(ACCOUNT_FIELDS);
    if (!account) return res.status(404).json({ message: "Active account not found." });
    return res.json({ account: publicAccount(account) });
  } catch (error) { return safeError(res, error, "Unable to deactivate account."); }
});

router.patch("/deactivated/:role/:id/reactivate", async (req, res) => {
  const role = roleFromPath(req.params.role);
  if (!role) return res.status(404).json({ message: "Account type not found." });
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid account ID." });
  try {
    const account = await User.findOneAndUpdate({ _id: req.params.id, role, ...deactivatedFilter }, { $set: { isDeactivated: false, isActive: true } }, { new: true }).select(ACCOUNT_FIELDS);
    if (!account) return res.status(404).json({ message: "Deactivated account not found." });
    return res.json({ account: publicAccount(account) });
  } catch (error) { return safeError(res, error, "Unable to reactivate account."); }
});

module.exports = router;
