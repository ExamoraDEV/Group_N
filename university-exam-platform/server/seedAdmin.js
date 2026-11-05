require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const { normalizeEmail, emailMatchesRole } = require("./auth/emailPolicy");

async function seedAdmin() {
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
    const email = normalizeEmail(process.env.ADMIN_EMAIL || "ADMIN001@university.edu");
    const password = process.env.ADMIN_PASSWORD;
    if (!emailMatchesRole(email, "admin") || typeof password !== "string" || Buffer.byteLength(password, "utf8") < 8 || Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("Set ADMIN_EMAIL to the authorized Admin email and ADMIN_PASSWORD to a password between 8 and 72 UTF-8 bytes in server/.env.");
    }
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "examora" });
    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.role !== "admin") throw new Error("The configured Admin email is already assigned to a non-admin account; no role was changed.");
      console.log("The configured Admin account already exists. No account or password was changed.");
      return;
    }
    await User.create({
      name: String(process.env.ADMIN_NAME || "Examora Administrator").trim().slice(0, 120),
      email,
      role: "admin",
      password: await bcrypt.hash(password, 12),
      isActive: true,
      isDeactivated: false,
    });
    console.log(`Created the initial Admin account for ${email}.`);
  } catch (error) {
    console.error("Admin seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

seedAdmin();
