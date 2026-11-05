const ACTIVITY_THRESHOLD_DAYS = 30;

function isDeactivated(user) {
  return user?.isDeactivated === true || user?.isActive === false;
}

function activityStatus(user, now = new Date()) {
  if (isDeactivated(user)) return "deactivated";
  if (!user?.lastLoginAt) return "never_logged_in";
  const lastLogin = new Date(user.lastLoginAt).getTime();
  if (!Number.isFinite(lastLogin)) return "never_logged_in";
  return now.getTime() - lastLogin <= ACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 ? "active" : "inactive";
}

module.exports = { ACTIVITY_THRESHOLD_DAYS, isDeactivated, activityStatus };
