const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { emailMatchesRole } = require("../auth/emailPolicy");

const COOKIE_NAME = "examora_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};

function hasJwtSecret() {
  return typeof process.env.JWT_SECRET === "string" && process.env.JWT_SECRET.length >= 32;
}

function clearSessionCookie(response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    secure: COOKIE_OPTIONS.secure,
    sameSite: COOKIE_OPTIONS.sameSite,
    path: COOKIE_OPTIONS.path,
  });
}

async function requireAuth(request, response, next) {
  if (!hasJwtSecret()) {
    return response.status(503).json({ message: "Authentication is not configured." });
  }

  const token = request.cookies?.[COOKIE_NAME];
  if (!token) {
    return response.status(401).json({ message: "Authentication required." });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    clearSessionCookie(response);
    return response.status(401).json({ message: "Session is invalid or expired." });
  }

  if (!mongoose.isValidObjectId(payload.sub)) {
    clearSessionCookie(response);
    return response.status(401).json({ message: "Session is invalid or expired." });
  }

  let user;
  try {
  user = await User.findById(payload.sub).select("name email role isActive isDeactivated studentId programme department lecturerId");
  } catch (error) {
    console.error("Authentication lookup failed:", error.name);
    return response.status(503).json({ message: "Authentication service is temporarily unavailable." });
  }

  if (user && (user.isDeactivated === true || user.isActive !== true)) {
    clearSessionCookie(response);
    return response.status(403).json({ code: "ACCOUNT_DEACTIVATED", message: "Your account has been deactivated by the administrator. You cannot access your account at the moment. Please contact the Examora administrator for assistance." });
  }
  if (!user) {
    clearSessionCookie(response);
    return response.status(401).json({ message: "Authentication required." });
  }

  let roleEmailMatches = false;
  try {
    roleEmailMatches = emailMatchesRole(user.email, user.role);
  } catch {
    console.error("Authentication email pattern configuration is invalid.");
    return response.status(503).json({ message: "Authentication is temporarily unavailable." });
  }
  if (!roleEmailMatches) {
    clearSessionCookie(response);
    return response.status(401).json({ message: "Session is invalid. Please sign in again." });
  }

  request.user = user;
  return next();
}

function requireRole(role) {
  return (request, response, next) => {
    if (request.user?.role !== role) {
      return response.status(403).json({ message: "You do not have permission to access this resource." });
    }
    return next();
  };
}

module.exports = {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  clearSessionCookie,
  hasJwtSecret,
  requireAuth,
  requireRole,
};
