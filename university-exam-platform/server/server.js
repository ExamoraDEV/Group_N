
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const querystring = require("node:querystring");
require("dotenv").config();
const User = require("./models/User");
const studentRoutes = require("./routes/student");
const lecturerRoutes = require("./routes/lecturer");
const { startExamLifecycleWorker } = require("./services/examLifecycleWorker");
const { redirectForRole } = require("./auth/emailPolicy");
const { authenticateCredentials, validLoginInput } = require("./auth/loginService");
const {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  clearSessionCookie,
  hasJwtSecret,
  requireAuth,
  requireRole,
} = require("./middleware/auth");

const app = express();
const allowedOrigins = new Set(
  [
    process.env.CLIENT_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ].filter(Boolean)
);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

function isLocalDevelopmentOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isLocalDevelopmentOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
const sanitizeOptions = { replaceWith: "_" };
app.set("query parser", (query) =>
  mongoSanitize.sanitize(querystring.parse(query), sanitizeOptions)
);
app.use((req, res, next) => {
  ["body", "params", "headers"].forEach((key) => {
    if (req[key]) mongoSanitize.sanitize(req[key], sanitizeOptions);
  });
  next();
});
app.use(cookieParser());
app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/password", authLimiter);

app.get("/", (req, res) => {
  res.send("University Exam Platform API is running!");
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!hasJwtSecret()) {
    return res.status(503).json({ message: "Authentication is not configured." });
  }

  if (!validLoginInput(email, password)) {
    return res.status(400).json({
      message: "Email and password are required to sign in.",
    });
  }

  try {
    const authenticated = await authenticateCredentials({ User, bcrypt, email, password });
    if (authenticated?.deactivated) {
      return res.status(403).json({ code: "ACCOUNT_DEACTIVATED", message: "Your account has been deactivated by the administrator. You cannot access your account at the moment. Please contact the Examora administrator for assistance." });
    }
    if (!authenticated) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const { user: verifiedUser, redirectPath } = authenticated;
    const user = await User.findOneAndUpdate(
      { _id: verifiedUser._id, isActive: true, isDeactivated: { $ne: true } },
      { $set: { lastLoginAt: new Date() } },
      { new: true }
    ).select("name email role");
    if (!user) {
      return res.status(403).json({ code: "ACCOUNT_DEACTIVATED", message: "Your account has been deactivated by the administrator. You cannot access your account at the moment. Please contact the Examora administrator for assistance." });
    }

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "8h",
    });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    return res.json({
      success: true,
      message: "Signed in successfully.",
      redirectPath,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login request failed:", error.name);
    if (error.message === "Authentication email pattern configuration is invalid.") {
      return res.status(503).json({ message: "Authentication is temporarily unavailable." });
    }
    return res.status(500).json({ message: "Unable to sign in right now." });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
  };
  res.json({ success: true, user, ...user, redirectPath: redirectForRole(user.role) });
});

app.patch("/api/auth/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || newPassword.length < 10 || Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ message: "Enter your current password and a new password between 10 and 72 UTF-8 bytes." });
  }

  try {
    const user = await User.findById(req.user._id).select("+password");
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: "The current password is incorrect." });
    }
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Password update failed:", error.name);
    return res.status(500).json({ message: "Unable to update your password right now." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true, message: "Logged out successfully." });
});

app.use("/api/student", studentRoutes);
app.use("/api/lecturer", lecturerRoutes);
app.use("/api/admin", requireAuth, requireRole("admin"), require("./routes/admin"));

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found." });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from the .env file");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "examora",
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas connected successfully!");
    startExamLifecycleWorker();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start the server:", error.message);
    process.exit(1);
  }
}

startServer();
