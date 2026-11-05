require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const testAccountEmails = new Set([
  "22std001@university.edu",
  "22std002@university.edu",
  "22std003@university.edu",
  "lec001@university.edu",
  "lec002@university.edu",
  "lec003@university.edu",
]);

async function resetTestUserPassword() {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error("This password reset utility is disabled in production.");
    }

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from .env.");
    }

    const email = process.env.RESET_USER_EMAIL?.trim().toLowerCase();
    const password = process.env.RESET_USER_PASSWORD;

    if (!testAccountEmails.has(email)) {
      throw new Error("RESET_USER_EMAIL must be one of the six development test accounts.");
    }

    if (typeof password !== "string" || password.length < 8) {
      throw new Error("RESET_USER_PASSWORD must contain at least 8 characters.");
    }

    await mongoose.connect(process.env.MONGODB_URI, { dbName: "examora" });

    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("The selected test account does not exist.");
    }

    user.password = await bcrypt.hash(password, 12);
    await user.save();
    console.log("Password updated for the selected development test account.");
  } catch (error) {
    console.error("Test account password reset failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

resetTestUserPassword();
