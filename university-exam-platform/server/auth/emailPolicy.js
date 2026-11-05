const ROLE_DESTINATIONS = Object.freeze({
  student: "/student/dashboard",
  lecturer: "/lecturer/dashboard",
  admin: "/admin/dashboard",
});

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function compilePattern(value, fallback) {
  try {
    // Force a whole-address match even when an environment value omits anchors.
    const source = value || fallback;
    return new RegExp(`^(?:${source})$`, "i");
  } catch {
    throw new Error("Authentication email pattern configuration is invalid.");
  }
}

function emailMatchesRole(email, role, env = process.env) {
  const normalizedEmail = normalizeEmail(email);
  if (role === "student") {
    return compilePattern(env.STUDENT_EMAIL_REGEX, "^22STD[A-Z0-9._-]+@university\\.edu$").test(normalizedEmail);
  }
  if (role === "lecturer") {
    return compilePattern(env.LECTURER_EMAIL_REGEX, "^LEC[A-Z0-9._-]+@university\\.edu$").test(normalizedEmail);
  }
  if (role === "admin") return normalizedEmail === normalizeEmail(env.ADMIN_EMAIL || "ADMIN001@university.edu");
  return false;
}

function redirectForRole(role) {
  return ROLE_DESTINATIONS[role] || null;
}

module.exports = { normalizeEmail, emailMatchesRole, redirectForRole };
