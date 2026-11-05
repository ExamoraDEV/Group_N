const { normalizeEmail, emailMatchesRole, redirectForRole } = require("./emailPolicy");

function validLoginInput(email, password) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(normalizedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) && typeof password === "string" && password.length > 0);
}

async function authenticateCredentials({ User, bcrypt, email, password, env = process.env }) {
  if (!validLoginInput(email, password)) return null;
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select("+password");
  if (!user || typeof user.password !== "string") return null;
  if (!(await bcrypt.compare(password, user.password))) return null;
  const redirectPath = redirectForRole(user.role);
  if (!redirectPath || !emailMatchesRole(normalizedEmail, user.role, env)) return null;
  if (user.isDeactivated === true || user.isActive !== true) return { deactivated: true };
  return { user, redirectPath };
}

module.exports = { validLoginInput, authenticateCredentials };
