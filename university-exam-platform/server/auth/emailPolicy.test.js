const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeEmail, emailMatchesRole, redirectForRole } = require("./emailPolicy");

test("normalizes email before exact lookup", () => {
  assert.equal(normalizeEmail("  LEC001@University.EDU  "), "lec001@university.edu");
});

test("accepts seeded student addresses and registration identifiers of varying lengths", () => {
  for (const email of ["22STD001@university.edu", "22STD002@university.edu", "22STD003@university.edu", "22STD1@university.edu", "22STD0000007A@university.edu"]) {
    assert.equal(emailMatchesRole(email, "student", {}), true, email);
  }
});

test("accepts seeded lecturer addresses and flexible lecturer identifiers", () => {
  for (const email of ["LEC001@university.edu", "LEC002@university.edu", "LEC003@university.edu", "LEC7A@university.edu"]) {
    assert.equal(emailMatchesRole(email, "lecturer", {}), true, email);
  }
});

test("rejects an email whose prefix convention disagrees with its database role", () => {
  assert.equal(emailMatchesRole("22STD001@university.edu", "lecturer", {}), false);
  assert.equal(emailMatchesRole("LEC001@university.edu", "student", {}), false);
  assert.equal(emailMatchesRole("someone@gmail.com", "student", {}), false);
  assert.equal(emailMatchesRole("LEC001@university.edu", "administrator", {}), false);
});

test("supports configured role patterns without fixed identifier lengths", () => {
  const config = {
    STUDENT_EMAIL_REGEX: "^STU-[A-Z0-9-]+@example\\.edu$",
    LECTURER_EMAIL_REGEX: "^STAFF-[A-Z0-9-]+@example\\.edu$",
  };
  assert.equal(emailMatchesRole("stu-2026-0001@example.edu", "student", config), true);
  assert.equal(emailMatchesRole("staff-A7@example.edu", "lecturer", config), true);
  assert.equal(emailMatchesRole("staff-A7@example.edu", "student", config), false);
  assert.equal(emailMatchesRole("prefix-stu-2026-0001@example.edu-suffix", "student", config), false);
});

test("server destination is determined only by the recognized database role", () => {
  assert.equal(redirectForRole("student"), "/student/dashboard");
  assert.equal(redirectForRole("lecturer"), "/lecturer/dashboard");
  assert.equal(redirectForRole("admin"), "/admin/dashboard");
});

test("only the configured Admin email is accepted for the admin role", () => {
  assert.equal(emailMatchesRole("ADMIN001@university.edu", "admin", {}), true);
  assert.equal(emailMatchesRole("someone@university.edu", "admin", {}), false);
  assert.equal(emailMatchesRole("configured@university.edu", "admin", { ADMIN_EMAIL: "configured@university.edu" }), true);
});

test("invalid configured regular expressions fail closed", () => {
  assert.throws(() => emailMatchesRole("22STD001@university.edu", "student", { STUDENT_EMAIL_REGEX: "[" }));
});
